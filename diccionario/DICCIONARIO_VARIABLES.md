# Diccionario de variables

Protocolo **PI-2026-7694** — *Asociación del índice neutrófilo/linfocito con la dependencia funcional a los 90 días en pacientes con evento cerebrovascular isquémico agudo*.

Esquema v1.0.0. Archivo generado automáticamente por `tools/sincronizar.mjs` a partir de `docs/js/esquema.js`; no lo edite a mano.

- Columnas en la hoja **Datos** de Google Sheets y variables en SPSS: **75** (+ 4 columnas de control: creado_por, fecha_creacion, modificado_por, fecha_modificacion, que no se exportan a SPSS).
- Valores vacíos = dato no disponible (perdido del sistema en SPSS).
- Variables *calculadas*: las genera la aplicación; no se capturan.

## Identificación del registro

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `folio` | Folio del participante | Texto | NOMINAL | A12 | Obligatoria. Código consecutivo (EVC-001, EVC-002…). No capture nombre, NSS, domicilio ni teléfono del paciente. |
| `fecha_llenado` | Fecha de llenado | Fecha | SCALE | SDATE10 |  |
| `fase` | Fase del estudio | Categórica | NOMINAL | F2.0 | 1 = Retrospectiva (2023–2025); 2 = Prospectiva (a partir de 2026). Obligatoria |

## I. Verificación de criterios de selección

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `inc1_edad18` | Inclusión 1: 18 años o más | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `inc2_evc_tc` | Inclusión 2: EVC isquémico confirmado por clínica y TC | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `inc3_bh` | Inclusión 3: biometría hemática al ingreso disponible | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `inc4_nihss` | Inclusión 4: NIHSS al ingreso consignado | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `inc5_mrs_disp` | Inclusión 5: información para mRS a 90 días | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No. En el componente prospectivo marque «Sí» (no aplica); el seguimiento se verifica al cierre. |
| `noinc6_hemorragico` | No inclusión 6: EVC hemorrágico por TC | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `noinc7_infeccion` | No inclusión 7: infección activa al ingreso | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `noinc8_inmuno` | No inclusión 8: neoplasia hematológica, autoinmunidad o inmunosupresión | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `noinc9_incompletos` | No inclusión 9: datos basales incompletos | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `elim10_perdida` | Eliminación 10: pérdida durante el seguimiento | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `elim11_def_no_rel` | Eliminación 11: defunción no relacionada con el EVC | Categórica | NOMINAL | F2.0 | 1 = Sí; 0 = No |
| `dictamen` | Dictamen | Categórica | NOMINAL | F2.0 | 1 = Incluido; 2 = No incluido; 3 = Eliminado. **Calculada**. Automático: algún criterio de inclusión «No» o de no inclusión «Sí» → No incluido; algún criterio de eliminación «Sí» → Eliminado. |
| `motivo_dictamen` | Motivo del dictamen (si aplica) | Texto | NOMINAL | A255 |  |

## II. Variables sociodemográficas

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `edad` | Edad | Numérica | SCALE | F8.0 | Unidad: años. Rango 0 a 120. 0 decimal(es). Años cumplidos al ingreso. |
| `sexo` | Sexo | Categórica | NOMINAL | F2.0 | 0 = Masculino; 1 = Femenino |
| `escolaridad` | Escolaridad | Categórica | ORDINAL | F2.0 | 0 = Sin escolaridad; 1 = Primaria; 2 = Secundaria; 3 = Bachillerato; 4 = Licenciatura o superior |
| `estado_civil` | Estado civil | Categórica | NOMINAL | F2.0 | 0 = Soltero; 1 = Casado o unión libre; 2 = Divorciado o separado; 3 = Viudo |
| `ocupacion` | Ocupación | Categórica | NOMINAL | F2.0 | 0 = Trabajador asalariado; 1 = Trabajador independiente; 2 = Desempleado; 3 = Ama de casa; 4 = Pensionado |

## III. Comorbilidades y antecedentes

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `has` | Hipertensión arterial sistémica | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Diagnóstico previo o uso de antihipertensivos al ingreso (umbral ≥ 130/80 mmHg). |
| `dm2` | Diabetes mellitus tipo 2 | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Diagnóstico previo, uso de hipoglucemiantes o insulina, o HbA1c ≥ 6,5 % durante la hospitalización. |
| `dislipidemia` | Dislipidemia | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Diagnóstico previo, uso de hipolipemiantes o LDL ≥ 130 mg/dL durante la hospitalización. |
| `fa` | Fibrilación auricular | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Diagnóstico previo o electrocardiograma durante la hospitalización. |
| `cardiopatia_isq` | Cardiopatía isquémica | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Antecedente de infarto del miocardio, angina o revascularización coronaria (stent). |
| `erc` | Enfermedad renal crónica | Categórica | NOMINAL | F2.0 | 0 = Ausente; 1 = Presente. Diagnóstico previo o TFG estimada < 60 mL/min/1,73 m² al ingreso. |
| `tabaquismo` | Tabaquismo | Categórica | ORDINAL | F2.0 | 0 = Nunca fumador; 1 = Exfumador (abstinencia ≥ 6 meses); 2 = Fumador activo |
| `alcohol` | Consumo de alcohol | Categórica | ORDINAL | F2.0 | 0 = No bebedor (0 bebidas/sem.); 1 = Consumo ligero (1 a 7 bebidas/sem.); 2 = Consumo moderado (8 a 14 bebidas/sem.); 3 = Consumo pesado / de riesgo (> 14 bebidas/sem.) |

