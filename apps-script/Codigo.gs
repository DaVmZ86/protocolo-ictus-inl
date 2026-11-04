/**
 * @OnlyCurrentDoc
 */
/* =============================================================================
 * Codigo.gs — API (backend) de la cédula de recolección de datos
 * Protocolo PI-2026-7694 · EVC isquémico agudo e índice neutrófilo/linfocito
 *
 * Vive DENTRO de una hoja de cálculo de Google Sheets (Extensiones → Apps
 * Script) en el Google Drive del administrador y se publica como «Aplicación
 * web». Requiere también el archivo Esquema.gs (copia de docs/js/esquema.js).
 *
 * Seguridad
 *   · El usuario inicia sesión con Google en la página (GitHub Pages) y envía
 *     su ID token. Aquí se verifica con Google: firma, audiencia = CLIENT_ID,
 *     correo verificado y vigencia.
 *   · Se emite una sesión aleatoria (12 h) guardada en las propiedades del script.
 *   · Sólo usuarios con estado «aprobado» leen/escriben registros. Sólo los
 *     administradores aprueban usuarios y exportan la base.
 *   · Toda acción queda en la hoja «Bitacora».
 * ============================================================================= */

var HOJA_DATOS = 'Datos';
var HOJA_IDENT = 'Identificacion';
var HOJA_USUARIOS = 'Usuarios';
var HOJA_BITACORA = 'Bitacora';
var COLS_META = ['creado_por', 'fecha_creacion', 'modificado_por', 'fecha_modificacion'];
var COLS_USUARIOS = ['email', 'nombre', 'estado', 'rol', 'fecha_solicitud', 'fecha_decision', 'decidido_por', 'ultimo_acceso'];
var COLS_BITACORA = ['fecha', 'email', 'accion', 'folio', 'detalle'];
var ESTADOS = ['pendiente', 'aprobado'];      // un usuario rechazado o revocado se elimina de la lista
var ROLES = ['capturista', 'admin'];
var HORAS_SESION = 12;

// Archivos adjuntos (PDF, fotos, videos): una carpeta por folio dentro de CARPETA_ARCHIVOS
var CARPETA_ARCHIVOS = 'Cédula EVC - Archivos por registro';
var MAX_BYTES_ARCHIVO = 250 * 1024 * 1024;   // 250 MB por archivo
var TAM_FRAGMENTO = 4 * 1024 * 1024;         // 4 MB (múltiplo de 256 KB, requisito de Drive)
var EXT_PERMITIDAS = /\.(pdf|jpe?g|png|gif|webp|heic|heif|bmp|tiff?|mp4|mov|m4v|3gp|3g2|webm|avi|mkv)$/i;

function colsIdent_() { return ['folio'].concat(EVC.camposIdentificacion().map(function (c) { return c.id; })).concat(['modificado_por', 'fecha_modificacion']); }

/* -----------------------------------------------------------------------------
 * Menú de la hoja de cálculo
 * --------------------------------------------------------------------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Protocolo EVC')
    .addItem('1) Inicializar / reparar hojas', 'inicializar')
    .addItem('2) Configurar Client ID de Google', 'configurarClientId')
    .addSeparator()
    .addItem('Ver configuración', 'verConfiguracion')
    .addToUi();
}

/** Crea (o repara) las hojas Datos, Usuarios y Bitacora y registra al propietario como administrador. */
function inicializar() {
  var ss = libro_();
  var props = PropertiesService.getScriptProperties();
  var tz = Session.getScriptTimeZone();
  if (ss.getSpreadsheetTimeZone() !== tz) ss.setSpreadsheetTimeZone(tz);
  var propietario = String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (propietario) props.setProperty('PROPIETARIO', propietario);

  var datos = obtenerHoja_(ss, HOJA_DATOS);
  var ident = obtenerHoja_(ss, HOJA_IDENT);
  var usuarios = obtenerHoja_(ss, HOJA_USUARIOS);
  var bitacora = obtenerHoja_(ss, HOJA_BITACORA);
  darFormatoDatos_(datos);
  var encI = asegurarEncabezados_(ident, colsIdent_());
  ident.getRange(2, 1, Math.max(ident.getMaxRows() - 1, 1), encI.length).setNumberFormat('@');
  ident.setTabColor('#b42318');
  var encU = asegurarEncabezados_(usuarios, COLS_USUARIOS);
  usuarios.getRange(2, 1, Math.max(usuarios.getMaxRows() - 1, 1), encU.length).setNumberFormat('@');
  var encB = asegurarEncabezados_(bitacora, COLS_BITACORA);
  bitacora.getRange(2, 1, Math.max(bitacora.getMaxRows() - 1, 1), encB.length).setNumberFormat('@');

  [datos, ident, usuarios, bitacora].forEach(function (h) {
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, h.getLastColumn()).setFontWeight('bold').setBackground('#dff3ef');
  });

  try {
    var filasU = Math.max(usuarios.getMaxRows() - 1, 1);
    usuarios.getRange(2, encU.indexOf('estado') + 1, filasU, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).setAllowInvalid(false).build());
    usuarios.getRange(2, encU.indexOf('rol') + 1, filasU, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).setAllowInvalid(false).build());
  } catch (e) { console.warn('No se aplicaron listas desplegables: ' + e); }

  if (propietario) {
    var u = buscarUsuario_(propietario) || { email: propietario, nombre: 'Administrador (propietario)', fecha_solicitud: ahora_(), ultimo_acceso: '' };
    u.estado = 'aprobado';
    u.rol = 'admin';
    u.fecha_decision = u.fecha_decision || ahora_();
    u.decidido_por = u.decidido_por || 'inicializar';
    guardarUsuario_(u);
  }

  // Usuarios con estado «rechazado» de versiones anteriores: se eliminan de la lista.
  purgarRechazados_(propietario || 'inicializar');

  // Carpeta de archivos adjuntos (junto a la hoja) y acceso de lectura para los usuarios aprobados.
  var raiz = carpetaRaiz_(true);
  leerUsuarios_().forEach(function (x) { if (x.estado === 'aprobado' && x.email !== propietario) compartirArchivos_(x.email, true); });

  // Elimina hojas vacías sobrantes (p. ej. «Hoja 1») y deja «Datos» al inicio.
  ss.getSheets().forEach(function (h) {
    var propia = [HOJA_DATOS, HOJA_IDENT, HOJA_USUARIOS, HOJA_BITACORA].indexOf(h.getName()) >= 0;
    if (!propia && h.getLastRow() === 0 && h.getLastColumn() === 0 && ss.getSheets().length > 4) ss.deleteSheet(h);
  });
  ss.setActiveSheet(datos);
  ss.moveActiveSheet(1);
  bitacora_(propietario || 'sistema', 'inicializar', '', 'esquema v' + EVC.ESQUEMA.version);

  avisar_('Listo: hojas «Datos», «Identificacion», «Usuarios» y «Bitacora» preparadas.\n\n' +
    'Administrador: ' + (propietario || '(desconocido)') + '\n' +
    'Carpeta de archivos: ' + raiz.getName() + '\n\n' +
    'Siguiente paso: menú Protocolo EVC → 2) Configurar Client ID de Google.');
}

