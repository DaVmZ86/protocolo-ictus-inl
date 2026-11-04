/* =============================================================================
 * app.js — Interfaz de la cédula de recolección (se publica en GitHub Pages)
 *
 * Flujo: inicio de sesión con Google → la API (Apps Script) verifica la cuenta
 * → si el administrador la aprobó, se capturan registros que se guardan en la
 * hoja «Datos» de Google Sheets.
 * ============================================================================= */
(function () {
  'use strict';

  const CFG = window.CONFIG || {};
  const CONFIG_COMPLETA = !!(CFG.CLIENT_ID && CFG.API_URL);
  const DEMO = !CONFIG_COMPLETA || new URLSearchParams(location.search).has('demo');
  const URL_REAL = location.origin + location.pathname;   // la misma página sin ?demo

  // Navegadores dentro de otras apps (Facebook, Instagram, vistas web de Android/iOS):
  // Google bloquea ahí el inicio de sesión («disallowed_useragent»).
  function enNavegadorIntegrado() {
    const ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|TikTok|musical_ly|Bytedance|; wv\)/i.test(ua)) return true;
    return /iPhone|iPad|iPod/i.test(ua) && !/Safari\//i.test(ua);  // WKWebView de iOS sin Safari
  }
  const E = window.EVC;
  const S = window.EVC_SPSS;
  const ESQ = E.ESQUEMA;

  const st = {
    sesion: null, usuario: null, hojaUrl: null, pendientes: 0,
    registro: null, nuevo: false, version: null, sucio: false, intentoGuardar: false,
    lista: [], usuarios: [], reauth: null, gisListo: false, ignorarHash: false, hashAnterior: location.hash,
    tocados: new Set(), validacion: { errores: [], advertencias: [] }
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ss = {
    leer(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    escribir(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* almacenamiento no disponible */ } },
    borrar(k) { try { sessionStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  const ls = {
    leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* idem */ } },
    borrar(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function fechaHora(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d)) return String(iso);
    return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  let toastTimer;
  function toast(msg, tipo) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (tipo ? ' ' + tipo : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, tipo === 'error' ? 7000 : 3500);
  }
  function cargando(texto) {
    $('#cargando-texto').textContent = texto || 'Cargando…';
    $('#cargando').hidden = !texto;
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function abrirModal(titulo, cuerpoHtml, botones) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
        <h3 id="modal-titulo">${esc(titulo)}</h3>
        <div class="modal-cuerpo">${cuerpoHtml}</div>
        <div class="modal-pie"></div>
      </div>`;
    const pie = $('.modal-pie', m);
    (botones || [{ texto: 'Cerrar' }]).forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'boton ' + (b.primario ? 'primario' : 'secundario');
      el.textContent = b.texto;
      if (b.id) el.id = b.id;
      el.addEventListener('click', () => { if (b.accion && b.accion() === false) return; cerrarModal(); });
      pie.appendChild(el);
    });
    if (!botones || !botones.length) pie.hidden = true;
    m.hidden = false;
    return m;
  }
  function cerrarModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  class ErrorApi extends Error {
    constructor(codigo, mensaje, detalles) { super(mensaje || codigo); this.codigo = codigo; this.detalles = detalles; }
  }
  const MENSAJES = {
    RED: 'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.',
    NO_CONFIGURADO: 'El servidor aún no tiene configurado el Client ID (menú Protocolo EVC de la hoja de cálculo).',
    NO_INICIALIZADO: 'La hoja de cálculo no se ha inicializado (menú Protocolo EVC → Inicializar).',
    TOKEN_INVALIDO: 'No se pudo verificar tu cuenta de Google. Intenta iniciar sesión de nuevo.',
    NO_APROBADO: 'Tu cuenta aún no ha sido aprobada por el administrador.',
    NO_PERMITIDO: 'No tienes permiso para realizar esta acción.',
    FOLIO_DUPLICADO: 'Ya existe un registro con ese folio. Revisa el número o abre el registro existente.',
    CONFLICTO_VERSION: 'Otra persona modificó este registro mientras lo editabas. Tus cambios quedaron como borrador en este equipo; recarga el registro para continuar.',
    NO_EXISTE: 'El registro solicitado no existe.',
    OCUPADO: 'El servidor está ocupado. Intenta de nuevo en unos segundos.'
  };
  function mensajeError(e) {
    if (e && e.codigo && MENSAJES[e.codigo]) return MENSAJES[e.codigo];
    return (e && e.message) || 'Error desconocido';
  }

  async function api(accion, datos) {
    if (DEMO) return Demo.llamar(accion, datos || {});
    let res;
    try {
      const resp = await fetch(CFG.API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita la verificación previa CORS
        body: JSON.stringify({ accion, sesion: st.sesion, datos: datos || {} })
      });
      res = await resp.json();
    } catch (e) {
      throw new ErrorApi('RED', MENSAJES.RED);
    }
    if (!res.ok && (res.error === 'SESION_EXPIRADA' || res.error === 'SESION_INVALIDA') && accion !== 'login' && accion !== 'estado') {
      await reautenticar();
      return api(accion, datos);
    }
    if (!res.ok) throw new ErrorApi(res.error, res.mensaje, res.detalles);
    return res;
  }

  // ---------------------------------------------------------------------------
  // Modo demostración (todo en este navegador)
  // ---------------------------------------------------------------------------
  const Demo = {
    leer(k, def) { const v = ls.leer('evc-demo:' + k); return v === null ? def : v; },
    escribir(k, v) { ls.escribir('evc-demo:' + k, v); },
    usuarios() {
      let u = this.leer('usuarios', null);
      if (!u) {
        const hoy = E.hoyISO() + ' 08:00:00';
        u = [
          { email: 'demo@ejemplo.com', nombre: 'Usuario de demostración', estado: 'aprobado', rol: 'admin', fecha_solicitud: hoy, ultimo_acceso: hoy, propietario: true },
          { email: 'residente.ejemplo@gmail.com', nombre: 'Residente de ejemplo', estado: 'pendiente', rol: 'capturista', fecha_solicitud: hoy, ultimo_acceso: hoy }
        ];
        this.escribir('usuarios', u);
      }
      return u;
    },
    yo() { return Object.assign({ admin: true }, this.usuarios()[0]); },
    async llamar(accion, d) {
      await new Promise((r) => setTimeout(r, 120));
      const regs = this.leer('registros', {});
      const yo = this.yo();
      switch (accion) {
        case 'login':
        case 'estado':
          return { ok: true, sesion: 'demo', usuario: yo, hojaUrl: null,
            pendientes: this.usuarios().filter((u) => u.estado === 'pendiente').length };
        case 'logout': return { ok: true };
        case 'siguienteFolio': return { ok: true, folio: E.siguienteFolio(Object.keys(regs)) };
        case 'listarRegistros': return { ok: true, registros: Object.values(regs).map(E.resumen) };
        case 'obtenerRegistro': {
          const r = regs[String(d.folio).toUpperCase()];
          if (!r) throw new ErrorApi('NO_EXISTE', MENSAJES.NO_EXISTE);
          return { ok: true, registro: r, version: r.fecha_modificacion };
        }
        case 'guardarRegistro': {
          const prep = E.prepararParaGuardar(d.registro);
          if (prep.errores.length) throw new ErrorApi('VALIDACION', 'Hay errores en el formulario.', prep.errores);
          const r = prep.registro;
          const previo = regs[r.folio];
          if (d.nuevo && previo) throw new ErrorApi('FOLIO_DUPLICADO', MENSAJES.FOLIO_DUPLICADO);
          if (!d.nuevo && !previo) throw new ErrorApi('NO_EXISTE', MENSAJES.NO_EXISTE);
          if (previo && String(previo.fecha_modificacion || '') !== String(d.version || '')) throw new ErrorApi('CONFLICTO_VERSION', MENSAJES.CONFLICTO_VERSION);
          const ahora = new Date().toISOString();
          r.creado_por = previo ? previo.creado_por : yo.email;
          r.fecha_creacion = previo ? previo.fecha_creacion : ahora;
          r.modificado_por = yo.email;
          r.fecha_modificacion = ahora;
          regs[r.folio] = r;
          this.escribir('registros', regs);
          return { ok: true, registro: r, version: ahora, advertencias: prep.advertencias };
        }
        case 'listarUsuarios': return { ok: true, usuarios: this.usuarios() };
        case 'actualizarUsuario': {
          const us = this.usuarios();
          const u = us.find((x) => x.email === d.email);
          if (!u || u.propietario) throw new ErrorApi('NO_PERMITIDO', MENSAJES.NO_PERMITIDO);
          if (d.estado) u.estado = d.estado;
          if (d.rol) u.rol = d.rol;
          this.escribir('usuarios', us);
          return { ok: true, usuarios: us };
        }
        case 'exportar': return { ok: true, registros: Object.values(regs) };
      }
      throw new ErrorApi('ACCION_DESCONOCIDA', accion);
    }
  };

  // ---------------------------------------------------------------------------
  // Inicio de sesión con Google
  // ---------------------------------------------------------------------------
  function esperarGoogle(ms) {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      (function revisar() {
        if (window.google && google.accounts && google.accounts.id) return resolve();
        if (Date.now() - inicio > ms) return reject(new Error('GIS'));
        setTimeout(revisar, 100);
      })();
    });
  }

  async function pintarBotonGoogle(contenedor) {
    try { await esperarGoogle(10000); } catch (e) {
      contenedor.innerHTML = '<p class="msj-error">No se pudo cargar el inicio de sesión de Google. Revisa tu conexión o desactiva bloqueadores de contenido para este sitio.</p>';
      return;
    }
    if (!st.gisListo) {
      google.accounts.id.initialize({
        client_id: CFG.CLIENT_ID,
        callback: alRecibirCredencial,
        auto_select: true,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true          // Safari (iPhone) y otros navegadores con prevención de rastreo
      });
      st.gisListo = true;
    }
    contenedor.innerHTML = '';
    google.accounts.id.renderButton(contenedor, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es-419' });
  }

  async function alRecibirCredencial(resp) {
    try {
      cargando('Verificando tu cuenta…');
      const r = await api('login', { idToken: resp.credential, appUrl: location.origin + location.pathname });
      st.sesion = r.sesion;
      ss.escribir('evc:sesion', r.sesion);
      if (st.reauth) {
        const p = st.reauth; st.reauth = null;
        cerrarModal();
        aplicarUsuario(r);
        p.resolve();
        return;
      }
      entrar(r);
    } catch (e) {
      toast(mensajeError(e), 'error');
      if (!st.reauth) mostrarLogin();
    } finally { cargando(null); }
  }

  // Sesión vencida a media captura: pide iniciar sesión otra vez y reintenta.
  function reautenticar() {
    if (st.reauth) return st.reauth.promesa;
    let resolve, reject;
    const promesa = new Promise((res, rej) => { resolve = res; reject = rej; });
    st.reauth = { promesa, resolve, reject };
    abrirModal('Tu sesión expiró',
      '<p>Vuelve a iniciar sesión para continuar. Lo que capturaste en el formulario se conserva.</p><div id="boton-google-modal" class="boton-google"></div>',
      [{ texto: 'Cancelar', accion: () => { const p = st.reauth; st.reauth = null; p.reject(new ErrorApi('SESION_EXPIRADA', 'Sesión expirada.')); } }]);
    pintarBotonGoogle($('#boton-google-modal'));
    return promesa;
  }

  function mostrarLogin() {
    st.usuario = null;
    $('#nav').hidden = true;
    $('#usuario').hidden = true;
    mostrarVista('vista-login');
    $('#titulo-protocolo').textContent = '«' + ESQ.titulo + '» · ' + ESQ.sede;
    if (DEMO) {
      $('#btn-demo').hidden = false;
      $('#boton-google').hidden = true;
      // Si la app ya está conectada a Google y se entró con ?demo, ofrece volver al acceso real
      if (CONFIG_COMPLETA) { $('#enlace-real').href = URL_REAL; $('#enlace-real').hidden = false; }
    } else {
      if (enNavegadorIntegrado()) avisarNavegadorIntegrado();
      pintarBotonGoogle($('#boton-google')).then(() => { try { google.accounts.id.prompt(); } catch (e) { /* One Tap opcional */ } });
    }
  }

  function avisarNavegadorIntegrado() {
    const aviso = $('#aviso-navegador');
    aviso.innerHTML = `<span>Abriste el enlace dentro de otra app. Google puede bloquear ahí el inicio de sesión.
      Ábrelo en <b>Safari</b> (iPhone) o <b>Chrome</b> (Android): menú <b>⋯</b> o <b>Compartir</b> → «Abrir en el navegador».</span>
      <button type="button" class="boton secundario chico" id="btn-copiar-enlace">Copiar enlace</button>`;
    aviso.hidden = false;
    $('#btn-copiar-enlace').onclick = async () => {
      try { await navigator.clipboard.writeText(URL_REAL); toast('Enlace copiado. Pégalo en Safari o Chrome.', 'ok'); }
      catch (e) { prompt('Copia este enlace y ábrelo en Safari o Chrome:', URL_REAL); }
    };
  }

  function aplicarUsuario(r) {
    st.usuario = r.usuario;
    st.hojaUrl = r.hojaUrl || null;
    st.pendientes = r.pendientes || 0;
    $('#usuario-nombre').textContent = (r.usuario.nombre || r.usuario.email) + (r.usuario.admin ? ' · admin' : '');
    $('#usuario-nombre').title = r.usuario.email;
    $('#usuario').hidden = false;
    $$('.solo-admin').forEach((el) => { el.hidden = !r.usuario.admin; });
    const cont = $('#contador-pendientes');
    cont.textContent = st.pendientes;
    cont.hidden = !st.pendientes;
  }

  function entrar(r) {
    aplicarUsuario(r);
    if (r.usuario.estado !== 'aprobado') {
      $('#nav').hidden = true;
      mostrarVista('vista-pendiente');
      const rechazado = r.usuario.estado === 'rechazado';
      $('#pendiente-titulo').textContent = rechazado ? 'Acceso no autorizado' : 'Solicitud enviada';
      $('#pendiente-texto').textContent = rechazado
        ? 'El administrador no autorizó el acceso para ' + r.usuario.email + '. Si crees que es un error, comunícate con él.'
        : 'Tu solicitud de acceso para ' + r.usuario.email + ' está pendiente. Cuando el administrador la apruebe podrás usar la aplicación (recibirás un correo).';
      return;
    }
    $('#nav').hidden = false;
    ruta();
  }

  async function salir() {
    if (st.sucio && !confirm('Hay cambios sin guardar. ¿Salir de todos modos? (Se conserva un borrador en este equipo.)')) return;
    try { if (st.sesion) await api('logout'); } catch (e) { /* sin importancia */ }
    st.sesion = null; st.sucio = false;
    ss.borrar('evc:sesion');
    if (!DEMO && window.google && google.accounts) google.accounts.id.disableAutoSelect();
    history.replaceState(null, '', location.pathname + location.search);
    mostrarLogin();
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------
  function mostrarVista(id) {
    $$('.vista').forEach((v) => { v.hidden = v.id !== id; });
    window.scrollTo(0, 0);
  }
  function esAdmin() { return !!(st.usuario && st.usuario.admin); }
  function ir(ruta) { location.hash = '#/' + ruta; }

  function ruta() {
    if (!st.usuario || st.usuario.estado !== 'aprobado') return;
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    const vista = partes[0] || 'registros';
    $$('#nav a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === vista || (vista === 'registro' && a.dataset.vista === 'registros')));
    switch (vista) {
      case 'registros': return vistaRegistros();
      case 'nuevo': return vistaFormulario(null);
      case 'registro': return vistaFormulario(decodeURIComponent(partes[1] || ''));
      case 'usuarios': return esAdmin() ? vistaUsuarios() : ir('registros');
      case 'exportar': return esAdmin() ? vistaExportar() : ir('registros');
      case 'ayuda': return vistaAyuda();
      default: return ir('registros');
    }
  }

  window.addEventListener('hashchange', () => {
    if (st.ignorarHash) { st.ignorarHash = false; st.hashAnterior = location.hash; return; }
    if (st.sucio && !confirm('Hay cambios sin guardar en el formulario. ¿Salir sin guardar? (Se conserva un borrador en este equipo.)')) {
      st.ignorarHash = true;
      location.hash = st.hashAnterior;
      return;
    }
    st.sucio = false;
    st.hashAnterior = location.hash;
    ruta();
  });
  window.addEventListener('beforeunload', (e) => { if (st.sucio) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------------------
  // Vista: registros
  // ---------------------------------------------------------------------------
  const CLASE_SEGUIMIENTO = { completo: 'ok', en_ventana: 'aviso', vencido: 'error', programado: 'info', sin_fecha: '', no_incluido: '', eliminado: '' };
  const CLASE_DICTAMEN = { 1: 'ok', 2: '', 3: 'error' };

  async function vistaRegistros() {
    mostrarVista('vista-registros');
    const cuerpo = $('#tabla-registros tbody');
    cuerpo.innerHTML = '<tr><td colspan="10" class="cargando">Cargando registros…</td></tr>';
    try {
      const r = await api('listarRegistros');
      st.lista = r.registros || [];
      pintarRegistros();
    } catch (e) {
      cuerpo.innerHTML = `<tr><td colspan="10" class="vacio">${esc(mensajeError(e))}</td></tr>`;
    }
  }

  function numFolio(f) { const m = /(\d+)$/.exec(f || ''); return m ? Number(m[1]) : 0; }

  function pintarRegistros() {
    const hoy = E.hoyISO();
    const todos = st.lista.map((r) => Object.assign({}, r, { _seg: E.estadoSeguimiento(r, hoy) }));
    const incluidos = todos.filter((r) => r.dictamen === 1);
    const cuenta = (c) => todos.filter((r) => r._seg.codigo === c).length;
    $('#resumen-registros').innerHTML = [
      ['Registros', todos.length, ''],
      ['Incluidos', `${incluidos.length} <small>/ ${ESQ.tamanoMuestra}</small>`, 'destacado'],
      ['Con mRS a 90 días', incluidos.filter((r) => E.esNum(r.mrs_90)).length, ''],
      ['En ventana ahora', cuenta('en_ventana'), cuenta('en_ventana') ? 'alerta' : ''],
      ['Ventana vencida', cuenta('vencido'), '']
    ].map(([t, v, c]) => `<div class="dato ${c}"><b>${v}</b><span>${t}</span></div>`).join('');

    const q = $('#buscar').value.trim().toUpperCase();
    const f = $('#filtro-estado').value;
    const filas = todos
      .filter((r) => !q || String(r.folio).indexOf(q) >= 0)
      .filter((r) => !f || r._seg.codigo === f)
      .sort((a, b) => numFolio(b.folio) - numFolio(a.folio));
    const cuerpo = $('#tabla-registros tbody');
    if (!filas.length) {
      cuerpo.innerHTML = `<tr><td colspan="10" class="vacio">${todos.length ? 'Ningún registro coincide con el filtro.' : 'Aún no hay registros. Usa «+ Nuevo registro» para comenzar.'}</td></tr>`;
      return;
    }
    const dictamen = E.campo('dictamen');
    cuerpo.innerHTML = filas.map((r) => {
      const dic = E.esNum(r.dictamen) ? dictamen.opciones.find((o) => o[0] === r.dictamen)[1] : 'Pendiente';
      const nlr = E.esNum(r.nlr) ? r.nlr.toFixed(2) + (r.nlr_cat === 1 ? ' ▲' : '') : '—';
      return `<tr class="clic" data-folio="${esc(r.folio)}">
        <td><a href="#/registro/${encodeURIComponent(r.folio)}"><b>${esc(r.folio)}</b></a></td>
        <td>${r.fase === 1 ? 'Retro' : r.fase === 2 ? 'Prosp' : '—'}</td>
        <td>${esc(E.fmtFecha(r.fecha_evento) || '—')}</td>
        <td><span class="insignia ${CLASE_DICTAMEN[r.dictamen] || ''}">${esc(dic)}</span></td>
        <td>${E.esNum(r.nihss) ? r.nihss : '—'}</td>
        <td>${nlr}</td>
        <td>${E.esNum(r.mrs_90) ? r.mrs_90 : '—'}</td>
        <td><span class="insignia ${CLASE_SEGUIMIENTO[r._seg.codigo] || ''}">${esc(r._seg.texto)}</span></td>
        <td><span class="mini-barra"><span style="width:${r.completitud || 0}%"></span></span>${r.completitud || 0}%</td>
        <td title="${esc(r.modificado_por || '')}">${esc(fechaHora(r.fecha_modificacion))}</td>
      </tr>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Vista: formulario
  // ---------------------------------------------------------------------------
  function paso(c) { return c.decimales ? String(Math.pow(10, -c.decimales)) : '1'; }

  function controlCampo(c) {
    const id = 'f_' + c.id;
    if (c.calculado) return `<output id="${id}" class="valor-calculado vacio" aria-live="polite">—</output>`;
    switch (c.tipo) {
      case 'texto':
        return `<input type="text" id="${id}" name="${c.id}" maxlength="${c.longitud || 255}"${c.id === 'folio' ? ' autocapitalize="characters" spellcheck="false"' : ''}>`;
      case 'textolargo':
        return `<textarea id="${id}" name="${c.id}" rows="4" maxlength="${c.longitud || 1000}"></textarea>`;
      case 'numero': {
        const lim = (c.min !== undefined ? ` min="${c.min}"` : '') + (c.max !== undefined ? ` max="${c.max}"` : '');
        return `<div class="con-unidad"><input type="number" id="${id}" name="${c.id}" inputmode="decimal" step="${paso(c)}"${lim}>${c.unidad ? `<span class="unidad">${esc(c.unidad)}</span>` : ''}</div>`;
      }
      case 'fecha': return `<input type="date" id="${id}" name="${c.id}" min="1900-01-01" max="2100-12-31">`;
      case 'hora': return `<input type="time" id="${id}" name="${c.id}">`;
      case 'opcion': {
        const vertical = c.opciones.length > 4 || c.opciones.some((o) => o[1].length > 34);
        return `<div class="opciones${vertical ? ' vertical' : ''}" role="radiogroup" aria-labelledby="lbl_${c.id}">` +
          c.opciones.map((o) => `<label class="opcion"><input type="radio" name="${c.id}" value="${o[0]}"><span><b>${o[0]}</b>${esc(o[1])}</span></label>`).join('') +
          '</div>';
      }
    }
    return '';
  }

  function htmlCampo(c) {
    const fila = c.fila || c.tipo === 'textolargo';
    const insignia = c.calculado ? '<span class="insignia primario">calculada</span>' : c.autocalc ? '<span class="insignia">auto</span>' : '';
    const requerido = c.requerido ? ' <span class="insignia error">obligatorio</span>' : '';
    const asistente = c.asistente ? `<button type="button" class="enlace" data-asistente="${c.asistente}">${c.asistente === 'nihss' ? 'Calculadora NIHSS (Anexo 5)' : 'Asistente de entrevista telefónica (Anexo 6)'}</button>` : '';
    const etiquetaTag = c.tipo === 'opcion' || c.calculado ? 'div' : 'label';
    return `<div class="campo${fila ? ' fila' : ''}" data-campo="${c.id}">
        <${etiquetaTag} class="etiqueta" id="lbl_${c.id}"${etiquetaTag === 'label' ? ` for="f_${c.id}"` : ''}>${esc(c.etiqueta)} ${insignia}${requerido}</${etiquetaTag}>
        ${controlCampo(c)}
        ${c.ayuda ? `<p class="ayuda">${esc(c.ayuda)}</p>` : ''}
        ${asistente}
        <p class="msj-error" hidden></p>
      </div>`;
  }

  function construirFormulario() {
    const form = $('#formulario');
    form.innerHTML = ESQ.secciones.map((s) => `
      <details class="seccion" id="sec-${s.id}" open>
        <summary><span class="titulo-sec">${esc(s.titulo)}</span><span class="insignia" data-avance="${s.id}"></span></summary>
        <div class="campos">
          ${s.campos.map((c) => (c.grupo ? `<h4 class="grupo">${esc(c.grupo)}</h4>` : '') + htmlCampo(c)).join('')}
        </div>
      </details>`).join('');
    $('#indice-secciones').innerHTML = ESQ.secciones.map((s) =>
      `<a href="#" data-ir="sec-${s.id}" data-sec="${s.id}">${esc(s.titulo.replace(/^[IVX]+\.\s*/, ''))}</a>`).join('');
  }

  function leerFormulario() {
    const r = {};
    st.numerosInvalidos = [];
    E.campos().forEach((c) => {
      if (c.calculado) { r[c.id] = null; return; }
      if (c.tipo === 'opcion') {
        const sel = $(`#formulario input[name="${c.id}"]:checked`);
        r[c.id] = sel ? Number(sel.value) : null;
        return;
      }
      const el = $('#f_' + c.id);
      if (c.tipo === 'numero' && el.validity && el.validity.badInput) { st.numerosInvalidos.push(c.id); r[c.id] = null; return; }
      const v = el.value.trim();
      r[c.id] = v === '' ? null : (c.tipo === 'numero' ? Number(v) : v);
    });
    if (r.folio) r.folio = r.folio.toUpperCase();
    return r;
  }

  function escribirFormulario(reg) {
    E.campos().forEach((c) => {
      if (c.calculado) return;
      const v = reg[c.id];
      if (c.tipo === 'opcion') {
        $$(`#formulario input[name="${c.id}"]`).forEach((i) => { i.checked = E.esNum(v) && Number(i.value) === v; });
      } else {
        $('#f_' + c.id).value = E.vacio(v) ? '' : String(v);
      }
    });
  }

  function actualizarFormulario() {
    const r = leerFormulario();
    E.calcularDerivadas(r);

    // Campo autocalculado (tiempo síntomas-puerta)
    const m = E.difMinutos(r.fecha_evento, r.hora_inicio, r.fecha_admision, r.hora_admision);
    const tsp = $('#f_t_sintomas_puerta');
    if (m !== null) { tsp.value = m; tsp.readOnly = true; } else if (tsp.readOnly) { tsp.readOnly = false; tsp.value = ''; r.t_sintomas_puerta = null; }

    // Variables calculadas
    E.campos().filter((c) => c.calculado).forEach((c) => {
      const out = $('#f_' + c.id);
      out.textContent = E.textoValor(c, r[c.id]);
      out.classList.toggle('vacio', E.vacio(r[c.id]));
      out.classList.toggle('alto', (c.id === 'nlr_cat' && r.nlr_cat === 1) || (c.id === 'eval_en_ventana' && r.eval_en_ventana === 0) || (c.id === 'dictamen' && r.dictamen !== 1 && r.dictamen !== null));
    });

    // Visibilidad
    E.campos().forEach((c) => {
      const div = $(`.campo[data-campo="${c.id}"]`);
      div.hidden = !E.esVisible(c, r);
    });
    $$('#formulario .grupo').forEach((g) => {
      let sig = g.nextElementSibling;
      g.hidden = !!(sig && sig.hidden);
    });

    // Avance por sección y global
    ESQ.secciones.forEach((s) => {
      const a = E.completitud(r, s.id);
      const el = $(`[data-avance="${s.id}"]`);
      el.textContent = a.total ? `${a.llenos}/${a.total}` : '—';
      el.className = 'insignia' + (a.total && a.llenos === a.total ? ' ok' : '');
      const chip = $(`#indice-secciones a[data-sec="${s.id}"]`);
      if (chip) chip.classList.toggle('completa', !!a.total && a.llenos === a.total);
    });
    const g = E.completitud(r);
    $('#avance-global-barra').style.width = g.pct + '%';
    $('#avance-global-texto').textContent = g.pct + '% completo';

    // Validación
    const copia = Object.assign({}, r);
    E.limpiarOcultos(copia);
    const v = E.validar(copia);
    st.numerosInvalidos.forEach((id) => v.errores.push({ campo: id, mensaje: E.campo(id).etiqueta + ': número no válido (use punto decimal)' }));
    st.validacion = v;
    pintarValidacion();
  }

  function pintarValidacion() {
    const v = st.validacion;
    $$('#formulario .campo').forEach((d) => {
      d.classList.remove('con-error', 'con-aviso');
      const p = $('.msj-error', d); p.hidden = true; p.textContent = '';
    });
    const visibles = v.errores.filter((e) => !e.requerido || st.intentoGuardar);
    visibles.forEach((e) => {
      const d = $(`.campo[data-campo="${e.campo}"]`);
      if (!d) return;
      if (!st.intentoGuardar && !st.tocados.has(e.campo)) return;
      d.classList.add('con-error');
      const p = $('.msj-error', d); p.hidden = false; p.textContent = e.mensaje;
    });
    v.advertencias.forEach((a) => { const d = $(`.campo[data-campo="${a.campo}"]`); if (d) d.classList.add('con-aviso'); });

    const btn = $('#btn-avisos');
    const nErr = visibles.filter((e) => st.intentoGuardar || st.tocados.has(e.campo)).length;
    const nAdv = v.advertencias.length;
    btn.hidden = !nErr && !nAdv;
    btn.classList.toggle('errores', nErr > 0);
    btn.textContent = [nErr ? `✖ ${nErr} error${nErr > 1 ? 'es' : ''}` : '', nAdv ? `⚠ ${nAdv} advertencia${nAdv > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  }

  function irACampo(id) {
    const d = $(`.campo[data-campo="${id}"]`);
    if (!d) return;
    const det = d.closest('details'); if (det) det.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const ctl = $('input, textarea, select', d);
    if (ctl) setTimeout(() => ctl.focus({ preventScroll: true }), 300);
  }

  function mostrarAvisos() {
    const v = st.validacion;
    const item = (x) => `<li><a data-campo="${esc(x.campo)}">${esc(x.mensaje)}</a></li>`;
    const html = (v.errores.length ? `<h4>Errores (impiden guardar)</h4><ul class="lista-avisos">${v.errores.map(item).join('')}</ul>` : '') +
      (v.advertencias.length ? `<h4>Advertencias de consistencia</h4><ul class="lista-avisos">${v.advertencias.map(item).join('')}</ul>` : '');
    const m = abrirModal('Revisión del registro', html || '<p>Sin observaciones.</p>', [{ texto: 'Cerrar' }]);
    $$('.lista-avisos a', m).forEach((a) => a.addEventListener('click', () => { cerrarModal(); irACampo(a.dataset.campo); }));
  }

  async function vistaFormulario(folio) {
    mostrarVista('vista-formulario');
    construirFormulario();
    st.intentoGuardar = false;
    st.tocados = new Set();
    st.sucio = false;
    $('#aviso-borrador').hidden = true;
    $('#estado-guardado').textContent = '';
    $('#titulo-form').textContent = folio ? 'Registro ' + folio : 'Nuevo registro';
    let reg = {}, version = null;
    try {
      cargando(folio ? 'Abriendo registro…' : 'Preparando formulario…');
      if (folio) {
        const r = await api('obtenerRegistro', { folio });
        reg = r.registro; version = r.version || '';
        $('#estado-guardado').textContent = reg.modificado_por ? `Última modificación: ${fechaHora(reg.fecha_modificacion)} · ${reg.modificado_por}` : '';
      } else {
        const r = await api('siguienteFolio');
        reg = { folio: r.folio, fecha_llenado: E.hoyISO() };
      }
    } catch (e) {
      toast(mensajeError(e), 'error');
      ir('registros');
      return;
    } finally { cargando(null); }
    st.registro = reg; st.nuevo = !folio; st.version = version;
    escribirFormulario(reg);
    $('#f_folio').readOnly = !st.nuevo;
    actualizarFormulario();
    ofrecerBorrador();
  }

  // --- Borrador local (protege contra cierres accidentales o caída de internet)
  function claveBorrador() { return 'evc:borrador:' + (st.usuario ? st.usuario.email : 'anonimo'); }
  const guardarBorrador = debounce(() => {
    if (!st.sucio) return;
    ls.escribir(claveBorrador(), { nuevo: st.nuevo, version: st.version, fecha: new Date().toISOString(), registro: leerFormulario() });
  }, 800);
  function ofrecerBorrador() {
    const b = ls.leer(claveBorrador());
    if (!b || !b.registro) return;
    const coincide = st.nuevo ? b.nuevo : (!b.nuevo && b.registro.folio === st.registro.folio);
    if (!coincide) return;
    const aviso = $('#aviso-borrador');
    aviso.innerHTML = `<span>Hay un borrador sin guardar${b.registro.folio ? ' de <b>' + esc(b.registro.folio) + '</b>' : ''} del ${esc(fechaHora(b.fecha))}.</span>
      <button type="button" class="boton primario chico" id="btn-recuperar">Recuperar</button>
      <button type="button" class="boton secundario chico" id="btn-descartar">Descartar</button>`;
    aviso.hidden = false;
    $('#btn-recuperar').onclick = () => {
      escribirFormulario(b.registro);
      if (!st.nuevo) $('#f_folio').value = st.registro.folio;
      st.sucio = true;
      aviso.hidden = true;
      actualizarFormulario();
      if (!st.nuevo && b.version !== st.version) toast('Ojo: el registro cambió en el servidor desde que se creó este borrador. Revisa antes de guardar.', 'error');
    };
    $('#btn-descartar').onclick = () => { ls.borrar(claveBorrador()); aviso.hidden = true; };
  }

  async function guardar() {
    st.intentoGuardar = true;
    actualizarFormulario();
    const r = leerFormulario();
    const prep = E.prepararParaGuardar(r);
    const errores = prep.errores.concat(st.numerosInvalidos.map((id) => ({ campo: id, mensaje: 'número no válido' })));
    if (errores.length) {
      toast(`Corrige ${errores.length} error${errores.length > 1 ? 'es' : ''} antes de guardar.`, 'error');
      irACampo(errores[0].campo);
      return;
    }
    if (prep.advertencias.length && !confirm(`Hay ${prep.advertencias.length} advertencia(s) de consistencia:\n\n• ${prep.advertencias.map((a) => a.mensaje).join('\n• ')}\n\n¿Guardar de todos modos?`)) return;
    const btn = $('#btn-guardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const res = await api('guardarRegistro', { registro: prep.registro, nuevo: st.nuevo, version: st.version });
      st.version = res.version;
      st.nuevo = false;
      st.sucio = false;
      st.registro = res.registro;
      ls.borrar(claveBorrador());
      $('#f_folio').readOnly = true;
      $('#titulo-form').textContent = 'Registro ' + res.registro.folio;
      $('#estado-guardado').textContent = 'Guardado ' + fechaHora(res.version);
      history.replaceState(null, '', '#/registro/' + encodeURIComponent(res.registro.folio));
      st.hashAnterior = location.hash;
      $$('#nav a').forEach((x) => x.classList.toggle('activo', x.dataset.vista === 'registros'));
      toast('Registro ' + res.registro.folio + (DEMO ? ' guardado (demostración).' : ' guardado en Google Drive.'), 'ok');
    } catch (e) {
      if (e.codigo === 'VALIDACION' && e.detalles) {
        st.validacion = { errores: e.detalles, advertencias: [] };
        pintarValidacion();
        mostrarAvisos();
      } else {
        toast(mensajeError(e), 'error');
      }
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar registro';
    }
  }

  // --- Asistentes de apoyo
  function asistenteNihss() {
    const filas = E.NIHSS_ITEMS.map(([id, nombre, max]) =>
      `<label class="fila-nihss"><span>${esc(id)}. ${esc(nombre)} <small class="texto-tenue">(0–${max})</small></span>
        <select data-item="${esc(id)}">${Array.from({ length: max + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label>`).join('');
    const m = abrirModal('Calculadora NIHSS (Anexo 5)',
      `<p class="ayuda">Úsela para verificar la puntuación consignada por el médico tratante. Sólo se guarda el total.</p>
       <div class="lista-nihss">${filas}</div>
       <p class="total-asistente">Total: <b id="nihss-total">0</b> / 42 · <span id="nihss-cat"></span></p>`,
      [{ texto: 'Cancelar' }, { texto: 'Usar este total', primario: true, accion: () => {
        const el = $('#f_nihss'); el.value = $('#nihss-total').textContent;
        st.tocados.add('nihss'); marcarCambio();
      } }]);
    const cat = E.campo('nihss_cat');
    const recalcular = () => {
      const total = $$('select[data-item]', m).reduce((s, x) => s + Number(x.value), 0);
      $('#nihss-total').textContent = total;
      const r = E.calcularDerivadas({ nihss: total });
      $('#nihss-cat').textContent = E.textoValor(cat, r.nihss_cat);
    };
    $$('select[data-item]', m).forEach((s) => s.addEventListener('change', recalcular));
    recalcular();
  }

  function asistenteMrs() {
    const preguntas = E.MRS_ENTREVISTA;
    let paso = -1;
    const m = abrirModal('Entrevista telefónica estructurada (Anexo 6)', '<div id="mrs-paso"></div>', [{ texto: 'Cancelar' }]);
    const cont = $('#mrs-paso', m);
    const marcar = (nombre, valor) => {
      const i = $(`#formulario input[name="${nombre}"][value="${valor}"]`);
      if (i) { i.checked = true; st.tocados.add(nombre); }
    };
    const terminar = (puntaje) => {
      cont.innerHTML = `<p class="pregunta-mrs">mRS asignada: ${puntaje} — ${esc(E.campo('mrs_90').opciones[puntaje][1])}</p>
        <p class="ayuda">${esc(E.MRS_DESCRIPCION[puntaje])}</p>
        <p class="ayuda">Al aplicar se marca la mRS, la aceptación verbal y, si está vacía, la fecha de evaluación de hoy.</p>
        <button type="button" class="boton primario" id="mrs-aplicar">Usar mRS = ${puntaje}</button>`;
      $('#mrs-aplicar', cont).onclick = () => {
        marcar('mrs_90', puntaje);
        if (E.vacio($('#f_fecha_eval').value)) $('#f_fecha_eval').value = E.hoyISO();
        if (!$('#formulario input[name="fuente_info"]:checked')) toast('Indica la fuente de la información (paciente o familiar).');
        marcarCambio();
        if ($('#formulario input[name="fuente_info"]:checked')) marcar('consentimiento_verbal', 1);
        marcarCambio();
        cerrarModal();
        irACampo('mrs_90');
      };
    };
    const mostrar = () => {
      if (paso === -1) {
        cont.innerHTML = `<p>Lea la presentación del Anexo 6 y pregunte:</p>
          <p class="pregunta-mrs">¿Acepta responder algunas preguntas sobre cómo se encuentra el paciente actualmente?</p>
          <div class="acciones-centro"><button type="button" class="boton primario" data-r="si">Sí acepta</button><button type="button" class="boton secundario" data-r="no">No acepta</button></div>`;
      } else {
        const p = preguntas[paso];
        cont.innerHTML = `<p class="texto-tenue">Pregunta ${paso + 1} de ${preguntas.length}</p>
          <p class="pregunta-mrs">${esc(p.pregunta)}</p>${p.nota ? `<p class="ayuda">${esc(p.nota)}</p>` : ''}
          <div class="acciones-centro"><button type="button" class="boton primario" data-r="si">Sí</button><button type="button" class="boton secundario" data-r="no">No</button></div>`;
      }
      $$('button[data-r]', cont).forEach((b) => b.addEventListener('click', () => responder(b.dataset.r === 'si')));
    };
    const responder = (si) => {
      if (paso === -1) {
        if (!si) {
          marcar('consentimiento_verbal', 0);
          marcarCambio();
          cont.innerHTML = '<p class="pregunta-mrs">No aceptó la entrevista.</p><p>Agradezca la atención y concluya la llamada. El caso se clasifica como <b>pérdida durante el seguimiento</b> (criterio de eliminación 10).</p>';
          return;
        }
        paso = 0; return mostrar();
      }
      const p = preguntas[paso];
      if (si) return terminar(p.si);
      if (p.no !== undefined) return terminar(p.no);
      paso++; mostrar();
    };
    mostrar();
  }

  function marcarCambio() {
    st.sucio = true;
    $('#estado-guardado').textContent = 'Cambios sin guardar';
    actualizarFormulario();
    guardarBorrador();
  }

  // Eventos del formulario (delegados una sola vez)
  function enlazarFormulario() {
    const form = $('#formulario');
    form.addEventListener('input', (e) => { if (e.target.name) st.tocados.add(e.target.name); marcarCambio(); });
    form.addEventListener('change', (e) => { if (e.target.name) st.tocados.add(e.target.name); marcarCambio(); });
    // Permite desmarcar una opción haciendo clic de nuevo
    form.addEventListener('pointerdown', (e) => {
      const lbl = e.target.closest('label.opcion');
      if (lbl) { const i = $('input', lbl); i.dataset.estaba = i.checked ? '1' : ''; }
    });
    form.addEventListener('click', (e) => {
      const i = e.target;
      if (i.matches && i.matches('input[type=radio]') && i.dataset.estaba === '1') {
        i.checked = false; i.dataset.estaba = '';
        st.tocados.add(i.name); marcarCambio();
      }
      const b = e.target.closest('[data-asistente]');
      if (b) { b.dataset.asistente === 'nihss' ? asistenteNihss() : asistenteMrs(); }
    });
    $('#indice-secciones').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-ir]');
      if (!a) return;
      e.preventDefault();
      const sec = document.getElementById(a.dataset.ir);
      sec.open = true;
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#btn-guardar').addEventListener('click', guardar);
    $('#btn-avisos').addEventListener('click', mostrarAvisos);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('#vista-formulario').hidden) { e.preventDefault(); guardar(); }
      if (e.key === 'Escape' && !$('#modal').hidden && !st.reauth) cerrarModal();
    });
  }

  // ---------------------------------------------------------------------------
  // Vista: usuarios (administrador)
  // ---------------------------------------------------------------------------
  async function vistaUsuarios() {
    mostrarVista('vista-usuarios');
    const cuerpo = $('#tabla-usuarios tbody');
    cuerpo.innerHTML = '<tr><td colspan="6" class="cargando">Cargando usuarios…</td></tr>';
    try {
      const r = await api('listarUsuarios');
      st.usuarios = r.usuarios || [];
      pintarUsuarios();
    } catch (e) { cuerpo.innerHTML = `<tr><td colspan="6" class="vacio">${esc(mensajeError(e))}</td></tr>`; }
  }

  const CLASE_ESTADO = { aprobado: 'ok', pendiente: 'aviso', rechazado: 'error' };
  function pintarUsuarios() {
    const orden = { pendiente: 0, aprobado: 1, rechazado: 2 };
    const lista = st.usuarios.slice().sort((a, b) => (orden[a.estado] - orden[b.estado]) || a.email.localeCompare(b.email));
    st.pendientes = lista.filter((u) => u.estado === 'pendiente').length;
    $('#contador-pendientes').textContent = st.pendientes;
    $('#contador-pendientes').hidden = !st.pendientes;
    const yo = st.usuario.email;
    $('#tabla-usuarios tbody').innerHTML = lista.map((u) => {
      let acciones = '';
      if (u.propietario) acciones = '<span class="texto-tenue">Propietario de la hoja</span>';
      else if (u.email === yo) acciones = '<span class="texto-tenue">Tu cuenta</span>';
      else {
        const b = (txt, datos, clase) => `<button type="button" class="boton chico ${clase || 'secundario'}" data-email="${esc(u.email)}" data-cambio='${esc(JSON.stringify(datos))}'>${txt}</button>`;
        if (u.estado !== 'aprobado') acciones += b('Aprobar', { estado: 'aprobado' }, 'primario');
        if (u.estado === 'pendiente') acciones += ' ' + b('Rechazar', { estado: 'rechazado' }, 'peligro');
        if (u.estado === 'aprobado') {
          acciones += u.rol === 'admin' ? b('Quitar admin', { rol: 'capturista' }) : b('Hacer admin', { rol: 'admin' });
          acciones += ' ' + b('Revocar acceso', { estado: 'rechazado' }, 'peligro');
        }
      }
      return `<tr>
        <td><b>${esc(u.nombre || '—')}</b><br><small class="texto-tenue">${esc(u.email)}</small></td>
        <td><span class="insignia ${CLASE_ESTADO[u.estado] || ''}">${esc(u.estado)}</span></td>
        <td>${esc(u.rol)}</td>
        <td>${esc(fechaHora(u.fecha_solicitud))}</td>
        <td>${esc(fechaHora(u.ultimo_acceso))}</td>
        <td>${acciones}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="vacio">Sin usuarios.</td></tr>';
  }

  async function cambiarUsuario(email, cambio) {
    if (cambio.rol === 'admin' && !confirm(`¿Dar rol de administrador a ${email}? Podrá aprobar usuarios y exportar la base completa.`)) return;
    if (cambio.estado === 'rechazado' && !confirm(`¿Quitar el acceso a ${email}?`)) return;
    try {
      cargando('Actualizando…');
      const r = await api('actualizarUsuario', Object.assign({ email }, cambio));
      st.usuarios = r.usuarios;
      pintarUsuarios();
      toast('Usuario actualizado.', 'ok');
    } catch (e) { toast(mensajeError(e), 'error'); } finally { cargando(null); }
  }

  // ---------------------------------------------------------------------------
  // Vista: exportar (administrador)
  // ---------------------------------------------------------------------------
  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function nombreCsv() { return `base_evc_${E.hoyISO()}.csv`; }

  async function vistaExportar() {
    mostrarVista('vista-exportar');
    $('#enlace-hoja').innerHTML = st.hojaUrl
      ? `La tabla original está en tu Google Drive: <a href="${esc(st.hojaUrl)}" target="_blank" rel="noopener">abrir la hoja de cálculo</a>.`
      : (DEMO ? 'En modo demostración no hay hoja de cálculo; los datos viven en este navegador.' : '');
    $('#resumen-exportar').innerHTML = '<div class="dato"><b>…</b><span>Cargando</span></div>';
    try {
      const r = await api('listarRegistros');
      const regs = r.registros || [];
      const inc = regs.filter((x) => x.dictamen === 1);
      const conMrs = inc.filter((x) => E.esNum(x.mrs_90));
      const dep = conMrs.filter((x) => x.mrs_dic === 1).length;
      const elev = inc.filter((x) => x.nlr_cat === 1).length;
      $('#resumen-exportar').innerHTML = [
        ['Registros', regs.length],
        ['Incluidos', `${inc.length} <small>/ ${ESQ.tamanoMuestra}</small>`],
        ['Con desenlace a 90 días', conMrs.length],
        ['Dependencia funcional (mRS ≥ 3)', conMrs.length ? `${dep} <small>(${Math.round(100 * dep / conMrs.length)} %)</small>` : '—'],
        ['NLR elevado (≥ 3,51)', inc.length ? `${elev} <small>(${Math.round(100 * elev / inc.length)} %)</small>` : '—']
      ].map(([t, v]) => `<div class="dato"><b>${v}</b><span>${t}</span></div>`).join('');
    } catch (e) { $('#resumen-exportar').innerHTML = `<div class="dato"><span>${esc(mensajeError(e))}</span></div>`; }
  }

  async function exportarCsv() {
    try {
      cargando('Preparando la base…');
      const r = await api('exportar');
      descargar(nombreCsv(), '﻿' + S.generarCsv(r.registros || []), 'text/csv;charset=utf-8');
      toast(`Base descargada: ${(r.registros || []).length} registro(s).`, 'ok');
    } catch (e) { toast(mensajeError(e), 'error'); } finally { cargando(null); }
  }
  function exportarSps() {
    descargar(`sintaxis_evc_${E.hoyISO()}.sps`, '﻿' + S.generarSintaxis(nombreCsv()), 'text/plain;charset=utf-8');
  }

  // ---------------------------------------------------------------------------
  // Vista: ayuda
  // ---------------------------------------------------------------------------
  function vistaAyuda() {
    mostrarVista('vista-ayuda');
    const mrs = E.campo('mrs_90');
    $('#tabla-mrs').innerHTML = `<div class="tabla-contenedor"><table class="tabla compacta"><thead><tr><th>Puntaje</th><th>Categoría</th><th>Descripción operativa</th></tr></thead><tbody>${
      mrs.opciones.map((o) => `<tr><td>${o[0]}</td><td>${esc(o[1])}</td><td>${esc(E.MRS_DESCRIPCION[o[0]])}</td></tr>`).join('')}</tbody></table></div>`;
    const tipo = (c) => (c.tipo === 'opcion' ? 'Código' : c.tipo === 'numero' ? 'Número' : c.tipo === 'fecha' ? 'Fecha' : c.tipo === 'hora' ? 'Hora' : 'Texto') + (c.unidad ? ` (${c.unidad})` : '');
    $('#tabla-diccionario').innerHTML = `<thead><tr><th>Variable</th><th>Etiqueta</th><th>Tipo</th><th>Códigos / cálculo</th></tr></thead><tbody>${
      E.campos().map((c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.etiquetaSpss || c.etiqueta)}</td><td>${esc(tipo(c))}${c.calculado ? ' · calculada' : ''}</td><td>${
        c.opciones ? c.opciones.map((o) => `${o[0]} = ${esc(o[1])}`).join('<br>') : esc(c.ayuda || '')}</td></tr>`).join('')}</tbody>`;
  }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  function enlazarGlobales() {
    $('#btn-demo').addEventListener('click', async () => { const r = await api('login'); st.sesion = r.sesion; entrar(r); });
    $('#btn-salir').addEventListener('click', salir);
    $('#btn-salir-2').addEventListener('click', salir);
    $('#btn-comprobar').addEventListener('click', async () => {
      try { cargando('Comprobando…'); entrar(await api('estado')); } catch (e) { toast(mensajeError(e), 'error'); mostrarLogin(); } finally { cargando(null); }
    });
    $('#buscar').addEventListener('input', pintarRegistros);
    $('#filtro-estado').addEventListener('change', pintarRegistros);
    $('#tabla-registros tbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-folio]');
      if (tr && !e.target.closest('a')) ir('registro/' + encodeURIComponent(tr.dataset.folio));
    });
    $('#tabla-usuarios tbody').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-email]');
      if (b) cambiarUsuario(b.dataset.email, JSON.parse(b.dataset.cambio));
    });
    $('#btn-csv').addEventListener('click', exportarCsv);
    $('#btn-sps').addEventListener('click', exportarSps);
    enlazarFormulario();
  }

  async function iniciar() {
    $('#banner-demo').hidden = !DEMO;
    if (DEMO && CONFIG_COMPLETA) { $('#salir-demo').href = URL_REAL; $('#salir-demo').hidden = false; }
    enlazarGlobales();
    const guardada = DEMO ? null : ss.leer('evc:sesion');
    if (guardada) {
      st.sesion = guardada;
      try { cargando('Reanudando sesión…'); entrar(await api('estado')); return; }
      catch (e) { st.sesion = null; ss.borrar('evc:sesion'); }
      finally { cargando(null); }
    }
    mostrarLogin();
  }

  iniciar();
})();