## IV. Características clínicas al ingreso

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `fecha_evento` | Fecha del evento índice | Fecha | SCALE | SDATE10 |  |
| `hora_inicio` | Hora de inicio de los síntomas | Hora | SCALE | TIME5 | Formato de 24 horas. |
| `fecha_admision` | Fecha de admisión a Urgencias | Fecha | SCALE | SDATE10 |  |
| `hora_admision` | Hora de admisión a Urgencias | Hora | SCALE | TIME5 |  |
| `t_sintomas_puerta` | Tiempo síntomas-puerta | Numérica | SCALE | F8.0 | Unidad: minutos. Rango 0 a 100000. 0 decimal(es). Calculada si hay fecha/hora; si no, captura manual. Se calcula con la fecha/hora del evento y de admisión. Si no constan las horas puede capturarlo manualmente. |
| `tas` | Tensión arterial sistólica al ingreso | Numérica | SCALE | F8.0 | Unidad: mmHg. Rango 40 a 300. 0 decimal(es). Primera medición consignada en la nota médica. |
| `tad` | Tensión arterial diastólica al ingreso | Numérica | SCALE | F8.0 | Unidad: mmHg. Rango 20 a 200. 0 decimal(es). Primera medición consignada en la nota médica. |
| `tc_confirmada` | Confirmación por tomografía de cráneo | Categórica | NOMINAL | F2.0 | 0 = No; 1 = Sí |
| `fecha_tc` | Fecha del estudio tomográfico | Fecha | SCALE | SDATE10 | Condicional |
| `nihss` | NIHSS basal (puntuación total) | Numérica | ORDINAL | F8.0 | Unidad: puntos. Rango 0 a 42. 0 decimal(es). Consignado por el médico tratante en las primeras 24 horas (Anexo 5). |
| `nihss_cat` | NIHSS basal (categoría) | Categórica | ORDINAL | F2.0 | 1 = Leve (0–4); 2 = Moderado (5–15); 3 = Moderado-severo (16–20); 4 = Severo (21–42). **Calculada** |

## V. Parámetros de laboratorio al ingreso

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `fecha_muestra` | Fecha de toma de la muestra | Fecha | SCALE | SDATE10 |  |
| `hora_muestra` | Hora de toma de la muestra | Hora | SCALE | TIME5 |  |
| `leucocitos` | Leucocitos totales | Numérica | SCALE | F10.2 | Unidad: ×10⁹/L. Rango 0 a 200. 2 decimal(es) |
| `neutrofilos` | Neutrófilos absolutos | Numérica | SCALE | F10.2 | Unidad: ×10⁹/L. Rango 0 a 200. 2 decimal(es) |
| `linfocitos` | Linfocitos absolutos | Numérica | SCALE | F10.2 | Unidad: ×10⁹/L. Rango 0.01 a 100. 2 decimal(es) |
| `plaquetas` | Plaquetas | Numérica | SCALE | F8.0 | Unidad: ×10⁹/L. Rango 0 a 2000. 0 decimal(es) |
| `nlr` | Índice neutrófilo-linfocito (NLR) | Numérica | SCALE | F10.2 | 2 decimal(es). **Calculada**. Neutrófilos absolutos ÷ linfocitos absolutos, con dos decimales. |
| `nlr_cat` | NLR categorizado | Categórica | NOMINAL | F2.0 | 0 = No elevado (< 3,51); 1 = Elevado (≥ 3,51). **Calculada** |
| `glucosa` | Glucemia al ingreso | Numérica | SCALE | F10.1 | Unidad: mg/dL. Rango 10 a 2000. 1 decimal(es). Química sanguínea de ingreso. |
| `col_total` | Colesterol total | Numérica | SCALE | F10.1 | Unidad: mg/dL. Rango 10 a 1500. 1 decimal(es). Perfil de lípidos. |
| `hdl` | Colesterol HDL | Numérica | SCALE | F10.1 | Unidad: mg/dL. Rango 1 a 300. 1 decimal(es). Perfil de lípidos. |
| `ldl` | Colesterol LDL | Numérica | SCALE | F10.1 | Unidad: mg/dL. Rango 1 a 1000. 1 decimal(es). Perfil de lípidos. |
| `trigliceridos` | Triglicéridos | Numérica | SCALE | F10.1 | Unidad: mg/dL. Rango 10 a 10000. 1 decimal(es). Perfil de lípidos. |