/** Guarda el Client ID de OAuth (Google Cloud) en las propiedades del script. */
function configurarClientId() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var actual = props.getProperty('CLIENT_ID') || '(sin configurar)';
  var r = ui.prompt('Client ID de Google',
    'Pegue el «ID de cliente» OAuth (termina en .apps.googleusercontent.com).\n\nActual: ' + actual,
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = r.getResponseText().trim();
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(v)) {
    ui.alert('El valor no parece un Client ID válido. Debe verse como 1234567890-abc123def.apps.googleusercontent.com');
    return;
  }
  props.setProperty('CLIENT_ID', v);
  ui.alert('Client ID guardado.\n\nSi aún no lo ha hecho, publique la aplicación web: botón Implementar → Nueva implementación → Aplicación web.');
}

/** Muestra la configuración actual. */
function verConfiguracion() {
  var p = PropertiesService.getScriptProperties();
  var urlServicio = '';
  try { urlServicio = ScriptApp.getService().getUrl() || ''; } catch (e) { /* sin implementación */ }
  var regs = 0, usuarios = 0, sesiones = 0;
  try { regs = leerRegistros_().length; usuarios = leerUsuarios_().length; } catch (e) { /* sin inicializar */ }
  Object.keys(p.getProperties()).forEach(function (k) { if (k.indexOf('S_') === 0) sesiones++; });
  avisar_('Configuración actual\n\n' +
    'Client ID: ' + (p.getProperty('CLIENT_ID') || '(sin configurar)') + '\n' +
    'Propietario / administrador: ' + (p.getProperty('PROPIETARIO') || '(ejecute Inicializar)') + '\n' +
    'URL de la aplicación (GitHub Pages): ' + (p.getProperty('APP_URL') || '(se registra al primer inicio de sesión del administrador)') + '\n' +
    'URL de la API (Apps Script): ' + (urlServicio || '(aún no publicada)') + '\n\n' +
    'Registros: ' + regs + ' · Usuarios: ' + usuarios + ' · Sesiones activas: ' + sesiones + '\n' +
    'Versión del esquema: ' + EVC.ESQUEMA.version);
}

/* -----------------------------------------------------------------------------
 * Puntos de entrada de la aplicación web
 * --------------------------------------------------------------------------- */
function doGet() {
  return json_({ ok: true, servicio: 'API cédula EVC/NLR', version: EVC.ESQUEMA.version,
    mensaje: 'La API está activa. Use la aplicación web para capturar datos.' });
}

function doPost(e) {
  var res;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = ejecutar_(req);
  } catch (err) {
    if (!err.codigo) console.error(err && err.stack ? err.stack : err);
    res = { ok: false, error: err.codigo || 'ERROR_INTERNO', mensaje: err.codigo ? err.message : 'Error interno del servidor: ' + err.message };
  }
  return json_(res);
}

