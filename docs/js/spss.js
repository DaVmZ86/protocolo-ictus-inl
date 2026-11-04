/* =============================================================================
 * spss.js — Exportación de la base de datos a CSV + sintaxis de IBM SPSS 27
 *
 * Genera, a partir de esquema.js:
 *   · base_evc_AAAA-MM-DD.csv  (una fila por paciente, valores codificados)
 *   · sintaxis_evc_AAAA-MM-DD.sps  (lee el CSV con tipos exactos y aplica
 *     etiquetas de variable, etiquetas de valor y nivel de medición; guarda .sav)
 *
 * Se usa en el navegador (botón «Exportar») y en tools/sincronizar.mjs.
 * ============================================================================= */

var EVC_SPSS = (function () {
  'use strict';

  var NIVEL_SPSS = { nominal: 'NOMINAL', ordinal: 'ORDINAL', escala: 'SCALE' };

  function variables() { return EVC.campos(); }

  function formato(c) {
    switch (c.tipo) {
      case 'texto':
      case 'textolargo': return 'A' + (c.longitud || 255);
      case 'fecha': return 'SDATE10';
      case 'hora': return 'TIME5';
      case 'opcion': return 'F2.0';
      default: return c.decimales ? 'F10.' + c.decimales : 'F8.0';
    }
  }

  function nivel(c) {
    if (c.tipo === 'texto' || c.tipo === 'textolargo') return 'NOMINAL';
    return NIVEL_SPSS[c.nivel] || (c.tipo === 'opcion' ? 'NOMINAL' : 'SCALE');
  }

  function etiqueta(c) {
    var e = c.etiquetaSpss || c.etiqueta;
    var u = c.unidadSpss || c.unidad;
    if (u) e += ' (' + u + ')';
    return e.length > 250 ? e.slice(0, 250) : e;
  }

  function comillas(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  function valorCsv(c, v) {
    if (v === null || v === undefined || v === '') return '';
    switch (c.tipo) {
      case 'fecha': return String(v).replace(/-/g, '/');               // aaaa/mm/dd = SDATE10
      case 'texto':
      case 'textolargo': return '"' + String(v).replace(/[\r\n]+/g, ' ').replace(/"/g, '""') + '"';
      case 'numero': return c.decimales ? Number(v).toFixed(c.decimales) : String(Math.round(Number(v)));
      default: return String(v);
    }
  }

  function numFolio(r) { var m = /(\d+)$/.exec(String(r.folio || '')); return m ? Number(m[1]) : 0; }

  function generarCsv(registros) {
    var vs = variables();
    var lineas = [vs.map(function (c) { return c.id; }).join(',')];
    (registros || []).slice().sort(function (a, b) { return numFolio(a) - numFolio(b); }).forEach(function (r) {
      lineas.push(vs.map(function (c) { return valorCsv(c, r[c.id]); }).join(','));
    });
    return lineas.join('\r\n') + '\r\n';
  }

  // Parte una lista de nombres en renglones cortos (las líneas de sintaxis deben ser breves)
  function enRenglones(nombres, sangria) {
    var out = [], linea = '';
    nombres.forEach(function (n) {
      if ((linea + ' ' + n).length > 70) { out.push(sangria + linea.trim()); linea = ''; }
      linea += ' ' + n;
    });
    if (linea.trim()) out.push(sangria + linea.trim());
    return out;
  }

  /**
   * @param {string} nombreCsv  nombre del archivo CSV (en la misma carpeta que la sintaxis)
   * @param {object} [opc]      { carpeta: 'C:\\SPSS\\Protocolo_EVC', fecha: 'AAAA-MM-DD' }
   */
  function generarSintaxis(nombreCsv, opc) {
    opc = opc || {};
    var carpeta = opc.carpeta || 'C:\\SPSS\\Protocolo_EVC';
    var fecha = opc.fecha || EVC.hoyISO();
    var esq = EVC.ESQUEMA;
    var vs = variables();
    var L = [];

    L.push('* Encoding: UTF-8.');
    L.push('* ==========================================================================.');
    L.push('* Sintaxis generada por la aplicación de recolección de datos.');
    L.push('* Protocolo ' + esq.protocolo + ' · esquema v' + esq.version + ' · generada el ' + EVC.fmtFecha(fecha) + '.');
    L.push('* PASOS: 1) Guarde esta sintaxis y ' + nombreCsv + ' en la misma carpeta.');
    L.push('*        2) Escriba la ruta de esa carpeta en la línea CD de abajo.');
    L.push('*        3) Menú Ejecutar > Todo. Se crea base_evc.sav con todas las etiquetas.');
    L.push('* ==========================================================================.');
    L.push('');
    L.push('CD ' + comillas(carpeta) + '.');
    L.push('SET DECIMAL=DOT.');
    L.push('');
    L.push('GET DATA');
    L.push('  /TYPE=TXT');
    L.push('  /FILE=' + comillas(nombreCsv));
    L.push("  /ENCODING='UTF8'");
    L.push('  /DELCASE=LINE');
    L.push('  /DELIMITERS=","');
    L.push("  /QUALIFIER='\"'");
    L.push('  /ARRANGEMENT=DELIMITED');
    L.push('  /FIRSTCASE=2');
    L.push('  /IMPORTCASE=ALL');
    L.push('  /VARIABLES=');
    vs.forEach(function (c) { L.push('    ' + c.id + ' ' + formato(c)); });
    L.push('.');
    L.push('CACHE.');
    L.push('EXECUTE.');
    L.push('DATASET NAME BaseEVC WINDOW=FRONT.');
    L.push('');

    L.push('VARIABLE LABELS');
    vs.forEach(function (c, i) { L.push('  ' + (i ? '/' : '') + c.id + ' ' + comillas(etiqueta(c))); });
    L.push('.');
    L.push('');

    var conOpciones = vs.filter(function (c) { return c.tipo === 'opcion'; });
    L.push('VALUE LABELS');
    conOpciones.forEach(function (c, i) {
      L.push('  ' + (i ? '/' : '') + c.id);
      c.opciones.forEach(function (o) { L.push('    ' + o[0] + ' ' + comillas(o[1])); });
    });
    L.push('.');
    L.push('');

    var grupos = { NOMINAL: [], ORDINAL: [], SCALE: [] };
    vs.forEach(function (c) { grupos[nivel(c)].push(c.id); });
    L.push('VARIABLE LEVEL');
    var primero = true;
    ['NOMINAL', 'ORDINAL', 'SCALE'].forEach(function (k) {
      if (!grupos[k].length) return;
      var renglones = enRenglones(grupos[k], '    ');
      renglones[0] = '  ' + (primero ? '' : '/') + renglones[0].trim();
      renglones[renglones.length - 1] += ' (' + k + ')';
      L.push.apply(L, renglones);
      primero = false;
    });
    L.push('.');
    L.push('');

    L.push('* Verificación rápida de las variables principales.');
    L.push('FREQUENCIES VARIABLES=fase dictamen nlr_cat nihss_cat mrs_90 mrs_dic');
    L.push('  /ORDER=ANALYSIS.');
    L.push('');
    L.push("SAVE OUTFILE='base_evc.sav'");
    L.push('  /COMPRESSED.');
    return L.join('\r\n') + '\r\n';
  }

  return {
    formato: formato,
    nivel: nivel,
    etiqueta: etiqueta,
    generarCsv: generarCsv,
    generarSintaxis: generarSintaxis
  };
})();
