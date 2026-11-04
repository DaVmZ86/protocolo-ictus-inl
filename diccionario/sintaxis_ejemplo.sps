* Encoding: UTF-8.
* ==========================================================================.
* Sintaxis generada por la aplicación de recolección de datos.
* Protocolo PI-2026-7694 · esquema v1.1.0 · ejemplo (descargue la versión actual desde la aplicación → Exportar).
* PASOS: 1) Guarde esta sintaxis y base_evc_AAAA-MM-DD.csv en la misma carpeta.
*        2) Escriba la ruta de esa carpeta en la línea CD de abajo.
*        3) Menú Ejecutar > Todo. Se crea base_evc.sav con todas las etiquetas.
* ==========================================================================.

CD 'C:\SPSS\Protocolo_EVC'.
SET DECIMAL=DOT.

GET DATA
  /TYPE=TXT
  /FILE='base_evc_AAAA-MM-DD.csv'
  /ENCODING='UTF8'
  /DELCASE=LINE
  /DELIMITERS=","
  /QUALIFIER='"'
  /ARRANGEMENT=DELIMITED
  /FIRSTCASE=2
  /IMPORTCASE=ALL
  /VARIABLES=
    folio A12
    fecha_llenado SDATE10
    fase F2.0
    inc1_edad18 F2.0
    inc2_evc_tc F2.0
    inc3_bh F2.0
    inc4_nihss F2.0
    inc5_mrs_disp F2.0
    noinc6_hemorragico F2.0
    noinc7_infeccion F2.0
    noinc8_inmuno F2.0
    noinc9_incompletos F2.0
    elim10_perdida F2.0
    elim11_def_no_rel F2.0
    dictamen F2.0
    motivo_dictamen A255
    edad F8.0
    sexo F2.0
    escolaridad F2.0
    estado_civil F2.0
    ocupacion F2.0
    has F2.0
    dm2 F2.0
    dislipidemia F2.0
    fa F2.0
    cardiopatia_isq F2.0
    erc F2.0
    tabaquismo F2.0
    alcohol F2.0
    fecha_evento SDATE10
    hora_inicio TIME5
    fecha_admision SDATE10
    hora_admision TIME5
    t_sintomas_puerta F8.0
    tas F8.0
    tad F8.0
    tc_confirmada F2.0
    fecha_tc SDATE10
    nihss F8.0
    nihss_cat F2.0
    fecha_muestra SDATE10
    hora_muestra TIME5
    leucocitos F10.2
    neutrofilos F10.2
    linfocitos F10.2
    plaquetas F8.0
    nlr F10.2
    nlr_cat F2.0
    glucosa F10.1
    col_total F10.1
    hdl F10.1
    ldl F10.1
    trigliceridos F10.1
    trombolisis F2.0
    t_puerta_aguja F8.0
    fecha_egreso SDATE10
    mort_intrahosp F2.0
    fecha_teorica_90 SDATE10
    ventana_inicio SDATE10
    ventana_fin SDATE10
    fecha_eval SDATE10
    dia_eval F8.0
    eval_en_ventana F2.0
    fuente_info F2.0
    consentimiento_verbal F2.0
    intento1 SDATE10
    intento2 SDATE10
    intento3 SDATE10
    intento4 SDATE10
    mrs_90 F2.0
    mrs_dic F2.0
    mort_90 F2.0
    fecha_defuncion SDATE10
    causa_def_rel F2.0
    observaciones A1000
.
CACHE.
EXECUTE.
DATASET NAME BaseEVC WINDOW=FRONT.