function ejecutar_(req) {
  var accion = String(req.accion || '');
  var datos = req.datos || {};
  if (accion === 'login') return login_(datos);

  var email = validarSesion_(req.sesion);
  if (accion === 'logout') { cerrarSesion_(req.sesion); return { ok: true }; }
  var u = buscarUsuario_(email);
  if (!u) throw error_('SESION_INVALIDA', 'Usuario no registrado.');
  if (accion === 'estado') return respuestaUsuario_(u);
  if (u.estado !== 'aprobado') throw error_('NO_APROBADO', 'Tu cuenta aún no ha sido aprobada por el administrador.');

  switch (accion) {
    case 'listarRegistros':
      return { ok: true, registros: leerRegistros_().map(function (x) { return EVC.resumen(x.registro); }) };
    case 'obtenerRegistro':
      return obtenerRegistro_(datos);
    case 'siguienteFolio':
      return { ok: true, folio: EVC.siguienteFolio(leerRegistros_().map(function (x) { return x.registro.folio; })) };
    case 'guardarRegistro':
      return guardarRegistro_(u, datos);
    case 'listarArchivos':
      return listarArchivos_(datos);
    case 'iniciarSubida':
      return iniciarSubida_(u, datos);
    case 'subirFragmento':
      return subirFragmento_(u, datos);
    case 'estadoSubida':
      return estadoSubida_(u, datos);
    case 'eliminarArchivo':
      return eliminarArchivo_(u, datos);
  }

  if (!esAdmin_(u)) throw error_('NO_PERMITIDO', 'Sólo un administrador puede realizar esta acción.');
  switch (accion) {
    case 'listarUsuarios':
      purgarRechazados_(u.email);
      return { ok: true, usuarios: leerUsuarios_().map(publico_) };
    case 'actualizarUsuario':
      return actualizarUsuario_(u, datos);
    case 'eliminarUsuario':
      return eliminarUsuario_(u, datos);
    case 'exportar':
      bitacora_(u.email, 'exportar', '', '');
      // La base de análisis nunca incluye los datos de localización del paciente.
      return { ok: true, registros: leerRegistros_().map(function (x) { return EVC.sinIdentificadores(x.registro); }) };
  }
  throw error_('ACCION_DESCONOCIDA', 'Acción no reconocida: ' + accion);
}

/* -----------------------------------------------------------------------------
 * Autenticación y sesiones
 * --------------------------------------------------------------------------- */
function login_(datos) {
  var info = verificarIdToken_(datos.idToken);
  var props = PropertiesService.getScriptProperties();
  var propietario = props.getProperty('PROPIETARIO');
  var esPropietario = info.email === propietario;
  var nuevo = false, u;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw error_('OCUPADO', 'El servidor está ocupado; intente de nuevo.');
  try {
    u = buscarUsuario_(info.email);
    if (!u) {
      nuevo = true;
      u = { email: info.email, nombre: info.nombre, estado: esPropietario ? 'aprobado' : 'pendiente',
        rol: esPropietario ? 'admin' : 'capturista', fecha_solicitud: ahora_(), fecha_decision: '', decidido_por: '' };
    }
    if (info.nombre) u.nombre = info.nombre;
    u.ultimo_acceso = ahora_();
    guardarUsuario_(u);
  } finally { lock.releaseLock(); }

  purgarSesiones_();
  var sesion = crearSesion_(info.email);
  bitacora_(info.email, 'login', '', nuevo ? 'solicitud de acceso' : u.estado);
  if (nuevo && u.estado === 'pendiente') notificarAdmins_(u);
  var appUrl = String(datos.appUrl || '');
  if (esAdmin_(u) && /^(https:\/\/|http:\/\/localhost[:\/])/.test(appUrl)) props.setProperty('APP_URL', appUrl.slice(0, 300));

  var r = respuestaUsuario_(u);
  r.sesion = sesion;
  return r;
}

function verificarIdToken_(idToken) {
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId) throw error_('NO_CONFIGURADO', 'Falta configurar el Client ID (menú Protocolo EVC de la hoja).');
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) throw error_('TOKEN_INVALIDO', 'Token ausente o inválido.');
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'post', payload: { id_token: idToken }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw error_('TOKEN_INVALIDO', 'Google no validó el inicio de sesión.');
  var t = JSON.parse(resp.getContentText());
  var emisorOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== clientId || !emisorOk) throw error_('TOKEN_INVALIDO', 'El inicio de sesión no corresponde a esta aplicación.');
  if (String(t.email_verified) !== 'true' || !t.email) throw error_('TOKEN_INVALIDO', 'El correo de la cuenta no está verificado.');
  if (Number(t.exp) * 1000 < Date.now()) throw error_('TOKEN_INVALIDO', 'El inicio de sesión expiró.');
  return { email: String(t.email).toLowerCase().trim(), nombre: String(t.name || '') };
}

function crearSesion_(email) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  PropertiesService.getScriptProperties().setProperty('S_' + token,
    JSON.stringify({ e: email, x: Date.now() + HORAS_SESION * 3600 * 1000 }));
  return token;
}

function validarSesion_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) throw error_('SESION_INVALIDA', 'Inicie sesión de nuevo.');
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('S_' + token);
  if (!raw) throw error_('SESION_INVALIDA', 'Inicie sesión de nuevo.');
  var s = JSON.parse(raw);
  if (s.x < Date.now()) { props.deleteProperty('S_' + token); throw error_('SESION_EXPIRADA', 'La sesión expiró; inicie sesión de nuevo.'); }
  return s.e;
}

function cerrarSesion_(token) {
  if (token && /^[a-f0-9]{64}$/.test(String(token))) PropertiesService.getScriptProperties().deleteProperty('S_' + token);
}

function purgarSesiones_() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var ahora = Date.now();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(todas[k]).x < ahora) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/* -----------------------------------------------------------------------------
 * Usuarios
 * --------------------------------------------------------------------------- */
function esAdmin_(u) {
  if (!u) return false;
  var propietario = PropertiesService.getScriptProperties().getProperty('PROPIETARIO');
  return u.email === propietario || (u.estado === 'aprobado' && u.rol === 'admin');
}

