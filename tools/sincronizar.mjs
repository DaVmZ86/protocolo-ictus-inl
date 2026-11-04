#!/usr/bin/env node
/* =============================================================================
 * sincronizar.mjs — Mantiene en sincronía el esquema y genera documentación.
 *
 *   node tools/sincronizar.mjs            copia docs/js/esquema.js → apps-script/Esquema.gs
 *                                         y regenera diccionario/ (Markdown + .sps de ejemplo)
 *   node tools/sincronizar.mjs --verificar  sólo comprueba que todo esté al día (CI)
 * ============================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rutas = {
  esquema: path.join(raiz, 'docs/js/esquema.js'),
  spss: path.join(raiz, 'docs/js/spss.js'),
  gs: path.join(raiz, 'apps-script/Esquema.gs'),
  md: path.join(raiz, 'diccionario/DICCIONARIO_VARIABLES.md'),
  sps: path.join(raiz, 'diccionario/sintaxis_ejemplo.sps')
};
const verificar = process.argv.includes('--verificar');

const fuente = fs.readFileSync(rutas.esquema, 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(fuente, ctx, { filename: 'esquema.js' });
vm.runInContext(fs.readFileSync(rutas.spss, 'utf8'), ctx, { filename: 'spss.js' });
const { EVC, EVC_SPSS } = ctx;
const esq = EVC.ESQUEMA;

// --- Diccionario en Markdown ---------------------------------------------------
const tipoTexto = (c) => ({ texto: 'Texto', textolargo: 'Texto', numero: 'Numérica', opcion: 'Categórica', fecha: 'Fecha', hora: 'Hora' }[c.tipo]);
const celda = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# Diccionario de variables\n\n`;
md += `Protocolo **${esq.protocolo}** — *${esq.titulo}*.\n\n`;
md += `Esquema v${esq.version}. Archivo generado automáticamente por \`tools/sincronizar.mjs\` a partir de \`docs/js/esquema.js\`; no lo edite a mano.\n\n`;
md += `- Columnas en la hoja **Datos** de Google Sheets y variables en SPSS: **${EVC.campos().length}** (+ 4 columnas de control: creado_por, fecha_creacion, modificado_por, fecha_modificacion, que no se exportan a SPSS).\n`;
md += `- Valores vacíos = dato no disponible (perdido del sistema en SPSS).\n`;
md += `- Variables *calculadas*: las genera la aplicación; no se capturan.\n\n`;
for (const s of esq.secciones) {
  md += `## ${s.titulo}\n\n| Variable | Etiqueta | Tipo | Nivel SPSS | Formato SPSS | Códigos / unidades / reglas |\n|---|---|---|---|---|---|\n`;
  for (const c of s.campos) {
    const reglas = [];
    if (c.opciones) reglas.push(c.opciones.map((o) => `${o[0]} = ${o[1]}`).join('; '));
    if (c.unidad) reglas.push(`Unidad: ${c.unidad}`);
    if (c.min !== undefined || c.max !== undefined) reglas.push(`Rango ${c.min ?? '–'} a ${c.max ?? '–'}`);
    if (c.tipo === 'numero' && c.decimales !== undefined) reglas.push(`${c.decimales} decimal(es)`);
    if (c.calculado) reglas.push('**Calculada**');
    if (c.autocalc) reglas.push('Calculada si hay fecha/hora; si no, captura manual');
    if (c.requerido) reglas.push('Obligatoria');
    if (c.visibleSi) reglas.push('Condicional');
    if (c.ayuda) reglas.push(c.ayuda);
    md += `| \`${c.id}\` | ${celda(c.etiquetaSpss || c.etiqueta)} | ${tipoTexto(c)} | ${EVC_SPSS.nivel(c)} | ${EVC_SPSS.formato(c)} | ${celda(reglas.join('. '))} |\n`;
  }
  md += '\n';
}
md += `## Reglas de cálculo\n\n`;
md += `- **nlr** = neutrofilos ÷ linfocitos, redondeado a 2 decimales (mitad hacia arriba). **nlr_cat** = 1 si nlr ≥ ${esq.corteNLR}.\n`;
md += `- **nihss_cat**: 1 = 0–4; 2 = 5–15; 3 = 16–20; 4 = 21–42.\n`;
md += `- **t_sintomas_puerta** = (fecha_admision + hora_admision) − (fecha_evento + hora_inicio), en minutos.\n`;
md += `- **fecha_teorica_90** = fecha_evento + 90 días; **ventana_inicio** = +76; **ventana_fin** = +104.\n`;
md += `- **dia_eval** = fecha_eval − fecha_evento; **eval_en_ventana** = 1 si 76 ≤ dia_eval ≤ 104.\n`;
md += `- **mrs_dic** = 1 si mrs_90 ≥ 3 (dependencia funcional), 0 si mrs_90 ≤ 2.\n`;
md += `- **dictamen**: 2 (No incluido) si algún criterio de inclusión = No o de no inclusión = Sí; 3 (Eliminado) si algún criterio de eliminación = Sí; 1 (Incluido) en otro caso; vacío mientras falten criterios por responder.\n`;

// --- Sintaxis de ejemplo ------------------------------------------------------------
const sps = '﻿' + EVC_SPSS.generarSintaxis('base_evc_AAAA-MM-DD.csv', { fecha: '2026-01-01' })
  .replace(/generada el [0-9/]+/, 'ejemplo (descargue la versión actual desde la aplicación → Exportar)');

const salidas = [[rutas.gs, fuente], [rutas.md, md], [rutas.sps, sps]];
let desactualizados = 0;
for (const [ruta, contenido] of salidas) {
  const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
  const rel = path.relative(raiz, ruta);
  if (actual === contenido) { console.log(`✓ ${rel} al día`); continue; }
  if (verificar) { console.error(`✗ ${rel} desactualizado — ejecute: node tools/sincronizar.mjs`); desactualizados++; continue; }
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, contenido);
  console.log(`→ ${rel} actualizado`);
}
if (desactualizados) process.exit(1);