VARIABLE LABELS
  folio 'Folio del participante'
  /fecha_llenado 'Fecha de llenado'
  /fase 'Fase del estudio'
  /inc1_edad18 'Inclusión 1: 18 años o más'
  /inc2_evc_tc 'Inclusión 2: EVC isquémico confirmado por clínica y TC'
  /inc3_bh 'Inclusión 3: biometría hemática al ingreso disponible'
  /inc4_nihss 'Inclusión 4: NIHSS al ingreso consignado'
  /inc5_mrs_disp 'Inclusión 5: información para mRS a 90 días'
  /noinc6_hemorragico 'No inclusión 6: EVC hemorrágico por TC'
  /noinc7_infeccion 'No inclusión 7: infección activa al ingreso'
  /noinc8_inmuno 'No inclusión 8: neoplasia hematológica, autoinmunidad o inmunosupresión'
  /noinc9_incompletos 'No inclusión 9: datos basales incompletos'
  /elim10_perdida 'Eliminación 10: pérdida durante el seguimiento'
  /elim11_def_no_rel 'Eliminación 11: defunción no relacionada con el EVC'
  /dictamen 'Dictamen'
  /motivo_dictamen 'Motivo del dictamen (si aplica)'
  /edad 'Edad (años)'
  /sexo 'Sexo'
  /escolaridad 'Escolaridad'
  /estado_civil 'Estado civil'
  /ocupacion 'Ocupación'
  /has 'Hipertensión arterial sistémica'
  /dm2 'Diabetes mellitus tipo 2'
  /dislipidemia 'Dislipidemia'
  /fa 'Fibrilación auricular'
  /cardiopatia_isq 'Cardiopatía isquémica'
  /erc 'Enfermedad renal crónica'
  /tabaquismo 'Tabaquismo'
  /alcohol 'Consumo de alcohol'
  /fecha_evento 'Fecha del evento índice'
  /hora_inicio 'Hora de inicio de los síntomas'
  /fecha_admision 'Fecha de admisión a Urgencias'
  /hora_admision 'Hora de admisión a Urgencias'
  /t_sintomas_puerta 'Tiempo síntomas-puerta (minutos)'
  /tas 'Tensión arterial sistólica al ingreso (mmHg)'
  /tad 'Tensión arterial diastólica al ingreso (mmHg)'
  /tc_confirmada 'Confirmación por tomografía de cráneo'
  /fecha_tc 'Fecha del estudio tomográfico'
  /nihss 'NIHSS basal (puntuación total) (puntos)'
  /nihss_cat 'NIHSS basal (categoría)'
  /fecha_muestra 'Fecha de toma de la muestra'
  /hora_muestra 'Hora de toma de la muestra'
  /leucocitos 'Leucocitos totales (x10^9/L)'
  /neutrofilos 'Neutrófilos absolutos (x10^9/L)'
  /linfocitos 'Linfocitos absolutos (x10^9/L)'
  /plaquetas 'Plaquetas (x10^9/L)'
  /nlr 'Índice neutrófilo-linfocito (NLR)'
  /nlr_cat 'NLR categorizado'
  /glucosa 'Glucemia al ingreso (mg/dL)'
  /col_total 'Colesterol total (mg/dL)'
  /hdl 'Colesterol HDL (mg/dL)'
  /ldl 'Colesterol LDL (mg/dL)'
  /trigliceridos 'Triglicéridos (mg/dL)'
  /trombolisis 'Trombólisis con rt-PA'
  /t_puerta_aguja 'Tiempo puerta-aguja (minutos)'
  /fecha_egreso 'Fecha de egreso hospitalario'
  /mort_intrahosp 'Mortalidad intrahospitalaria'
  /fecha_teorica_90 'Fecha teórica de evaluación (día 90)'
  /ventana_inicio 'Ventana de evaluación: desde (día 76)'
  /ventana_fin 'Ventana de evaluación: hasta (día 104)'
  /fecha_eval 'Fecha real de evaluación'
  /dia_eval 'Día posterior al evento en que se evaluó (días)'
  /eval_en_ventana 'Evaluación dentro de la ventana de 90 ± 14 días'
  /fuente_info 'Fuente de la información'
  /consentimiento_verbal 'Aceptación verbal de la entrevista telefónica (Anexo 6)'
  /intento1 '1.er intento de contacto'
  /intento2 '2.º intento de contacto'
  /intento3 '3.er intento de contacto'
  /intento4 '4.º intento de contacto'
  /mrs_90 'Puntuación mRS a los 90 días'
  /mrs_dic 'Desenlace funcional (dicotómico)'
  /mort_90 'Mortalidad a los 90 días'
  /fecha_defuncion 'Fecha de defunción'
  /causa_def_rel 'Causa de la defunción relacionada con el EVC'
  /observaciones 'Observaciones e incidencias'
.