function publico_(u) {
  var propietario = PropertiesService.getScriptProperties().getProperty('PROPIETARIO');
  return { email: u.email, nombre: u.nombre || '', estado: u.estado, rol: u.rol, fecha_solicitud: u.fecha_solicitud || '',
    fecha_decision: u.fecha_decision || '', ultimo_acceso: u.ultimo_acceso || '', propietario: u.email === propietario };
}

function respuestaUsuario_(u) {
  var r = { ok: true, usuario: publico_(u) };
  r.usuario.admin = esAdmin_(u);
  if (r.usuario.admin) {
    r.hojaUrl = libro_().getUrl();
    r.pendientes = leerUsuarios_().filter(function (x) { return x.estado === 'pendiente'; }).length;
  }
  return r;
}

function hojaUsuarios_() {
  var h = libro_().getSheetByName(HOJA_USUARIOS);
  if (!h) throw error_('NO_INICIALIZADO', 'Ejecute «Inicializar» en el menú Protocolo EVC de la hoja.');
  return h;
}

function leerUsuarios_() {
  var h = hojaUsuarios_();
  var lr = h.getLastRow();
  if (lr < 2) return [];
  var vals = h.getRange(1, 1, lr, h.getLastColumn()).getValues();
  var enc = vals[0].map(function (x) { return String(x).trim(); });
  return vals.slice(1).map(function (fila, i) {
    var u = { _fila: i + 2 };
    enc.forEach(function (n, j) { if (n) u[n] = fila[j] instanceof Date ? Utilities.formatDate(fila[j], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(fila[j]).trim(); });
    u.email = String(u.email || '').toLowerCase();
    u.estado = String(u.estado || '').toLowerCase();
    u.rol = String(u.rol || '').toLowerCase();
    return u;
  }).filter(function (u) { return u.email; });
}

function buscarUsuario_(email) {
  email = String(email || '').toLowerCase().trim();
  return leerUsuarios_().filter(function (u) { return u.email === email; })[0] || null;
}

function guardarUsuario_(u) {
  var h = hojaUsuarios_();
  var enc = asegurarEncabezados_(h, COLS_USUARIOS);
  var previo = buscarUsuario_(u.email);
  var fila = previo ? previo._fila : Math.max(h.getLastRow(), 1) + 1;
  asegurarTamano_(h, fila, enc.length);
  var rango = h.getRange(fila, 1, 1, enc.length);
  var actuales = previo ? rango.getValues()[0] : [];
  var valores = enc.map(function (n, j) {
    if (COLS_USUARIOS.indexOf(n) >= 0) return u[n] === undefined || u[n] === null ? '' : String(u[n]);
    return actuales[j] === undefined ? '' : actuales[j];
  });
  rango.setNumberFormat('@');
  rango.setValues([valores]);
}

function actualizarUsuario_(admin, datos) {
  if (datos.estado === 'rechazado') return eliminarUsuario_(admin, datos);   // compatibilidad: rechazar = eliminar
  var email = String(datos.email || '').toLowerCase().trim();
  var propietario = PropertiesService.getScriptProperties().getProperty('PROPIETARIO');
  if (email === propietario) throw error_('NO_PERMITIDO', 'No se puede modificar al propietario de la hoja.');
  if (email === admin.email) throw error_('NO_PERMITIDO', 'No puede modificar su propia cuenta.');
  if (datos.estado !== undefined && ESTADOS.indexOf(datos.estado) < 0) throw error_('VALIDACION', 'Estado no válido.');
  if (datos.rol !== undefined && ROLES.indexOf(datos.rol) < 0) throw error_('VALIDACION', 'Rol no válido.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw error_('OCUPADO', 'El servidor está ocupado; intente de nuevo.');
  var u, antes;
  try {
    u = buscarUsuario_(email);
    if (!u) throw error_('NO_EXISTE', 'No existe el usuario ' + email + '.');
    antes = u.estado;
    if (datos.estado !== undefined) u.estado = datos.estado;
    if (datos.rol !== undefined) u.rol = datos.rol;
    u.fecha_decision = ahora_();
    u.decidido_por = admin.email;
    guardarUsuario_(u);
  } finally { lock.releaseLock(); }

  bitacora_(admin.email, 'usuario', '', email + ' → ' + u.estado + ' / ' + u.rol);
  if (antes !== 'aprobado' && u.estado === 'aprobado') {
    compartirArchivos_(u.email, true);
    notificarAprobacion_(u);
  }
  return { ok: true, usuarios: leerUsuarios_().map(publico_) };
}

/** Rechaza una solicitud o revoca un acceso: la cuenta se elimina de la lista y pierde su sesión de inmediato. */
function eliminarUsuario_(admin, datos) {
  var email = String(datos.email || '').toLowerCase().trim();
  var propietario = PropertiesService.getScriptProperties().getProperty('PROPIETARIO');
  if (email === propietario) throw error_('NO_PERMITIDO', 'No se puede eliminar al propietario de la hoja.');
  if (email === admin.email) throw error_('NO_PERMITIDO', 'No puede eliminar su propia cuenta.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw error_('OCUPADO', 'El servidor está ocupado; intente de nuevo.');
  var u;
  try {
    u = buscarUsuario_(email);
    if (!u) throw error_('NO_EXISTE', 'No existe el usuario ' + email + '.');
    hojaUsuarios_().deleteRow(u._fila);
  } finally { lock.releaseLock(); }
  if (u.estado === 'aprobado') compartirArchivos_(email, false);
  bitacora_(admin.email, u.estado === 'aprobado' ? 'revocar acceso' : 'rechazar solicitud', '', email + ' (eliminado de la lista)');
  return { ok: true, usuarios: leerUsuarios_().map(publico_) };
}

/** Elimina filas con estado «rechazado» (versiones anteriores las conservaban). */
function purgarRechazados_(quien) {
  var h = hojaUsuarios_();
  var rechazados = leerUsuarios_().filter(function (x) { return x.estado === 'rechazado'; });
  rechazados.sort(function (a, b) { return b._fila - a._fila; }).forEach(function (x) {
    h.deleteRow(x._fila);
    bitacora_(quien, 'rechazar solicitud', '', x.email + ' (eliminado de la lista)');
  });
}

/* -----------------------------------------------------------------------------
 * Registros (hoja «Datos»)
 * --------------------------------------------------------------------------- */
function columnasDatos_() { return EVC.columnas().concat(COLS_META); }

function hojaDatos_() {
  var h = libro_().getSheetByName(HOJA_DATOS);
  if (!h) throw error_('NO_INICIALIZADO', 'Ejecute «Inicializar» en el menú Protocolo EVC de la hoja.');
  return h;
}

function leerRegistros_() {
  var h = hojaDatos_();
  var lr = h.getLastRow(), lc = h.getLastColumn();
  if (lr < 2) return [];
  var vals = h.getRange(1, 1, lr, lc).getValues();
  var enc = vals[0].map(function (x) { return String(x).trim(); });
  var tz = Session.getScriptTimeZone();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = filaARegistro_(enc, vals[i], tz);
    if (r.folio) out.push({ fila: i + 1, registro: r, valores: vals[i] });
  }
  return out;
}

function obtenerRegistro_(datos) {
  var folio = String(datos.folio || '').toUpperCase().trim();
  var x = leerRegistros_().filter(function (y) { return y.registro.folio === folio; })[0];
  if (!x) throw error_('NO_EXISTE', 'No existe el folio ' + folio + '.');
  var idn = leerIdentificacion_(folio);
  if (idn) EVC.camposIdentificacion().forEach(function (c) { x.registro[c.id] = idn.datos[c.id] || null; });
  return { ok: true, registro: x.registro, version: x.registro.fecha_modificacion || '' };
}

/* -----------------------------------------------------------------------------
 * Datos de localización del paciente (hoja «Identificacion», separada de «Datos»)
 * --------------------------------------------------------------------------- */
function hojaIdent_() {
  var ss = libro_();
  var h = ss.getSheetByName(HOJA_IDENT);
  if (!h) {
    h = ss.insertSheet(HOJA_IDENT);
    asegurarEncabezados_(h, colsIdent_());
    h.setTabColor('#b42318');
  }
  return h;
}

function leerIdentificacion_(folio) {
  var h = hojaIdent_();
  var lr = h.getLastRow();
  if (lr < 2) return null;
  var vals = h.getRange(1, 1, lr, h.getLastColumn()).getValues();
  var enc = vals[0].map(function (x) { return String(x).trim(); });
  var iF = enc.indexOf('folio');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][iF]).toUpperCase().trim() !== folio) continue;
    var d = {};
    enc.forEach(function (n, j) { if (n) d[n] = vals[i][j] === '' ? null : String(vals[i][j]); });
    return { fila: i + 1, datos: d, valores: vals[i] };
  }
  return null;
}

