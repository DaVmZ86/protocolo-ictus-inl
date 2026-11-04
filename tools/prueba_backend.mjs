#!/usr/bin/env node
/* =============================================================================
 * prueba_backend.mjs — Pruebas del backend (Apps Script) sin conexión a Google.
 *
 * Simula SpreadsheetApp, PropertiesService, UrlFetchApp, etc., carga
 * apps-script/Esquema.gs + Codigo.gs y recorre el flujo completo:
 * inicializar → login → aprobación → captura → edición → conflictos → exportación.
 *
 *   node tools/prueba_backend.mjs
 * ============================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CLIENT_ID = '1234567890-pruebaabc.apps.googleusercontent.com';
const PROPIETARIO = 'propietario@gmail.com';

// ---------------------------------------------------------------------------
// Simulación de Google Sheets
// ---------------------------------------------------------------------------
let FechaVM = Date; // se reemplaza por el Date del contexto de Apps Script simulado
const esDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
function encadenable(obj) {
  return new Proxy(obj, { get(t, p) { return p in t ? t[p] : () => encadenable(t); } });
}
class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = []; this.formatos = {}; this.maxFilas = 1000; this.maxCols = 26; }
  getName() { return this.nombre; }
  _v(r, c) { return (this.celdas[r - 1] || [])[c - 1]; }
  getLastRow() { for (let i = this.celdas.length; i >= 1; i--) if ((this.celdas[i - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i; return 0; }
  getLastColumn() { let m = 0; this.celdas.forEach((f) => { (f || []).forEach((v, j) => { if (v !== '' && v !== undefined && v !== null) m = Math.max(m, j + 1); }); }); return m; }
  getMaxRows() { return this.maxFilas; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(_c, n) { this.maxCols += n; }
  insertRowsAfter(_r, n) { this.maxFilas += n; }
  getRange(r, c, nr = 1, nc = 1) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > this.maxFilas || c + nc - 1 > this.maxCols)
      throw new Error(`Rango fuera de la hoja «${this.nombre}»: (${r},${c},${nr},${nc}) con máximo ${this.maxFilas}×${this.maxCols}`);
    return encadenable(new Rango(this, r, c, nr, nc));
  }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    if (r > this.maxFilas) this.maxFilas = r;
    if (vals.length > this.maxCols) this.maxCols = vals.length;
    this.getRange(r, 1, 1, vals.length).setValues([vals]);
  }
}
class Rango {
  constructor(h, r, c, nr, nc) { Object.assign(this, { h, r, c, nr, nc }); }
  _cada(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  getValues() {
    const out = Array.from({ length: this.nr }, () => Array(this.nc).fill(''));
    this._cada((r, c, i, j) => { const v = this.h._v(r, c); out[i][j] = v === undefined ? '' : v; });
    return out;
  }
  setValues(vals) {
    assert.equal(vals.length, this.nr, 'setValues: filas');
    vals.forEach((f) => assert.equal(f.length, this.nc, 'setValues: columnas'));
    this._cada((r, c, i, j) => {
      let v = vals[i][j];
      const fmt = this.h.formatos[`${r},${c}`] || '';
      // Igual que Sheets: una cadena con aspecto de fecha/hora se convierte salvo formato de texto '@'
      if (typeof v === 'string' && fmt !== '@') {
        if (/^\d{1,2}:\d{2}$/.test(v)) v = new FechaVM(1899, 11, 30, ...v.split(':').map(Number));
        else if (/^\d{4}-\d{2}-\d{2}/.test(v)) v = new FechaVM(v);
        else if (/^=/.test(v)) throw new Error('Se intentó escribir una fórmula: ' + v);
      }
      if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
      if (!this.h.celdas[r - 1]) this.h.celdas[r - 1] = [];
      this.h.celdas[r - 1][c - 1] = v;
    });
    return this;
  }
  setNumberFormat(f) { this._cada((r, c) => { this.h.formatos[`${r},${c}`] = f; }); return this; }
  setNumberFormats(fs) { this._cada((r, c, i, j) => { this.h.formatos[`${r},${c}`] = fs[i][j]; }); return this; }
  getNumberFormats() { const out = Array.from({ length: this.nr }, () => Array(this.nc).fill('')); this._cada((r, c, i, j) => { out[i][j] = this.h.formatos[`${r},${c}`] || ''; }); return out; }
}
class Libro {
  constructor() { this.hojas = [new Hoja('Hoja 1')]; this.tz = 'Etc/UTC'; }
  getId() { return 'libro-prueba'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/libro-prueba/edit'; }
  getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) ? encadenable(this.hojas.find((h) => h.nombre === n)) : null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return encadenable(h); }
  getSheets() { return this.hojas.map(encadenable); }
  deleteSheet(h) { this.hojas = this.hojas.filter((x) => x.nombre !== h.getName()); }
  getSpreadsheetTimeZone() { return this.tz; }
  setSpreadsheetTimeZone(tz) { this.tz = tz; }
  setActiveSheet() {}
  moveActiveSheet() {}
}

// ---------------------------------------------------------------------------
// Entorno de Apps Script simulado
// ---------------------------------------------------------------------------
function crearEntorno() {
  const libro = new Libro();
  const props = {};
  const correos = [];
  const usuarioEfectivo = { email: PROPIETARIO };
  const formatear = (fecha, tz, fmt) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(fecha).map((x) => [x.type, x.value]));
    return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  };
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => console.error('   [servidor]', ...a) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => libro,
      getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
      newDataValidation: () => encadenable({})
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props })
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => TZ, getEffectiveUser: () => ({ getEmail: () => usuarioEfectivo.email }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: formatear },
    UrlFetchApp: { fetch: (url, opc) => {
      assert.equal(url, 'https://oauth2.googleapis.com/tokeninfo');
      const tok = opc.payload.id_token; // formato de prueba: "tok|correo|aud|verificado|vencido"
      const [marca, email, aud = CLIENT_ID, ver = 'true', venc = '0'] = tok.split('|');
      if (marca !== 'tok') return { getResponseCode: () => 400, getContentText: () => '{"error":"invalid_token"}' };
      const exp = Math.floor(Date.now() / 1000) + (venc === '1' ? -10 : 3600);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ iss: 'https://accounts.google.com', aud, email, email_verified: ver, exp: String(exp), name: email.split('@')[0] }) };
    } },
    MailApp: { sendEmail: (m) => correos.push(m) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/prueba/exec' }) },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  FechaVM = vm.runInContext('Date', ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'apps-script/Esquema.gs'), 'utf8'), ctx, { filename: 'Esquema.gs' });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'apps-script/Codigo.gs'), 'utf8'), ctx, { filename: 'Codigo.gs' });
  const post = (cuerpo) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).getContent());
  return { ctx, libro, props, correos, post };
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------
let n = 0;
function prueba(nombre, fn) { fn(); n++; console.log('  ✓ ' + nombre); }

const { ctx, libro, props, correos, post } = crearEntorno();
const hoja = (nom) => libro.hojas.find((h) => h.nombre === nom);
const encabezado = (nom) => hoja(nom).celdas[0];
const EVC = ctx.EVC;

console.log(`Zona horaria de la prueba: ${TZ}`);

prueba('inicializar crea hojas, columnas y administrador', () => {
  ctx.inicializar();
  assert.deepEqual(libro.hojas.map((h) => h.nombre).sort(), ['Bitacora', 'Datos', 'Usuarios']);
  const enc = encabezado('Datos');
  assert.equal(enc.length, EVC.campos().length + 4);
  assert.equal(enc[0], 'folio');
  assert.ok(hoja('Datos').maxCols >= enc.length);
  assert.equal(props.PROPIETARIO, PROPIETARIO);
  const usuarios = hoja('Usuarios').celdas;
  assert.equal(usuarios[1][0], PROPIETARIO);
  assert.equal(usuarios[1][2], 'aprobado');
  assert.equal(usuarios[1][3], 'admin');
});

prueba('inicializar es idempotente', () => {
  ctx.inicializar();
  assert.equal(encabezado('Datos').length, EVC.campos().length + 4);
  assert.equal(hoja('Usuarios').getLastRow(), 2);
});

prueba('doGet responde', () => {
  assert.equal(JSON.parse(ctx.doGet().getContent()).ok, true);
});

prueba('sin Client ID → NO_CONFIGURADO', () => {
  assert.equal(post({ accion: 'login', datos: { idToken: 'tok|' + PROPIETARIO } }).error, 'NO_CONFIGURADO');
  props.CLIENT_ID = CLIENT_ID;
});

prueba('tokens inválidos se rechazan', () => {
  assert.equal(post({ accion: 'login', datos: { idToken: 'basura' } }).error, 'TOKEN_INVALIDO');
  assert.equal(post({ accion: 'login', datos: { idToken: 'tok|x@gmail.com|otra-app' } }).error, 'TOKEN_INVALIDO');
  assert.equal(post({ accion: 'login', datos: { idToken: 'tok|x@gmail.com|' + CLIENT_ID + '|false' } }).error, 'TOKEN_INVALIDO');
  assert.equal(post({ accion: 'login', datos: { idToken: 'tok|x@gmail.com|' + CLIENT_ID + '|true|1' } }).error, 'TOKEN_INVALIDO');
  assert.equal(post({ accion: 'listarRegistros' }).error, 'SESION_INVALIDA');
  assert.equal(post({ accion: 'listarRegistros', sesion: 'a'.repeat(64) }).error, 'SESION_INVALIDA');
});

let sesAdmin, sesCap;
prueba('login del propietario → admin aprobado', () => {
  const r = post({ accion: 'login', datos: { idToken: 'tok|' + PROPIETARIO, appUrl: 'https://davmz86.github.io/protocolo-ictus-inl/' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.sesion, /^[a-f0-9]{64}$/);
  assert.equal(r.usuario.admin, true);
  assert.equal(r.usuario.estado, 'aprobado');
  assert.ok(r.hojaUrl);
  assert.equal(props.APP_URL, 'https://davmz86.github.io/protocolo-ictus-inl/');
  sesAdmin = r.sesion;
});

prueba('usuario nuevo queda pendiente y se avisa al administrador', () => {
  const r = post({ accion: 'login', datos: { idToken: 'tok|Residente@Gmail.com' } });
  assert.equal(r.ok, true);
  assert.equal(r.usuario.email, 'residente@gmail.com');
  assert.equal(r.usuario.estado, 'pendiente');
  assert.equal(r.usuario.admin, false);
  assert.equal(r.hojaUrl, undefined);
  sesCap = r.sesion;
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, PROPIETARIO);
  assert.match(correos[0].body, /usuarios/);
  assert.equal(post({ accion: 'listarRegistros', sesion: sesCap }).error, 'NO_APROBADO');
  assert.equal(post({ accion: 'estado', sesion: sesCap }).usuario.estado, 'pendiente');
});

prueba('un capturista no puede administrar', () => {
  assert.equal(post({ accion: 'login', datos: { idToken: 'tok|residente@gmail.com' } }).ok, true);
  assert.equal(correos.length, 1, 'no se reenvía aviso en el segundo inicio de sesión');
});

prueba('el administrador aprueba al residente', () => {
  const lista = post({ accion: 'listarUsuarios', sesion: sesAdmin });
  assert.equal(lista.usuarios.length, 2);
  const r = post({ accion: 'actualizarUsuario', sesion: sesAdmin, datos: { email: 'residente@gmail.com', estado: 'aprobado' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.usuarios.find((u) => u.email === 'residente@gmail.com').estado, 'aprobado');
  assert.equal(correos.length, 2);
  assert.equal(correos[1].to, 'residente@gmail.com');
  assert.equal(post({ accion: 'actualizarUsuario', sesion: sesAdmin, datos: { email: PROPIETARIO, estado: 'rechazado' } }).error, 'NO_PERMITIDO');
  assert.equal(post({ accion: 'actualizarUsuario', sesion: sesAdmin, datos: { email: 'residente@gmail.com', estado: 'jefe' } }).error, 'VALIDACION');
  assert.equal(post({ accion: 'listarUsuarios', sesion: sesCap }).error, 'NO_PERMITIDO');
  assert.equal(post({ accion: 'exportar', sesion: sesCap }).error, 'NO_PERMITIDO');
});

const ejemplo = {
  folio: 'evc-001', fecha_llenado: '2026-05-02', fase: 2,
  inc1_edad18: 1, inc2_evc_tc: 1, inc3_bh: 1, inc4_nihss: 1, inc5_mrs_disp: 1,
  noinc6_hemorragico: 0, noinc7_infeccion: 0, noinc8_inmuno: 0, noinc9_incompletos: 0,
  edad: 67, sexo: 1, escolaridad: 1, estado_civil: 1, ocupacion: 3,
  has: 1, dm2: 1, dislipidemia: 0, fa: 0, cardiopatia_isq: 0, erc: 0, tabaquismo: 0, alcohol: 0,
  fecha_evento: '2026-04-30', hora_inicio: '23:15', fecha_admision: '2026-05-01', hora_admision: '01:05',
  tas: 168, tad: 94, tc_confirmada: 1, fecha_tc: '2026-05-01', nihss: 12,
  fecha_muestra: '2026-05-01', hora_muestra: '02:00', leucocitos: 11.2, neutrofilos: 7.01, linfocitos: 2,
  plaquetas: 251, glucosa: 182.5, col_total: 190, hdl: 38, ldl: 120, trigliceridos: 160,
  trombolisis: 0, t_puerta_aguja: 45, fecha_egreso: '2026-05-08', mort_intrahosp: 0,
  observaciones: '=SUMA(A1) texto que no debe ser fórmula', nlr: 99, dictamen: 3, campo_inventado: 'x'
};

let version;
prueba('siguienteFolio y alta de un registro', () => {
  assert.equal(post({ accion: 'siguienteFolio', sesion: sesCap }).folio, 'EVC-001');
  const r = post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: ejemplo, nuevo: true } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const g = r.registro;
  assert.equal(g.folio, 'EVC-001');
  assert.equal(g.nlr, 3.51, 'NLR 7,01/2 = 3,505 → 3,51 (redondeo mitad hacia arriba)');
  assert.equal(g.nlr_cat, 1);
  assert.equal(g.nihss_cat, 2);
  assert.equal(g.t_sintomas_puerta, 110, 'cruza la medianoche');
  assert.equal(g.fecha_teorica_90, '2026-07-29');
  assert.equal(g.ventana_inicio, '2026-07-15');
  assert.equal(g.ventana_fin, '2026-08-12');
  assert.equal(g.dictamen, 1, 'el dictamen lo calcula el servidor, no el cliente');
  assert.equal(g.t_puerta_aguja, null, 'sin trombólisis se borra el tiempo puerta-aguja');
  assert.equal(g.campo_inventado, undefined);
  assert.equal(g.creado_por, 'residente@gmail.com');
  version = r.version;
  assert.equal(post({ accion: 'siguienteFolio', sesion: sesCap }).folio, 'EVC-002');
});

prueba('la fila en «Datos» tiene tipos correctos (fechas reales, horas como texto)', () => {
  const enc = encabezado('Datos');
  const fila = hoja('Datos').celdas[1];
  const col = (n) => fila[enc.indexOf(n)];
  assert.ok(esDate(col('fecha_evento')));
  assert.equal(ctx.Utilities.formatDate(col('fecha_evento'), TZ, 'yyyy-MM-dd'), '2026-04-30');
  assert.equal(col('hora_inicio'), '23:15');
  assert.equal(typeof col('nlr'), 'number');
  assert.equal(col('t_puerta_aguja'), '');
  assert.equal(col('observaciones'), '=SUMA(A1) texto que no debe ser fórmula');
  assert.equal(col('fecha_modificacion'), version);
  assert.equal(hoja('Datos').formatos[`2,${enc.indexOf('hora_inicio') + 1}`], '@');
});

prueba('obtenerRegistro devuelve exactamente lo guardado', () => {
  const r = post({ accion: 'obtenerRegistro', sesion: sesAdmin, datos: { folio: 'evc-001' } });
  assert.equal(r.ok, true);
  assert.equal(r.version, version);
  for (const c of EVC.campos()) {
    const esperado = (c.calculado || c.autocalc) ? undefined : (ejemplo[c.id] === undefined || c.id === 't_puerta_aguja' ? null : ejemplo[c.id]);
    if (esperado === undefined) continue;
    const valor = c.id === 'folio' ? 'EVC-001' : esperado;
    assert.deepEqual(r.registro[c.id], valor, c.id);
  }
});

prueba('folio duplicado, conflicto de versión y edición correcta', () => {
  assert.equal(post({ accion: 'guardarRegistro', sesion: sesAdmin, datos: { registro: ejemplo, nuevo: true } }).error, 'FOLIO_DUPLICADO');
  const seguimiento = { ...ejemplo, fecha_eval: '2026-07-30', fuente_info: 3, consentimiento_verbal: 1, mrs_90: 4, mort_90: 0, elim10_perdida: 0, elim11_def_no_rel: 0 };
  const ok = post({ accion: 'guardarRegistro', sesion: sesAdmin, datos: { registro: seguimiento, nuevo: false, version } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.registro.mrs_dic, 1);
  assert.equal(ok.registro.dia_eval, 91);
  assert.equal(ok.registro.eval_en_ventana, 1);
  assert.equal(ok.registro.creado_por, 'residente@gmail.com');
  assert.equal(ok.registro.modificado_por, PROPIETARIO);
  const viejo = post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: seguimiento, nuevo: false, version } });
  assert.equal(viejo.error, 'CONFLICTO_VERSION');
  assert.equal(hoja('Datos').getLastRow(), 2, 'sigue habiendo un solo registro');
});

prueba('errores de validación impiden guardar', () => {
  const r = post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: { ...ejemplo, folio: 'EVC-002', nihss: 50, edad: 70.5, sexo: 7, fecha_evento: '2026-02-30' }, nuevo: true } });
  assert.equal(r.error, 'VALIDACION');
  const campos = r.detalles.map((d) => d.campo).sort();
  assert.deepEqual(campos, ['edad', 'fecha_evento', 'nihss', 'sexo']);
  assert.equal(post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: { fase: 1 }, nuevo: true } }).error, 'VALIDACION');
  assert.equal(post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: { folio: 'PAC-1', fase: 1 }, nuevo: true } }).error, 'VALIDACION');
});

prueba('registro no incluido y lista con resumen', () => {
  const r = post({ accion: 'guardarRegistro', sesion: sesCap, datos: { registro: { folio: 'EVC-002', fase: 1, inc1_edad18: 1, noinc6_hemorragico: 1 }, nuevo: true } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.registro.dictamen, 2);
  const l = post({ accion: 'listarRegistros', sesion: sesCap });
  assert.equal(l.registros.length, 2);
  const r2 = l.registros.find((x) => x.folio === 'EVC-002');
  assert.equal(r2.completitud, 33, 'sólo cuenta identificación y criterios cuando no se incluye');
  assert.equal(EVC.estadoSeguimiento(l.registros.find((x) => x.folio === 'EVC-001'), '2026-08-01').codigo, 'completo');
});

prueba('exportar (admin) + CSV + sintaxis SPSS', () => {
  const r = post({ accion: 'exportar', sesion: sesAdmin });
  assert.equal(r.registros.length, 2);
  const spssCtx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(raiz, 'docs/js/esquema.js'), 'utf8'), spssCtx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'docs/js/spss.js'), 'utf8'), spssCtx);
  const csv = spssCtx.EVC_SPSS.generarCsv(r.registros).trim().split('\r\n');
  assert.equal(csv.length, 3);
  const enc = csv[0].split(',');
  assert.equal(enc.length, EVC.campos().length);
  const fila1 = csv[1];
  assert.ok(fila1.startsWith('"EVC-001",2026/05/02,2,'), fila1.slice(0, 40));
  assert.ok(fila1.includes(',3.51,1,'), 'NLR con 2 decimales y categoría');
  assert.ok(fila1.includes(',23:15,'), 'hora como hh:mm');
  const sps = spssCtx.EVC_SPSS.generarSintaxis('base.csv');
  assert.ok(sps.includes("/FILE='base.csv'"));
  for (const c of EVC.campos()) assert.ok(sps.includes('\n    ' + c.id + ' '), 'falta en GET DATA: ' + c.id);
  assert.ok(sps.split('\r\n').every((l) => l.length < 200), 'líneas de sintaxis cortas');
});

prueba('sesión vencida y cierre de sesión', () => {
  const k = 'S_' + sesCap;
  const s = JSON.parse(props[k]); s.x = Date.now() - 1; props[k] = JSON.stringify(s);
  assert.equal(post({ accion: 'listarRegistros', sesion: sesCap }).error, 'SESION_EXPIRADA');
  assert.equal(props[k], undefined, 'la sesión vencida se borra');
  assert.equal(post({ accion: 'logout', sesion: sesAdmin }).ok, true);
  assert.equal(post({ accion: 'estado', sesion: sesAdmin }).error, 'SESION_INVALIDA');
});

prueba('revocar acceso surte efecto inmediato', () => {
  const a = post({ accion: 'login', datos: { idToken: 'tok|' + PROPIETARIO } }).sesion;
  const c = post({ accion: 'login', datos: { idToken: 'tok|residente@gmail.com' } }).sesion;
  assert.equal(post({ accion: 'listarRegistros', sesion: c }).ok, true);
  post({ accion: 'actualizarUsuario', sesion: a, datos: { email: 'residente@gmail.com', estado: 'rechazado' } });
  assert.equal(post({ accion: 'listarRegistros', sesion: c }).error, 'NO_APROBADO');
});

prueba('columnas nuevas del esquema se agregan sin perder datos', () => {
  const h = hoja('Datos');
  const enc = h.celdas[0];
  const idx = enc.indexOf('observaciones');
  // Simula una hoja vieja a la que le falta la columna «observaciones» y tiene una columna propia del usuario
  h.celdas.forEach((f) => { f.splice(idx, 1); });
  h.celdas[0].push('nota_manual'); h.celdas[1][h.celdas[0].length - 1] = 'conservar';
  const a = post({ accion: 'login', datos: { idToken: 'tok|' + PROPIETARIO } }).sesion;
  const reg = post({ accion: 'obtenerRegistro', sesion: a, datos: { folio: 'EVC-001' } });
  const g = post({ accion: 'guardarRegistro', sesion: a, datos: { registro: { ...reg.registro, observaciones: 'nueva' }, nuevo: false, version: reg.version } });
  assert.equal(g.ok, true, JSON.stringify(g));
  const enc2 = h.celdas[0];
  assert.equal(enc2[enc2.length - 1], 'observaciones');
  assert.equal(h.celdas[1][enc2.indexOf('nota_manual')], 'conservar');
  assert.equal(h.celdas[1][enc2.indexOf('observaciones')], 'nueva');
});

console.log(`\n${n} pruebas superadas.`);