## VI. Tratamiento y evolución intrahospitalaria

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `trombolisis` | Trombólisis con rt-PA | Categórica | NOMINAL | F2.0 | 0 = No administrada; 1 = Sí administrada |
| `t_puerta_aguja` | Tiempo puerta-aguja | Numérica | SCALE | F8.0 | Unidad: minutos. Rango 0 a 1440. 0 decimal(es). Condicional. Sólo en pacientes trombolizados. |
| `fecha_egreso` | Fecha de egreso hospitalario | Fecha | SCALE | SDATE10 |  |
| `mort_intrahosp` | Mortalidad intrahospitalaria | Categórica | NOMINAL | F2.0 | 0 = Vivo al egreso; 1 = Defunción intrahospitalaria |

## VII. Desenlace funcional a los 90 días

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `fecha_teorica_90` | Fecha teórica de evaluación (día 90) | Fecha | SCALE | SDATE10 | **Calculada** |
| `ventana_inicio` | Ventana de evaluación: desde (día 76) | Fecha | SCALE | SDATE10 | **Calculada** |
| `ventana_fin` | Ventana de evaluación: hasta (día 104) | Fecha | SCALE | SDATE10 | **Calculada** |
| `fecha_eval` | Fecha real de evaluación | Fecha | SCALE | SDATE10 |  |
| `dia_eval` | Día posterior al evento en que se evaluó | Numérica | SCALE | F8.0 | Unidad: días. 0 decimal(es). **Calculada** |
| `eval_en_ventana` | Evaluación dentro de la ventana de 90 ± 14 días | Categórica | NOMINAL | F2.0 | 0 = Fuera de la ventana; 1 = Dentro de la ventana. **Calculada** |
| `fuente_info` | Fuente de la información | Categórica | NOMINAL | F2.0 | 1 = Nota del expediente clínico electrónico; 2 = Entrevista telefónica al paciente; 3 = Entrevista telefónica al familiar responsable |
| `consentimiento_verbal` | Aceptación verbal de la entrevista telefónica (Anexo 6) | Categórica | NOMINAL | F2.0 | 1 = Sí acepta; 0 = No acepta. Condicional |
| `intento1` | 1.er intento de contacto | Fecha | SCALE | SDATE10 | Condicional |
| `intento2` | 2.º intento de contacto | Fecha | SCALE | SDATE10 | Condicional |
| `intento3` | 3.er intento de contacto | Fecha | SCALE | SDATE10 | Condicional |
| `intento4` | 4.º intento de contacto | Fecha | SCALE | SDATE10 | Condicional |
| `mrs_90` | Puntuación mRS a los 90 días | Categórica | ORDINAL | F2.0 | 0 = Asintomático; 1 = Sin incapacidad significativa; 2 = Incapacidad leve; 3 = Incapacidad moderada; 4 = Incapacidad moderadamente severa; 5 = Incapacidad severa; 6 = Defunción. Escala de Rankin modificada completa (Anexo 4). |
| `mrs_dic` | Desenlace funcional (dicotómico) | Categórica | NOMINAL | F2.0 | 0 = Independencia funcional (mRS 0–2); 1 = Dependencia funcional (mRS 3–6). **Calculada** |
| `mort_90` | Mortalidad a los 90 días | Categórica | NOMINAL | F2.0 | 0 = Vivo a los 90 días; 1 = Defunción dentro de los 90 días |
| `fecha_defuncion` | Fecha de defunción | Fecha | SCALE | SDATE10 | Condicional |
| `causa_def_rel` | Causa de la defunción relacionada con el EVC | Categórica | NOMINAL | F2.0 | 0 = No relacionada (criterio de eliminación); 1 = Relacionada. Condicional |

## VIII. Observaciones e incidencias

| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |
|---|---|---|---|---|---|
| `observaciones` | Observaciones e incidencias | Texto | NOMINAL | A1000 |  |

## Reglas de cálculo

- **nlr** = neutrofilos ÷ linfocitos, redondeado a 2 decimales (mitad hacia arriba). **nlr_cat** = 1 si nlr ≥ 3.51.
- **nihss_cat**: 1 = 0–4; 2 = 5–15; 3 = 16–20; 4 = 21–42.
- **t_sintomas_puerta** = (fecha_admision + hora_admision) − (fecha_evento + hora_inicio), en minutos.
- **fecha_teorica_90** = fecha_evento + 90 días; **ventana_inicio** = +76; **ventana_fin** = +104.
- **dia_eval** = fecha_eval − fecha_evento; **eval_en_ventana** = 1 si 76 ≤ dia_eval ≤ 104.
- **mrs_dic** = 1 si mrs_90 ≥ 3 (dependencia funcional), 0 si mrs_90 ≤ 2.
- **dictamen**: 2 (No incluido) si algún criterio de inclusión = No o de no inclusión = Sí; 3 (Eliminado) si algún criterio de eliminación = Sí; 1 (Incluido) en otro caso; vacío mientras falten criterios por responder.