function guardarIdentificacion_(r, email, ahora) {
  var ids = EVC.camposIdentificacion();
  var previo = leerIdentificacion_(r.folio);
  if (!previo && ids.every(function (c) { return EVC.vacio(r[c.id]); })) return;   // nada que guardar
  var h = hojaIdent_();
  var enc = asegurarEncabezados_(h, colsIdent_());
  var fila = previo ? previo.fila : Math.max(h.getLastRow(), 1) + 1;
  asegurarTamano_(h, fila, enc.length);
  var valores = enc.map(function (n, j) {
    if (n === 'folio') return r.folio;
    if (n === 'modificado_por') return email;
    if (n === 'fecha_modificacion') return ahora;
    if (EVC.campo(n) && EVC.campo(n).identificador) return aCelda_(EVC.campo(n), r[n]);
    return previo && j < previo.valores.length ? previo.valores[j] : '';
  });
  var rango = h.getRange(fila, 1, 1, enc.length);
  rango.setNumberFormat('@');   // texto: conserva ceros a la izquierda del NSS y del teléfono
  rango.setValues([valores]);
}

function guardarRegistro_(u, datos) {
  var prep = EVC.prepararParaGuardar(datos.registro || {});
  if (prep.errores.length) return { ok: false, error: 'VALIDACION', mensaje: 'Hay errores en el formulario.', detalles: prep.errores };
  var r = prep.registro;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw error_('OCUPADO', 'El servidor está ocupado; intente de nuevo.');
  try {
    var hoja = hojaDatos_();
    var enc = asegurarEncabezados_(hoja, columnasDatos_());
    var previo = leerRegistros_().filter(function (y) { return y.registro.folio === r.folio; })[0] || null;
    if (datos.nuevo && previo) throw error_('FOLIO_DUPLICADO', 'Ya existe un registro con el folio ' + r.folio + '.');
    if (!datos.nuevo && !previo) throw error_('NO_EXISTE', 'No existe el folio ' + r.folio + '.');
    if (previo && String(previo.registro.fecha_modificacion || '') !== String(datos.version || ''))
      throw error_('CONFLICTO_VERSION', 'El registro fue modificado por ' + (previo.registro.modificado_por || 'otra persona') + ' mientras lo editaba.');

    var ahora = new Date().toISOString();
    r.creado_por = previo ? (previo.registro.creado_por || u.email) : u.email;
    r.fecha_creacion = previo ? (previo.registro.fecha_creacion || ahora) : ahora;
    r.modificado_por = u.email;
    r.fecha_modificacion = ahora;

    var fila = previo ? previo.fila : Math.max(hoja.getLastRow(), 1) + 1;
    escribirRegistro_(hoja, enc, fila, r, previo ? previo.valores : null);   // sólo columnas de «Datos»
    guardarIdentificacion_(r, u.email, ahora);                               // nombre, NSS, teléfono → «Identificacion»
    bitacora_(u.email, previo ? 'editar' : 'crear', r.folio, prep.advertencias.length ? prep.advertencias.length + ' advertencia(s)' : '');
  } finally { lock.releaseLock(); }

  return { ok: true, registro: r, version: r.fecha_modificacion, advertencias: prep.advertencias };
}