VALUE LABELS
  fase
    1 'Retrospectiva (2023–2025)'
    2 'Prospectiva (a partir de 2026)'
  /inc1_edad18
    1 'Sí'
    0 'No'
  /inc2_evc_tc
    1 'Sí'
    0 'No'
  /inc3_bh
    1 'Sí'
    0 'No'
  /inc4_nihss
    1 'Sí'
    0 'No'
  /inc5_mrs_disp
    1 'Sí'
    0 'No'
  /noinc6_hemorragico
    1 'Sí'
    0 'No'
  /noinc7_infeccion
    1 'Sí'
    0 'No'
  /noinc8_inmuno
    1 'Sí'
    0 'No'
  /noinc9_incompletos
    1 'Sí'
    0 'No'
  /elim10_perdida
    1 'Sí'
    0 'No'
  /elim11_def_no_rel
    1 'Sí'
    0 'No'
  /dictamen
    1 'Incluido'
    2 'No incluido'
    3 'Eliminado'
  /sexo
    0 'Masculino'
    1 'Femenino'
  /escolaridad
    0 'Sin escolaridad'
    1 'Primaria'
    2 'Secundaria'
    3 'Bachillerato'
    4 'Licenciatura o superior'
  /estado_civil
    0 'Soltero'
    1 'Casado o unión libre'
    2 'Divorciado o separado'
    3 'Viudo'
  /ocupacion
    0 'Trabajador asalariado'
    1 'Trabajador independiente'
    2 'Desempleado'
    3 'Ama de casa'
    4 'Pensionado'
  /has
    0 'Ausente'
    1 'Presente'
  /dm2
    0 'Ausente'
    1 'Presente'
  /dislipidemia
    0 'Ausente'
    1 'Presente'
  /fa
    0 'Ausente'
    1 'Presente'
  /cardiopatia_isq
    0 'Ausente'
    1 'Presente'
  /erc
    0 'Ausente'
    1 'Presente'
  /tabaquismo
    0 'Nunca fumador'
    1 'Exfumador (abstinencia ≥ 6 meses)'
    2 'Fumador activo'
  /alcohol
    0 'No bebedor (0 bebidas/sem.)'
    1 'Consumo ligero (1 a 7 bebidas/sem.)'
    2 'Consumo moderado (8 a 14 bebidas/sem.)'
    3 'Consumo pesado / de riesgo (> 14 bebidas/sem.)'
  /tc_confirmada
    0 'No'
    1 'Sí'
  /nihss_cat
    1 'Leve (0–4)'
    2 'Moderado (5–15)'
    3 'Moderado-severo (16–20)'
    4 'Severo (21–42)'
  /nlr_cat
    0 'No elevado (< 3,51)'
    1 'Elevado (≥ 3,51)'
  /trombolisis
    0 'No administrada'
    1 'Sí administrada'
  /mort_intrahosp
    0 'Vivo al egreso'
    1 'Defunción intrahospitalaria'
  /eval_en_ventana
    0 'Fuera de la ventana'
    1 'Dentro de la ventana'
  /fuente_info
    1 'Nota del expediente clínico electrónico'
    2 'Entrevista telefónica al paciente'
    3 'Entrevista telefónica al familiar responsable'
  /consentimiento_verbal
    1 'Sí acepta'
    0 'No acepta'
  /mrs_90
    0 'Asintomático'
    1 'Sin incapacidad significativa'
    2 'Incapacidad leve'
    3 'Incapacidad moderada'
    4 'Incapacidad moderadamente severa'
    5 'Incapacidad severa'
    6 'Defunción'
  /mrs_dic
    0 'Independencia funcional (mRS 0–2)'
    1 'Dependencia funcional (mRS 3–6)'
  /mort_90
    0 'Vivo a los 90 días'
    1 'Defunción dentro de los 90 días'
  /causa_def_rel
    0 'No relacionada (criterio de eliminación)'
    1 'Relacionada'
.

VARIABLE LEVEL
  folio fase inc1_edad18 inc2_evc_tc inc3_bh inc4_nihss inc5_mrs_disp
    noinc6_hemorragico noinc7_infeccion noinc8_inmuno noinc9_incompletos
    elim10_perdida elim11_def_no_rel dictamen motivo_dictamen sexo
    estado_civil ocupacion has dm2 dislipidemia fa cardiopatia_isq erc
    tc_confirmada nlr_cat trombolisis mort_intrahosp eval_en_ventana
    fuente_info consentimiento_verbal mrs_dic mort_90 causa_def_rel
    observaciones (NOMINAL)
  /escolaridad tabaquismo alcohol nihss nihss_cat mrs_90 (ORDINAL)
  /fecha_llenado edad fecha_evento hora_inicio fecha_admision
    hora_admision t_sintomas_puerta tas tad fecha_tc fecha_muestra
    hora_muestra leucocitos neutrofilos linfocitos plaquetas nlr glucosa
    col_total hdl ldl trigliceridos t_puerta_aguja fecha_egreso
    fecha_teorica_90 ventana_inicio ventana_fin fecha_eval dia_eval
    intento1 intento2 intento3 intento4 fecha_defuncion (SCALE)
.

* Verificación rápida de las variables principales.
FREQUENCIES VARIABLES=fase dictamen nlr_cat nihss_cat mrs_90 mrs_dic
  /ORDER=ANALYSIS.

SAVE OUTFILE='base_evc.sav'
  /COMPRESSED.
