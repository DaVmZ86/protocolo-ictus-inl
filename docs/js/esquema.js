/* =============================================================================
 * esquema.js — Diccionario de variables, cálculos y validaciones del protocolo
 *
 *   «Asociación del índice neutrófilo/linfocito con la dependencia funcional a
 *    los 90 días en pacientes con evento cerebrovascular isquémico agudo»
 *    Protocolo PI-2026-7694 · Anexo 3 (Hoja de recolección de datos)
 *
 * FUENTE ÚNICA DE VERDAD. Este mismo archivo se usa, sin cambios, en:
 *   · el navegador ............ docs/js/esquema.js
 *   · Google Apps Script ...... apps-script/Esquema.gs   (copia exacta)
 *   · herramientas Node ....... tools/sincronizar.mjs
 *
 * Si modifica variables aquí ejecute:   node tools/sincronizar.mjs
 * y vuelva a pegar Esquema.gs en el editor de Apps Script.
 *
 * Reglas: no usar DOM ni APIs exclusivas del navegador; sólo JavaScript
 * estándar compatible con el motor V8 de Apps Script.
 * ============================================================================= */

var EVC = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Catálogos reutilizables
  // ---------------------------------------------------------------------------
  var SI_NO = [[1, 'Sí'], [0, 'No']];
  var NO_SI = [[0, 'No'], [1, 'Sí']];
  var AUSENTE_PRESENTE = [[0, 'Ausente'], [1, 'Presente']];

  function criterio(id, etiqueta, etiquetaSpss, extra) {
    var c = { id: id, etiqueta: etiqueta, etiquetaSpss: etiquetaSpss, tipo: 'opcion', opciones: SI_NO, nivel: 'nominal', fila: true };
    if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
    return c;
  }
  function comorbilidad(id, etiqueta, ayuda) {
    return { id: id, etiqueta: etiqueta, tipo: 'opcion', opciones: AUSENTE_PRESENTE, nivel: 'nominal', ayuda: ayuda };
  }
  function huboDefuncion(r) { return r.mort_90 === 1 || r.mort_intrahosp === 1 || r.mrs_90 === 6; }
  function sinFuenteExpediente(r) { return r.fuente_info !== 1; }

  // ---------------------------------------------------------------------------
  // Esquema (orden = orden de columnas en la hoja de datos y en SPSS)
  //
  // Propiedades de cada campo:
  //   id ............ nombre de la variable (SPSS: minúsculas, sin acentos)
  //   etiqueta ...... texto en el formulario; etiquetaSpss: etiqueta corta
  //   tipo .......... texto | textolargo | numero | opcion | fecha | hora
  //   opciones ...... [[código, etiqueta], ...]  (sólo tipo opcion)
  //   unidad ........ unidad mostrada; unidadSpss: versión ASCII para SPSS
  //   min/max/decimales  rango y precisión permitidos (tipo numero)
  //   nivel ......... nominal | ordinal | escala  (nivel de medición SPSS)
  //   calculado ..... true = lo calcula la aplicación (no se captura)
  //   autocalc ...... true = se calcula si hay datos; si no, se captura
  //   requerido ..... obligatorio para guardar
  //   opcional ...... no cuenta para el % de completitud
  //   visibleSi ..... función(registro) → si el campo aplica
  //   longitud ...... longitud máxima de texto (ancho A en SPSS)
  //   fila .......... ocupa toda la fila en el formulario
  //   grupo ......... subtítulo que se muestra antes del campo
  //   asistente ..... nihss | mrs  (abre una calculadora de apoyo)
  // ---------------------------------------------------------------------------
  var ESQUEMA = {
    version: '1.0.0',
    protocolo: 'PI-2026-7694',
    titulo: 'Asociación del índice neutrófilo/linfocito con la dependencia funcional a los 90 días en pacientes con evento cerebrovascular isquémico agudo',
    sede: 'HGZ/MF No. 12, Lázaro Cárdenas, Michoacán',
    tamanoMuestra: 218,
    corteNLR: 3.51,
    ventana: { dia: 90, menos: 14, mas: 14 },
    secciones: [
      {
        id: 'identificacion',
        titulo: 'Identificación del registro',
        campos: [
          { id: 'folio', etiqueta: 'Folio del participante', tipo: 'texto', requerido: true, longitud: 12, nivel: 'nominal',
            patron: '^EVC-[0-9]{3,4}$', mensajePatron: 'use el formato EVC-001',
            ayuda: 'Código consecutivo (EVC-001, EVC-002…). No capture nombre, NSS, domicilio ni teléfono del paciente.' },
          { id: 'fecha_llenado', etiqueta: 'Fecha de llenado', tipo: 'fecha', nivel: 'escala' },
          { id: 'fase', etiqueta: 'Fase del estudio', tipo: 'opcion', requerido: true, nivel: 'nominal',
            opciones: [[1, 'Retrospectiva (2023–2025)'], [2, 'Prospectiva (a partir de 2026)']] }
        ]
      },
      {
        id: 'criterios',
        titulo: 'I. Verificación de criterios de selección',
        campos: [
          criterio('inc1_edad18', '1. Paciente de 18 años o más al momento del ingreso.',
            'Inclusión 1: 18 años o más', { grupo: 'Criterios de inclusión — todos deben responderse «Sí»' }),
          criterio('inc2_evc_tc', '2. Diagnóstico de evento cerebrovascular isquémico agudo confirmado por cuadro clínico y tomografía computarizada de cráneo.',
            'Inclusión 2: EVC isquémico confirmado por clínica y TC'),
          criterio('inc3_bh', '3. Biometría hemática completa disponible al ingreso hospitalario (neutrófilos y linfocitos absolutos).',
            'Inclusión 3: biometría hemática al ingreso disponible'),
          criterio('inc4_nihss', '4. Puntuación NIHSS al ingreso consignada en el expediente clínico.',
            'Inclusión 4: NIHSS al ingreso consignado'),
          criterio('inc5_mrs_disp', '5. Componente retrospectivo: información disponible en el expediente para asignar la escala de Rankin modificada dentro de la ventana de 90 ± 14 días.',
            'Inclusión 5: información para mRS a 90 días',
            { ayuda: 'En el componente prospectivo marque «Sí» (no aplica); el seguimiento se verifica al cierre.' }),
          criterio('noinc6_hemorragico', '6. Evento cerebrovascular hemorrágico confirmado por tomografía de cráneo.',
            'No inclusión 6: EVC hemorrágico por TC', { grupo: 'Criterios de no inclusión — todos deben responderse «No»' }),
          criterio('noinc7_infeccion', '7. Infección activa documentada clínicamente al ingreso.',
            'No inclusión 7: infección activa al ingreso'),
          criterio('noinc8_inmuno', '8. Neoplasia hematológica, enfermedad autoinmune activa o inmunosupresión farmacológica (corticosteroides, quimioterapia o biológicos).',
            'No inclusión 8: neoplasia hematológica, autoinmunidad o inmunosupresión'),
          criterio('noinc9_incompletos', '9. Datos basales incompletos en el expediente: biometría hemática o NIHSS basal.',
            'No inclusión 9: datos basales incompletos'),
          criterio('elim10_perdida', '10. Pérdida durante el seguimiento (cuatro intentos de contacto sin éxito dentro de la ventana de 90 ± 14 días).',
            'Eliminación 10: pérdida durante el seguimiento', { grupo: 'Criterios de eliminación — se verifican al término del seguimiento', opcional: true }),
          criterio('elim11_def_no_rel', '11. Defunción por causa no relacionada con el evento cerebrovascular antes de la evaluación de los 90 días.',
            'Eliminación 11: defunción no relacionada con el EVC', { opcional: true }),
          { id: 'dictamen', etiqueta: 'Dictamen', tipo: 'opcion', calculado: true, nivel: 'nominal',
            opciones: [[1, 'Incluido'], [2, 'No incluido'], [3, 'Eliminado']],
            ayuda: 'Automático: algún criterio de inclusión «No» o de no inclusión «Sí» → No incluido; algún criterio de eliminación «Sí» → Eliminado.' },
          { id: 'motivo_dictamen', etiqueta: 'Motivo del dictamen (si aplica)', tipo: 'texto', longitud: 255, opcional: true, nivel: 'nominal', fila: true }
        ]
      },
      {
        id: 'sociodemograficas',
        titulo: 'II. Variables sociodemográficas',
        campos: [
          { id: 'edad', etiqueta: 'Edad', tipo: 'numero', unidad: 'años', min: 0, max: 120, decimales: 0, nivel: 'escala',
            ayuda: 'Años cumplidos al ingreso.' },
          { id: 'sexo', etiqueta: 'Sexo', tipo: 'opcion', nivel: 'nominal', opciones: [[0, 'Masculino'], [1, 'Femenino']] },
          { id: 'escolaridad', etiqueta: 'Escolaridad', tipo: 'opcion', nivel: 'ordinal',
            opciones: [[0, 'Sin escolaridad'], [1, 'Primaria'], [2, 'Secundaria'], [3, 'Bachillerato'], [4, 'Licenciatura o superior']] },
          { id: 'estado_civil', etiqueta: 'Estado civil', tipo: 'opcion', nivel: 'nominal',
            opciones: [[0, 'Soltero'], [1, 'Casado o unión libre'], [2, 'Divorciado o separado'], [3, 'Viudo']] },
          { id: 'ocupacion', etiqueta: 'Ocupación', tipo: 'opcion', nivel: 'nominal',
            opciones: [[0, 'Trabajador asalariado'], [1, 'Trabajador independiente'], [2, 'Desempleado'], [3, 'Ama de casa'], [4, 'Pensionado']] }
        ]
      },
      {
        id: 'comorbilidades',
        titulo: 'III. Comorbilidades y antecedentes',
        campos: [
          comorbilidad('has', 'Hipertensión arterial sistémica', 'Diagnóstico previo o uso de antihipertensivos al ingreso (umbral ≥ 130/80 mmHg).'),
          comorbilidad('dm2', 'Diabetes mellitus tipo 2', 'Diagnóstico previo, uso de hipoglucemiantes o insulina, o HbA1c ≥ 6,5 % durante la hospitalización.'),
          comorbilidad('dislipidemia', 'Dislipidemia', 'Diagnóstico previo, uso de hipolipemiantes o LDL ≥ 130 mg/dL durante la hospitalización.'),
          comorbilidad('fa', 'Fibrilación auricular', 'Diagnóstico previo o electrocardiograma durante la hospitalización.'),
          comorbilidad('cardiopatia_isq', 'Cardiopatía isquémica', 'Antecedente de infarto del miocardio, angina o revascularización coronaria (stent).'),
          comorbilidad('erc', 'Enfermedad renal crónica', 'Diagnóstico previo o TFG estimada < 60 mL/min/1,73 m² al ingreso.'),
          { id: 'tabaquismo', etiqueta: 'Tabaquismo', tipo: 'opcion', nivel: 'ordinal',
            opciones: [[0, 'Nunca fumador'], [1, 'Exfumador (abstinencia ≥ 6 meses)'], [2, 'Fumador activo']] },
          { id: 'alcohol', etiqueta: 'Consumo de alcohol', tipo: 'opcion', nivel: 'ordinal', fila: true,
            opciones: [[0, 'No bebedor (0 bebidas/sem.)'], [1, 'Consumo ligero (1 a 7 bebidas/sem.)'], [2, 'Consumo moderado (8 a 14 bebidas/sem.)'], [3, 'Consumo pesado / de riesgo (> 14 bebidas/sem.)']] }
        ]
      },
      {
        id: 'clinicas',
        titulo: 'IV. Características clínicas al ingreso',
        campos: [
          { id: 'fecha_evento', etiqueta: 'Fecha del evento índice', tipo: 'fecha', nivel: 'escala' },
          { id: 'hora_inicio', etiqueta: 'Hora de inicio de los síntomas', tipo: 'hora', nivel: 'escala', ayuda: 'Formato de 24 horas.' },
          { id: 'fecha_admision', etiqueta: 'Fecha de admisión a Urgencias', tipo: 'fecha', nivel: 'escala' },
          { id: 'hora_admision', etiqueta: 'Hora de admisión a Urgencias', tipo: 'hora', nivel: 'escala' },
          { id: 't_sintomas_puerta', etiqueta: 'Tiempo síntomas-puerta', tipo: 'numero', unidad: 'minutos', min: 0, max: 100000, decimales: 0,
            nivel: 'escala', autocalc: true,
            ayuda: 'Se calcula con la fecha/hora del evento y de admisión. Si no constan las horas puede capturarlo manualmente.' },
          { id: 'tas', etiqueta: 'Tensión arterial sistólica al ingreso', tipo: 'numero', unidad: 'mmHg', min: 40, max: 300, decimales: 0, nivel: 'escala',
            ayuda: 'Primera medición consignada en la nota médica.' },
          { id: 'tad', etiqueta: 'Tensión arterial diastólica al ingreso', tipo: 'numero', unidad: 'mmHg', min: 20, max: 200, decimales: 0, nivel: 'escala',
            ayuda: 'Primera medición consignada en la nota médica.' },
          { id: 'tc_confirmada', etiqueta: 'Confirmación por tomografía de cráneo', tipo: 'opcion', opciones: NO_SI, nivel: 'nominal' },
          { id: 'fecha_tc', etiqueta: 'Fecha del estudio tomográfico', tipo: 'fecha', nivel: 'escala',
            visibleSi: function (r) { return r.tc_confirmada === 1; } },
          { id: 'nihss', etiqueta: 'NIHSS basal (puntuación total)', tipo: 'numero', unidad: 'puntos', min: 0, max: 42, decimales: 0, nivel: 'ordinal',
            asistente: 'nihss', ayuda: 'Consignado por el médico tratante en las primeras 24 horas (Anexo 5).' },
          { id: 'nihss_cat', etiqueta: 'NIHSS basal (categoría)', tipo: 'opcion', calculado: true, nivel: 'ordinal',
            opciones: [[1, 'Leve (0–4)'], [2, 'Moderado (5–15)'], [3, 'Moderado-severo (16–20)'], [4, 'Severo (21–42)']] }
        ]
      },
      {
        id: 'laboratorio',
        titulo: 'V. Parámetros de laboratorio al ingreso',
        campos: [
          { id: 'fecha_muestra', etiqueta: 'Fecha de toma de la muestra', tipo: 'fecha', nivel: 'escala' },
          { id: 'hora_muestra', etiqueta: 'Hora de toma de la muestra', tipo: 'hora', nivel: 'escala' },
          { id: 'leucocitos', etiqueta: 'Leucocitos totales', tipo: 'numero', unidad: '×10⁹/L', unidadSpss: 'x10^9/L', min: 0, max: 200, decimales: 2, nivel: 'escala' },
          { id: 'neutrofilos', etiqueta: 'Neutrófilos absolutos', tipo: 'numero', unidad: '×10⁹/L', unidadSpss: 'x10^9/L', min: 0, max: 200, decimales: 2, nivel: 'escala' },
          { id: 'linfocitos', etiqueta: 'Linfocitos absolutos', tipo: 'numero', unidad: '×10⁹/L', unidadSpss: 'x10^9/L', min: 0.01, max: 100, decimales: 2, nivel: 'escala' },
          { id: 'plaquetas', etiqueta: 'Plaquetas', tipo: 'numero', unidad: '×10⁹/L', unidadSpss: 'x10^9/L', min: 0, max: 2000, decimales: 0, nivel: 'escala' },
          { id: 'nlr', etiqueta: 'Índice neutrófilo-linfocito (NLR)', tipo: 'numero', calculado: true, decimales: 2, nivel: 'escala',
            ayuda: 'Neutrófilos absolutos ÷ linfocitos absolutos, con dos decimales.' },
          { id: 'nlr_cat', etiqueta: 'NLR categorizado', tipo: 'opcion', calculado: true, nivel: 'nominal',
            opciones: [[0, 'No elevado (< 3,51)'], [1, 'Elevado (≥ 3,51)']] },
          { id: 'glucosa', etiqueta: 'Glucemia al ingreso', tipo: 'numero', unidad: 'mg/dL', min: 10, max: 2000, decimales: 1, nivel: 'escala',
            ayuda: 'Química sanguínea de ingreso.' },
          { id: 'col_total', etiqueta: 'Colesterol total', tipo: 'numero', unidad: 'mg/dL', min: 10, max: 1500, decimales: 1, nivel: 'escala', ayuda: 'Perfil de lípidos.' },
          { id: 'hdl', etiqueta: 'Colesterol HDL', tipo: 'numero', unidad: 'mg/dL', min: 1, max: 300, decimales: 1, nivel: 'escala', ayuda: 'Perfil de lípidos.' },
          { id: 'ldl', etiqueta: 'Colesterol LDL', tipo: 'numero', unidad: 'mg/dL', min: 1, max: 1000, decimales: 1, nivel: 'escala', ayuda: 'Perfil de lípidos.' },
          { id: 'trigliceridos', etiqueta: 'Triglicéridos', tipo: 'numero', unidad: 'mg/dL', min: 10, max: 10000, decimales: 1, nivel: 'escala', ayuda: 'Perfil de lípidos.' }
        ]
      },
      {
        id: 'tratamiento',
        titulo: 'VI. Tratamiento y evolución intrahospitalaria',
        campos: [
          { id: 'trombolisis', etiqueta: 'Trombólisis con rt-PA', tipo: 'opcion', nivel: 'nominal',
            opciones: [[0, 'No administrada'], [1, 'Sí administrada']] },
          { id: 't_puerta_aguja', etiqueta: 'Tiempo puerta-aguja', tipo: 'numero', unidad: 'minutos', min: 0, max: 1440, decimales: 0, nivel: 'escala',
            visibleSi: function (r) { return r.trombolisis === 1; }, ayuda: 'Sólo en pacientes trombolizados.' },
          { id: 'fecha_egreso', etiqueta: 'Fecha de egreso hospitalario', tipo: 'fecha', nivel: 'escala' },
          { id: 'mort_intrahosp', etiqueta: 'Mortalidad intrahospitalaria', tipo: 'opcion', nivel: 'nominal',
            opciones: [[0, 'Vivo al egreso'], [1, 'Defunción intrahospitalaria']] }
        ]
      },
      {
        id: 'desenlace',
        titulo: 'VII. Desenlace funcional a los 90 días',
        campos: [
          { id: 'fecha_teorica_90', etiqueta: 'Fecha teórica de evaluación (día 90)', tipo: 'fecha', calculado: true, nivel: 'escala' },
          { id: 'ventana_inicio', etiqueta: 'Ventana de evaluación: desde (día 76)', tipo: 'fecha', calculado: true, nivel: 'escala' },
          { id: 'ventana_fin', etiqueta: 'Ventana de evaluación: hasta (día 104)', tipo: 'fecha', calculado: true, nivel: 'escala' },
          { id: 'fecha_eval', etiqueta: 'Fecha real de evaluación', tipo: 'fecha', nivel: 'escala' },
          { id: 'dia_eval', etiqueta: 'Día posterior al evento en que se evaluó', tipo: 'numero', unidad: 'días', decimales: 0, calculado: true, nivel: 'escala' },
          { id: 'eval_en_ventana', etiqueta: 'Evaluación dentro de la ventana de 90 ± 14 días', tipo: 'opcion', calculado: true, nivel: 'nominal',
            opciones: [[0, 'Fuera de la ventana'], [1, 'Dentro de la ventana']] },
          { id: 'fuente_info', etiqueta: 'Fuente de la información', tipo: 'opcion', nivel: 'nominal', fila: true,
            opciones: [[1, 'Nota del expediente clínico electrónico'], [2, 'Entrevista telefónica al paciente'], [3, 'Entrevista telefónica al familiar responsable']] },
          { id: 'consentimiento_verbal', etiqueta: 'Aceptación verbal de la entrevista telefónica (Anexo 6)', tipo: 'opcion', nivel: 'nominal',
            opciones: [[1, 'Sí acepta'], [0, 'No acepta']],
            visibleSi: function (r) { return r.fuente_info === 2 || r.fuente_info === 3; } },
          { id: 'intento1', etiqueta: '1.er intento de contacto', tipo: 'fecha', opcional: true, nivel: 'escala', visibleSi: sinFuenteExpediente,
            grupo: 'Intentos de contacto telefónico — cuatro intentos sin éxito configuran pérdida durante el seguimiento' },
          { id: 'intento2', etiqueta: '2.º intento de contacto', tipo: 'fecha', opcional: true, nivel: 'escala', visibleSi: sinFuenteExpediente },
          { id: 'intento3', etiqueta: '3.er intento de contacto', tipo: 'fecha', opcional: true, nivel: 'escala', visibleSi: sinFuenteExpediente },
          { id: 'intento4', etiqueta: '4.º intento de contacto', tipo: 'fecha', opcional: true, nivel: 'escala', visibleSi: sinFuenteExpediente },
          { id: 'mrs_90', etiqueta: 'Puntuación mRS a los 90 días', tipo: 'opcion', nivel: 'ordinal', fila: true, asistente: 'mrs',
            ayuda: 'Escala de Rankin modificada completa (Anexo 4).',
            opciones: [[0, 'Asintomático'], [1, 'Sin incapacidad significativa'], [2, 'Incapacidad leve'], [3, 'Incapacidad moderada'],
              [4, 'Incapacidad moderadamente severa'], [5, 'Incapacidad severa'], [6, 'Defunción']] },
          { id: 'mrs_dic', etiqueta: 'Desenlace funcional (dicotómico)', tipo: 'opcion', calculado: true, nivel: 'nominal',
            opciones: [[0, 'Independencia funcional (mRS 0–2)'], [1, 'Dependencia funcional (mRS 3–6)']] },
          { id: 'mort_90', etiqueta: 'Mortalidad a los 90 días', tipo: 'opcion', nivel: 'nominal',
            opciones: [[0, 'Vivo a los 90 días'], [1, 'Defunción dentro de los 90 días']] },
          { id: 'fecha_defuncion', etiqueta: 'Fecha de defunción', tipo: 'fecha', nivel: 'escala', visibleSi: huboDefuncion },
          { id: 'causa_def_rel', etiqueta: 'Causa de la defunción relacionada con el EVC', tipo: 'opcion', nivel: 'nominal', visibleSi: huboDefuncion,
            opciones: [[0, 'No relacionada (criterio de eliminación)'], [1, 'Relacionada']] }
        ]
      },
      {
        id: 'observaciones',
        titulo: 'VIII. Observaciones e incidencias',
        campos: [
          { id: 'observaciones', etiqueta: 'Observaciones e incidencias', tipo: 'textolargo', longitud: 1000, opcional: true, nivel: 'nominal', fila: true }
        ]
      }
    ]
  };

  // Anexo 4 — descripción operativa de la mRS
  var MRS_DESCRIPCION = {
    0: 'Sin síntomas atribuibles al evento cerebrovascular.',
    1: 'Persisten síntomas, pero realiza todas sus actividades y obligaciones habituales.',
    2: 'No puede realizar todas sus actividades previas, pero se vale por sí mismo sin asistencia.',
    3: 'Requiere alguna ayuda para sus actividades, pero camina sin asistencia de otra persona.',
    4: 'No puede caminar sin asistencia ni atender sus necesidades corporales sin ayuda.',
    5: 'Postrado en cama, incontinente; requiere cuidados y atención de enfermería constantes.',
    6: 'Fallecimiento del paciente.'
  };

  // Anexo 5 — ítems de la NIHSS [ítem, dominio, puntaje máximo]
  var NIHSS_ITEMS = [
    ['1a', 'Nivel de conciencia', 3],
    ['1b', 'Nivel de conciencia: preguntas orientadas (mes y edad)', 2],
    ['1c', 'Nivel de conciencia: obediencia a órdenes', 2],
    ['2', 'Mirada conjugada horizontal', 2],
    ['3', 'Campos visuales', 3],
    ['4', 'Paresia facial', 3],
    ['5a', 'Función motora de la extremidad superior izquierda', 4],
    ['5b', 'Función motora de la extremidad superior derecha', 4],
    ['6a', 'Función motora de la extremidad inferior izquierda', 4],
    ['6b', 'Función motora de la extremidad inferior derecha', 4],
    ['7', 'Ataxia de las extremidades', 2],
    ['8', 'Sensibilidad', 2],
    ['9', 'Lenguaje (afasia)', 3],
    ['10', 'Disartria', 2],
    ['11', 'Extinción e inatención (negligencia)', 2]
  ];

  // Anexo 6 — secuencia de la entrevista telefónica estructurada
  var MRS_ENTREVISTA = [
    { pregunta: '¿El paciente falleció?', nota: 'Registre la fecha y la causa referida.', si: 6 },
    { pregunta: '¿El paciente permanece en cama la mayor parte del día, no controla esfínteres y requiere cuidados de otra persona de manera constante?', si: 5 },
    { pregunta: '¿Necesita ayuda de otra persona para caminar, o bien para bañarse, vestirse, comer o ir al baño?', si: 4 },
    { pregunta: '¿Necesita ayuda de otra persona para actividades como hacer las compras, preparar sus alimentos, manejar dinero o trasladarse, aunque camine sin ayuda?', si: 3 },
    { pregunta: '¿Ha dejado de realizar alguna de las actividades que hacía antes de la enfermedad (trabajo, labores del hogar, pasatiempos), aunque se valga por sí mismo?', si: 2 },
    { pregunta: '¿Presenta todavía alguna molestia o síntoma derivado de la enfermedad, aunque realice todas sus actividades habituales?', si: 1, no: 0 }
  ];

  // ---------------------------------------------------------------------------
  // Índices
  // ---------------------------------------------------------------------------
  var PLANOS = [];
  var POR_ID = {};
  ESQUEMA.secciones.forEach(function (s) {
    s.campos.forEach(function (c) { c.seccion = s.id; PLANOS.push(c); POR_ID[c.id] = c; });
  });

  function campos() { return PLANOS.slice(); }
  function campo(id) { return POR_ID[id] || null; }
  function columnas() { return PLANOS.map(function (c) { return c.id; }); }

  // ---------------------------------------------------------------------------
  // Utilidades de fechas (cadenas ISO aaaa-mm-dd y hh:mm, sin zonas horarias)
  // ---------------------------------------------------------------------------
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function esNum(v) { return typeof v === 'number' && isFinite(v); }
  function vacio(v) { return v === null || v === undefined || v === ''; }
  function esFecha(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return p[0] >= 1900 && p[0] <= 2100 && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function esHora(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function msUTC(fecha, hora) {
    var p = fecha.split('-').map(Number);
    var h = hora ? hora.split(':').map(Number) : [0, 0];
    return Date.UTC(p[0], p[1] - 1, p[2], h[0], h[1]);
  }
  function isoDeMs(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate()); }
  function sumarDias(fecha, n) { return isoDeMs(msUTC(fecha) + n * 86400000); }
  function difDias(desde, hasta) { return Math.round((msUTC(hasta) - msUTC(desde)) / 86400000); }
  function difMinutos(f1, h1, f2, h2) {
    if (!esFecha(f1) || !esHora(h1) || !esFecha(f2) || !esHora(h2)) return null;
    return Math.round((msUTC(f2, h2) - msUTC(f1, h1)) / 60000);
  }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function fmtFecha(s) { return esFecha(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  // Redondeo «mitad hacia arriba» en base decimal (igual que ROUND de Excel/SPSS)
  function redondear(x, d) { var f = Math.pow(10, d); return Math.round(x * f + (x >= 0 ? 1e-9 : -1e-9)) / f; }

  // ---------------------------------------------------------------------------
  // Visibilidad, variables derivadas y limpieza
  // ---------------------------------------------------------------------------
  function esVisible(c, r) { return typeof c.visibleSi === 'function' ? !!c.visibleSi(r) : true; }

  var INCLUSION = ['inc1_edad18', 'inc2_evc_tc', 'inc3_bh', 'inc4_nihss', 'inc5_mrs_disp'];
  var NO_INCLUSION = ['noinc6_hemorragico', 'noinc7_infeccion', 'noinc8_inmuno', 'noinc9_incompletos'];
  var ELIMINACION = ['elim10_perdida', 'elim11_def_no_rel'];

  function calcularDictamen(r) {
    var algunaInclusionNo = INCLUSION.some(function (k) { return r[k] === 0; });
    var algunaNoInclusionSi = NO_INCLUSION.some(function (k) { return r[k] === 1; });
    if (algunaInclusionNo || algunaNoInclusionSi) return 2;
    var faltan = INCLUSION.concat(NO_INCLUSION).some(function (k) { return !esNum(r[k]); });
    if (faltan) return null;
    if (ELIMINACION.some(function (k) { return r[k] === 1; })) return 3;
    return 1;
  }

  function calcularDerivadas(r) {
    // NIHSS categorizada
    r.nihss_cat = esNum(r.nihss) ? (r.nihss <= 4 ? 1 : r.nihss <= 15 ? 2 : r.nihss <= 20 ? 3 : 4) : null;
    // NLR y punto de corte pre-especificado
    if (esNum(r.neutrofilos) && esNum(r.linfocitos) && r.linfocitos > 0) {
      r.nlr = redondear(r.neutrofilos / r.linfocitos, 2);
      r.nlr_cat = r.nlr >= ESQUEMA.corteNLR ? 1 : 0;
    } else { r.nlr = null; r.nlr_cat = null; }
    // Tiempo síntomas-puerta (sólo si constan fechas y horas)
    var m = difMinutos(r.fecha_evento, r.hora_inicio, r.fecha_admision, r.hora_admision);
    if (m !== null) r.t_sintomas_puerta = m;
    // Ventana de seguimiento 90 ± 14 días
    if (esFecha(r.fecha_evento)) {
      r.fecha_teorica_90 = sumarDias(r.fecha_evento, ESQUEMA.ventana.dia);
      r.ventana_inicio = sumarDias(r.fecha_evento, ESQUEMA.ventana.dia - ESQUEMA.ventana.menos);
      r.ventana_fin = sumarDias(r.fecha_evento, ESQUEMA.ventana.dia + ESQUEMA.ventana.mas);
    } else { r.fecha_teorica_90 = null; r.ventana_inicio = null; r.ventana_fin = null; }
    if (esFecha(r.fecha_evento) && esFecha(r.fecha_eval)) {
      r.dia_eval = difDias(r.fecha_evento, r.fecha_eval);
      r.eval_en_ventana = (r.dia_eval >= ESQUEMA.ventana.dia - ESQUEMA.ventana.menos && r.dia_eval <= ESQUEMA.ventana.dia + ESQUEMA.ventana.mas) ? 1 : 0;
    } else { r.dia_eval = null; r.eval_en_ventana = null; }
    // Desenlace dicotómico
    r.mrs_dic = esNum(r.mrs_90) ? (r.mrs_90 >= 3 ? 1 : 0) : null;
    // Dictamen
    r.dictamen = calcularDictamen(r);
    return r;
  }

  // Borra los valores de campos que no aplican (p. ej. puerta-aguja sin trombólisis)
  function limpiarOcultos(r) {
    PLANOS.forEach(function (c) { if (!c.calculado && !esVisible(c, r)) r[c.id] = null; });
    return r;
  }

  // ---------------------------------------------------------------------------
  // Normalización de entrada (convierte tipos; descarta campos desconocidos)
  // ---------------------------------------------------------------------------
  function normalizar(entrada) {
    entrada = entrada || {};
    var r = {}, errores = [];
    PLANOS.forEach(function (c) {
      var v = entrada[c.id];
      if (vacio(v) || (typeof v === 'string' && v.trim() === '')) { r[c.id] = null; return; }
      if (c.tipo === 'numero' || c.tipo === 'opcion') {
        var n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
        if (!isFinite(n)) { errores.push({ campo: c.id, mensaje: c.etiqueta + ': valor no numérico' }); r[c.id] = null; } else r[c.id] = n;
      } else if (c.tipo === 'fecha' || c.tipo === 'hora') {
        r[c.id] = String(v).trim();
      } else {
        r[c.id] = String(v).trim().slice(0, c.longitud || 255);
      }
    });
    if (r.folio) r.folio = r.folio.toUpperCase();
    return { registro: r, errores: errores };
  }

  // ---------------------------------------------------------------------------
  // Validación: errores (impiden guardar) y advertencias (consistencia)
  // ---------------------------------------------------------------------------
  function validar(r) {
    var errores = [], adv = [];
    var hoy = hoyISO();
    function e(c, msg) { errores.push({ campo: c.id, mensaje: c.etiqueta + ': ' + msg }); }
    function a(id, msg) { adv.push({ campo: id, mensaje: msg }); }

    PLANOS.forEach(function (c) {
      if (c.calculado || !esVisible(c, r)) return;
      var v = r[c.id];
      if (vacio(v)) { if (c.requerido) errores.push({ campo: c.id, mensaje: c.etiqueta + ': es obligatorio', requerido: true }); return; }
      switch (c.tipo) {
        case 'numero':
          if (!esNum(v)) { e(c, 'debe ser un número'); break; }
          if (c.min !== undefined && v < c.min) e(c, 'debe ser mayor o igual a ' + c.min);
          else if (c.max !== undefined && v > c.max) e(c, 'debe ser menor o igual a ' + c.max);
          var f = Math.pow(10, c.decimales || 0);
          if (Math.abs(v * f - Math.round(v * f)) > 1e-6) e(c, c.decimales ? 'máximo ' + c.decimales + ' decimales' : 'debe ser un número entero');
          break;
        case 'opcion':
          if (!c.opciones.some(function (o) { return o[0] === v; })) e(c, 'opción no válida');
          break;
        case 'fecha':
          if (!esFecha(v)) e(c, 'fecha no válida');
          else if (v > hoy) e(c, 'no puede ser una fecha futura');
          break;
        case 'hora':
          if (!esHora(v)) e(c, 'hora no válida (hh:mm)');
          break;
        default:
          if (c.patron && !new RegExp(c.patron).test(v)) e(c, c.mensajePatron || 'formato no válido');
      }
    });

    // --- Consistencia clínica y del protocolo (no impiden guardar) ---
    if (esNum(r.edad) && r.inc1_edad18 === 1 && r.edad < 18) a('inc1_edad18', 'Criterio 1 marcado «Sí» pero la edad es menor de 18 años.');
    if (esNum(r.edad) && r.inc1_edad18 === 0 && r.edad >= 18) a('inc1_edad18', 'Criterio 1 marcado «No» pero la edad es de 18 años o más.');
    if (r.tc_confirmada === 0 && r.inc2_evc_tc === 1) a('tc_confirmada', 'Criterio 2 exige confirmación por TC, pero «Confirmación por TC» está en «No».');
    if (esNum(r.neutrofilos) && esNum(r.linfocitos) && esNum(r.leucocitos) && r.neutrofilos + r.linfocitos > r.leucocitos + 0.05)
      a('leucocitos', 'Neutrófilos + linfocitos superan los leucocitos totales; verifique las unidades (×10⁹/L).');
    if (esNum(r.tas) && esNum(r.tad) && r.tad >= r.tas) a('tad', 'La tensión diastólica es mayor o igual que la sistólica.');
    if (esNum(r.col_total) && esNum(r.hdl) && esNum(r.ldl) && r.hdl + r.ldl > r.col_total + 1) a('ldl', 'HDL + LDL superan el colesterol total.');
    if (esFecha(r.fecha_evento) && esFecha(r.fecha_admision) && r.fecha_admision < r.fecha_evento) a('fecha_admision', 'La admisión es anterior a la fecha del evento.');
    if (esFecha(r.fecha_admision) && esFecha(r.fecha_egreso) && r.fecha_egreso < r.fecha_admision) a('fecha_egreso', 'El egreso es anterior a la admisión.');
    var mBH = difMinutos(r.fecha_admision, r.hora_admision, r.fecha_muestra, r.hora_muestra);
    if (mBH !== null && (mBH > 1440 || mBH < -720)) a('fecha_muestra', 'La biometría hemática no corresponde a las primeras 24 horas del ingreso.');
    if (esFecha(r.fecha_evento)) {
      var anio = Number(r.fecha_evento.slice(0, 4));
      if (r.fase === 1 && (anio < 2023 || anio > 2025)) a('fase', 'Fase retrospectiva con evento fuera de 2023–2025.');
      if (r.fase === 2 && anio < 2026) a('fase', 'Fase prospectiva con evento anterior a 2026.');
    }
    if (r.eval_en_ventana === 0) a('fecha_eval', 'La evaluación (día ' + r.dia_eval + ') está fuera de la ventana de 90 ± 14 días.');
    if (r.mrs_90 === 6 && r.mort_90 !== 1) a('mort_90', 'mRS = 6 (defunción): la mortalidad a 90 días debería ser «Defunción».');
    if (r.mort_90 === 1 && esNum(r.mrs_90) && r.mrs_90 !== 6) a('mrs_90', 'Defunción a 90 días: la mRS debería ser 6.');
    if (r.mort_intrahosp === 1 && r.mort_90 === 0) a('mort_90', 'Defunción intrahospitalaria pero mortalidad a 90 días marcada «Vivo».');
    if (r.mort_intrahosp === 1 && esNum(r.mrs_90) && r.mrs_90 !== 6) a('mrs_90', 'Defunción intrahospitalaria: la mRS a 90 días debería ser 6.');
    if (r.trombolisis === 1 && !esNum(r.t_puerta_aguja)) a('t_puerta_aguja', 'Paciente trombolizado sin tiempo puerta-aguja.');
    if (r.consentimiento_verbal === 0 && esNum(r.mrs_90)) a('consentimiento_verbal', 'Sin aceptación verbal no debe registrarse la mRS; el caso se clasifica como pérdida (criterio 10).');
    if (r.causa_def_rel === 0 && r.elim11_def_no_rel !== 1) a('elim11_def_no_rel', 'Defunción no relacionada con el EVC: marque «Sí» en el criterio de eliminación 11.');
    var intentos = ['intento1', 'intento2', 'intento3', 'intento4'].filter(function (k) { return esFecha(r[k]); }).length;
    if (intentos === 4 && !esNum(r.mrs_90) && r.elim10_perdida !== 1) a('elim10_perdida', 'Cuatro intentos de contacto sin mRS: marque «Sí» en el criterio de eliminación 10.');

    return { errores: errores, advertencias: adv };
  }

  // Normaliza, calcula derivadas, limpia campos no aplicables y valida.
  function prepararParaGuardar(entrada) {
    var n = normalizar(entrada);
    var r = n.registro;
    calcularDerivadas(r);
    limpiarOcultos(r);
    var v = validar(r);
    return { registro: r, errores: n.errores.concat(v.errores), advertencias: v.advertencias };
  }

  // ---------------------------------------------------------------------------
  // Completitud y estado del seguimiento
  // ---------------------------------------------------------------------------
  function capturables(r, seccionId) {
    var soloCriterios = r.dictamen === 2; // si no se incluye, basta con identificación y criterios
    return PLANOS.filter(function (c) {
      if (c.calculado || c.opcional || !esVisible(c, r)) return false;
      if (seccionId && c.seccion !== seccionId) return false;
      if (soloCriterios && c.seccion !== 'identificacion' && c.seccion !== 'criterios') return false;
      return true;
    });
  }
  function completitud(r, seccionId) {
    var cs = capturables(r, seccionId);
    var llenos = cs.filter(function (c) { return !vacio(r[c.id]); }).length;
    return { llenos: llenos, total: cs.length, pct: cs.length ? Math.round(100 * llenos / cs.length) : 100 };
  }

  function estadoSeguimiento(r, hoy) {
    hoy = hoy || hoyISO();
    if (r.dictamen === 2) return { codigo: 'no_incluido', texto: 'No incluido' };
    if (r.dictamen === 3) return { codigo: 'eliminado', texto: 'Eliminado' };
    if (esNum(r.mrs_90)) return { codigo: 'completo', texto: 'Seguimiento completo' };
    if (!esFecha(r.ventana_inicio)) return { codigo: 'sin_fecha', texto: 'Falta fecha del evento' };
    if (hoy < r.ventana_inicio) return { codigo: 'programado', texto: 'Abre el ' + fmtFecha(r.ventana_inicio) };
    if (hoy <= r.ventana_fin) return { codigo: 'en_ventana', texto: 'En ventana hasta el ' + fmtFecha(r.ventana_fin) };
    return { codigo: 'vencido', texto: 'Ventana vencida (' + fmtFecha(r.ventana_fin) + ')' };
  }

  var CAMPOS_RESUMEN = ['folio', 'fase', 'fecha_evento', 'dictamen', 'nihss', 'nlr', 'nlr_cat', 'mrs_90', 'mrs_dic',
    'ventana_inicio', 'ventana_fin', 'fecha_eval', 'creado_por', 'modificado_por', 'fecha_modificacion'];
  function resumen(r) {
    var o = {};
    CAMPOS_RESUMEN.forEach(function (k) { o[k] = vacio(r[k]) ? null : r[k]; });
    o.completitud = completitud(r).pct;
    return o;
  }

  function siguienteFolio(folios) {
    var max = 0;
    (folios || []).forEach(function (f) {
      var m = /^EVC-(\d+)$/.exec(String(f || '').toUpperCase().trim());
      if (m) max = Math.max(max, Number(m[1]));
    });
    var n = String(max + 1);
    while (n.length < 3) n = '0' + n;
    return 'EVC-' + n;
  }

  function textoValor(c, v) {
    if (vacio(v)) return '—';
    if (c.tipo === 'opcion') {
      var o = c.opciones.filter(function (x) { return x[0] === v; })[0];
      return o ? v + ' = ' + o[1] : String(v);
    }
    if (c.tipo === 'fecha') return fmtFecha(v);
    if (c.tipo === 'numero') return (c.decimales ? Number(v).toFixed(c.decimales) : String(v)) + (c.unidad ? ' ' + c.unidad : '');
    return String(v);
  }

  return {
    ESQUEMA: ESQUEMA,
    MRS_DESCRIPCION: MRS_DESCRIPCION,
    NIHSS_ITEMS: NIHSS_ITEMS,
    MRS_ENTREVISTA: MRS_ENTREVISTA,
    campos: campos,
    campo: campo,
    columnas: columnas,
    esVisible: esVisible,
    calcularDerivadas: calcularDerivadas,
    limpiarOcultos: limpiarOcultos,
    normalizar: normalizar,
    validar: validar,
    prepararParaGuardar: prepararParaGuardar,
    completitud: completitud,
    estadoSeguimiento: estadoSeguimiento,
    resumen: resumen,
    siguienteFolio: siguienteFolio,
    textoValor: textoValor,
    esNum: esNum,
    esFecha: esFecha,
    esHora: esHora,
    vacio: vacio,
    hoyISO: hoyISO,
    fmtFecha: fmtFecha,
    sumarDias: sumarDias,
    difDias: difDias,
    difMinutos: difMinutos,
    redondear: redondear
  };
})();