function escribirRegistro_(hoja, enc, fila, r, previos) {
  asegurarTamano_(hoja, fila, enc.length);
  var rango = hoja.getRange(fila, 1, 1, enc.length);
  var formatos = rango.getNumberFormats()[0];
  var valores = enc.map(function (nombre, j) {
    if (Object.prototype.hasOwnProperty.call(r, nombre)) {
      formatos[j] = formatoColumna_(nombre);
      return aCelda_(EVC.campo(nombre), r[nombre]);
    }
    return previos && j < previos.length ? previos[j] : '';   // conserva columnas ajenas al esquema
  });
  rango.setNumberFormats([formatos]);
  rango.setValues([valores]);
}

function filaARegistro_(enc, fila, tz) {
  var r = {};
  enc.forEach(function (nombre, j) {
    if (!nombre) return;
    var v = fila[j];
    var c = EVC.campo(nombre);
    if (c) r[nombre] = deCelda_(c, v, tz);
    else if (COLS_META.indexOf(nombre) >= 0) r[nombre] = v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : String(v));
  });
  EVC.campos().forEach(function (c) { if (!(c.id in r)) r[c.id] = null; });
  if (r.folio) r.folio = String(r.folio).toUpperCase().trim();
  return r;
}

/** Valor del registro → celda de la hoja. */
function aCelda_(c, v) {
  if (v === null || v === undefined || v === '') return '';
  if (!c) return String(v);
  switch (c.tipo) {
    case 'fecha':
      var p = String(v).split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    case 'numero':
    case 'opcion':
      return Number(v);
    default:
      var s = String(v);
      return /^[=+\-@]/.test(s) ? "'" + s : s;   // evita que se interprete como fórmula
  }
}

/** Celda de la hoja → valor del registro. */
function deCelda_(c, v, tz) {
  if (v === '' || v === null || v === undefined) return null;
  switch (c.tipo) {
    case 'fecha':
      if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      var s = String(v).trim();
      var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : s;
    case 'hora':
      if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
      var mh = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
      return mh ? ('0' + mh[1]).slice(-2) + ':' + mh[2] : String(v).trim();
    case 'numero':
    case 'opcion':
      if (typeof v === 'number') return v;
      var n = Number(String(v).trim().replace(',', '.'));
      return isFinite(n) ? n : null;
    default:
      return String(v);
  }
}

function formatoColumna_(nombre) {
  var c = EVC.campo(nombre);
  if (!c) return '@';
  switch (c.tipo) {
    case 'fecha': return 'yyyy-mm-dd';
    case 'numero': return c.decimales ? '0.' + new Array(c.decimales + 1).join('0') : '0';
    case 'opcion': return '0';
    default: return '@';
  }
}

function darFormatoDatos_(hoja) {
  var enc = asegurarEncabezados_(hoja, columnasDatos_());
  var filas = Math.max(hoja.getMaxRows() - 1, 1);
  enc.forEach(function (nombre, j) {
    if (nombre) hoja.getRange(2, j + 1, filas, 1).setNumberFormat(formatoColumna_(nombre));
  });
  hoja.getRange(1, 1, 1, enc.length).setNotes([enc.map(function (n) {
    var c = EVC.campo(n);
    if (!c) return '';
    var nota = c.etiqueta + (c.unidad ? ' (' + c.unidad + ')' : '') + (c.calculado ? ' — calculada' : '');
    if (c.opciones) nota += '\n' + c.opciones.map(function (o) { return o[0] + ' = ' + o[1]; }).join('\n');
    return nota;
  })]);
}

/* -----------------------------------------------------------------------------
 * Archivos adjuntos: carpeta «Cédula EVC - Archivos por registro» / <folio>
 *
 * El navegador envía el archivo en fragmentos de 4 MB; este script los pasa a
 * una «subida reanudable» de Google Drive. Así se admiten videos grandes y el
 * token de acceso del propietario nunca sale del servidor.
 * --------------------------------------------------------------------------- */
var MIME_POR_EXT = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
  webm: 'video/webm', avi: 'video/x-msvideo', mkv: 'video/x-matroska'
};

function carpetaRaiz_(crear) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ARCHIVOS_CARPETA');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* se borró: se crea otra */ }
  }
  if (!crear) return null;
  var padres = DriveApp.getFileById(libro_().getId()).getParents();
  var padre = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  var carpeta = padre.createFolder(CARPETA_ARCHIVOS);
  carpeta.setDescription('Archivos adjuntos de la cédula EVC/NLR: una subcarpeta por folio. Información confidencial.');
  props.setProperty('ARCHIVOS_CARPETA', carpeta.getId());
  return carpeta;
}

function carpetaFolio_(folio, crear) {
  var raiz = carpetaRaiz_(crear);
  if (!raiz) return null;
  var it = raiz.getFoldersByName(folio);
  while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) return c; }
  return crear ? raiz.createFolder(folio) : null;
}

/** Da (o quita) permiso de lectura de la carpeta de archivos a un usuario aprobado. */
function compartirArchivos_(email, dar) {
  try {
    var raiz = carpetaRaiz_(dar);
    if (!raiz) return;
    if (dar) raiz.addViewer(email); else raiz.removeViewer(email);
  } catch (e) { console.warn('Carpeta de archivos (' + email + '): ' + e); }
}

function describirArchivo_(f) {
  var m = /Subido por (\S+)/.exec(String(f.getDescription() || ''));
  return { id: f.getId(), nombre: f.getName(), tipo: f.getMimeType(), tamano: f.getSize(),
    fecha: Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    url: f.getUrl(), subidoPor: m ? m[1] : '' };
}

function listarArchivos_(datos) {
  var folio = String(datos.folio || '').toUpperCase().trim();
  var c = carpetaFolio_(folio, false);
  var out = [];
  if (c) {
    var it = c.getFiles();
    while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) out.push(describirArchivo_(f)); }
  }
  out.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  return { ok: true, archivos: out, carpetaUrl: c ? c.getUrl() : null };
}

function tipoArchivo_(tipo, nombre) {
  tipo = String(tipo || '').toLowerCase();
  if (tipo === 'application/pdf' || (/^image\//.test(tipo) && tipo.indexOf('svg') < 0) || /^video\//.test(tipo)) return tipo;
  var m = /\.([a-z0-9]+)$/i.exec(nombre || '');
  return m && MIME_POR_EXT[m[1].toLowerCase()] ? MIME_POR_EXT[m[1].toLowerCase()] : null;
}

function limpiarNombre_(n) {
  var s = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150);
  return s || 'archivo';
}

function cabecera_(resp, nombre) {
  var h = resp.getAllHeaders ? resp.getAllHeaders() : resp.getHeaders();
  for (var k in h) if (k.toLowerCase() === nombre) return Array.isArray(h[k]) ? h[k][0] : h[k];
  return null;
}

function iniciarSubida_(u, datos) {
  var folio = String(datos.folio || '').toUpperCase().trim();
  if (!leerRegistros_().some(function (x) { return x.registro.folio === folio; }))
    throw error_('NO_EXISTE', 'Guarde el registro ' + folio + ' antes de adjuntar archivos.');
  var nombre = limpiarNombre_(datos.nombre);
  var tipo = tipoArchivo_(datos.tipo, nombre);
  if (!tipo) throw error_('VALIDACION', 'Tipo de archivo no permitido («' + nombre + '»): sólo PDF, fotos o videos.');
  var total = Number(datos.tamano);
  if (!(total > 0)) throw error_('VALIDACION', 'El archivo «' + nombre + '» está vacío.');
  if (total > MAX_BYTES_ARCHIVO) throw error_('VALIDACION', '«' + nombre + '» supera el máximo de ' + Math.round(MAX_BYTES_ARCHIVO / 1048576) + ' MB.');
  var carpeta = carpetaFolio_(folio, true);
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ name: nombre, parents: [carpeta.getId()], mimeType: tipo, description: 'Subido por ' + u.email + ' · ' + folio }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(total) },
    muteHttpExceptions: true
  });
  var url = cabecera_(resp, 'location');
  if (resp.getResponseCode() !== 200 || !url) {
    console.error('Drive (iniciar subida): ' + resp.getResponseCode() + ' ' + resp.getContentText());
    throw error_('ERROR_DRIVE', 'Google Drive no aceptó la subida (código ' + resp.getResponseCode() + ').');
  }
  var id = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('U_' + id, JSON.stringify({ url: url, folio: folio, email: u.email, total: total, nombre: nombre }), 21600);
  return { ok: true, id: id, fragmento: TAM_FRAGMENTO };
}

function subidaPendiente_(u, id) {
  var raw = CacheService.getScriptCache().get('U_' + String(id || ''));
  var s = raw ? JSON.parse(raw) : null;
  if (!s || s.email !== u.email) throw error_('SUBIDA_INVALIDA', 'La subida expiró o no existe; vuelva a intentarlo.');
  return s;
}

function subirFragmento_(u, datos) {
  var s = subidaPendiente_(u, datos.id);
  var bytes = Utilities.base64Decode(String(datos.datos || ''));
  var ini = Number(datos.offset);
  var fin = ini + bytes.length - 1;
  if (!bytes.length || !(ini >= 0) || fin >= s.total) throw error_('VALIDACION', 'Fragmento de archivo inválido.');
  var r = UrlFetchApp.fetch(s.url, {
    method: 'put', payload: bytes, contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + ini + '-' + fin + '/' + s.total },
    muteHttpExceptions: true, followRedirects: false
  });
  return resultadoSubida_(u, datos.id, s, r);
}

/** Pregunta a Drive cuántos bytes recibió (para reanudar tras un corte de red). */
function estadoSubida_(u, datos) {
  var s = subidaPendiente_(u, datos.id);
  var r = UrlFetchApp.fetch(s.url, {
    method: 'put', headers: { 'Content-Range': 'bytes */' + s.total }, muteHttpExceptions: true, followRedirects: false
  });
  return resultadoSubida_(u, datos.id, s, r);
}

function resultadoSubida_(u, id, s, r) {
  var code = r.getResponseCode();
  if (code === 308) {
    var m = /bytes=0-(\d+)/.exec(cabecera_(r, 'range') || '');
    return { ok: true, completo: false, recibido: m ? Number(m[1]) + 1 : 0 };
  }
  if (code === 200 || code === 201) {
    CacheService.getScriptCache().remove('U_' + id);
    var f = DriveApp.getFileById(JSON.parse(r.getContentText()).id);
    bitacora_(u.email, 'adjuntar archivo', s.folio, s.nombre + ' (' + Math.max(1, Math.round(s.total / 1024)) + ' KB)');
    return { ok: true, completo: true, archivo: describirArchivo_(f) };
  }
  console.error('Drive (fragmento): ' + code + ' ' + r.getContentText());
  throw error_('ERROR_DRIVE', 'Google Drive respondió con el código ' + code + '. Intente de nuevo.');
}

/** Envía un adjunto a la papelera de Drive (recuperable 30 días). */
function eliminarArchivo_(u, datos) {
  var folio = String(datos.folio || '').toUpperCase().trim();
  var c = carpetaFolio_(folio, false);
  var f = null;
  try { f = DriveApp.getFileById(String(datos.id || '')); } catch (e) { f = null; }
  var dentro = false;
  if (c && f) { var ps = f.getParents(); while (ps.hasNext()) if (ps.next().getId() === c.getId()) dentro = true; }
  if (!dentro || f.isTrashed()) throw error_('NO_EXISTE', 'El archivo no pertenece a este registro.');
  var info = describirArchivo_(f);
  if (!esAdmin_(u) && info.subidoPor !== u.email) throw error_('NO_PERMITIDO', 'Sólo quien subió el archivo o un administrador puede eliminarlo.');
  f.setTrashed(true);
  bitacora_(u.email, 'eliminar archivo', folio, info.nombre + ' (a la papelera de Drive)');
  return listarArchivos_({ folio: folio });
}

/* -----------------------------------------------------------------------------
 * Utilidades de hojas
 * --------------------------------------------------------------------------- */
function libro_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw error_('NO_INICIALIZADO', 'El script debe crearse desde la hoja de cálculo (Extensiones → Apps Script).');
  return ss;
}

function obtenerHoja_(ss, nombre) { return ss.getSheetByName(nombre) || ss.insertSheet(nombre); }

function asegurarTamano_(hoja, filas, columnas) {
  if (hoja.getMaxColumns() < columnas) hoja.insertColumnsAfter(hoja.getMaxColumns(), columnas - hoja.getMaxColumns());
  if (hoja.getMaxRows() < filas) hoja.insertRowsAfter(hoja.getMaxRows(), filas - hoja.getMaxRows());
}

/** Garantiza que la fila 1 tenga todas las columnas (agrega al final las que falten). */
function asegurarEncabezados_(hoja, columnas) {
  var lc = hoja.getLastColumn();
  var enc = lc ? hoja.getRange(1, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); }) : [];
  var faltan = columnas.filter(function (c) { return enc.indexOf(c) < 0; });
  if (faltan.length) {
    asegurarTamano_(hoja, 1, enc.length + faltan.length);
    hoja.getRange(1, enc.length + 1, 1, faltan.length).setValues([faltan]);
    enc = enc.concat(faltan);
  }
  return enc;
}

function bitacora_(email, accion, folio, detalle) {
  try {
    var h = libro_().getSheetByName(HOJA_BITACORA);
    if (h) h.appendRow([ahora_(), email || '', accion || '', folio || '', detalle || '']);
  } catch (e) { console.warn('Bitácora: ' + e); }
}

function notificarAdmins_(u) {
  try {
    var admins = leerUsuarios_().filter(esAdmin_).map(function (a) { return a.email; });
    if (!admins.length) return;
    var url = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
    MailApp.sendEmail({
      to: admins.join(','),
      subject: 'Solicitud de acceso — Cédula EVC/NLR',
      body: (u.nombre || u.email) + ' <' + u.email + '> solicitó acceso a la aplicación de recolección de datos.\n\n' +
        'Para aprobar o rechazar: ' + (url ? url + '#/usuarios' : 'abra la aplicación → Usuarios') + '\n\n(Mensaje automático)'
    });
  } catch (e) { console.warn('No se pudo enviar el aviso al administrador: ' + e); }
}

function notificarAprobacion_(u) {
  try {
    var url = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
    MailApp.sendEmail({
      to: u.email,
      subject: 'Acceso aprobado — Cédula EVC/NLR',
      body: 'Hola ' + (u.nombre || '') + ':\n\nTu acceso a la aplicación de recolección de datos fue aprobado.' +
        (url ? '\n\nIngresa en: ' + url : '') + '\n\n(Mensaje automático)'
    });
  } catch (e) { console.warn('No se pudo enviar el aviso de aprobación: ' + e); }
}

function ahora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function error_(codigo, mensaje) { var e = new Error(mensaje || codigo); e.codigo = codigo; return e; }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function avisar_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
