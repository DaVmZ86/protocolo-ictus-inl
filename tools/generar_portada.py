#!/usr/bin/env python3
"""
generar_portada.py — Genera la portada del README (SVG editable + PNG nítido).

    python tools/generar_portada.py

Salida:
    assets/readme/portada.svg   (fuente editable, 1280×400)
    assets/readme/portada.png   (2560×800, la que usa el README)

Ilustración original: cerebro en vista lateral con territorio de la arteria
cerebral media en isquemia, vaso ocluido por un trombo, neutrófilos y linfocitos
(índice NLR) y la escala de Rankin modificada dicotomizada (mRS ≥ 3).
Requiere Pillow (para medir el texto) y Google Chrome o Microsoft Edge (para el PNG).
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import ImageFont

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'assets' / 'readme'
FUENTES = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
FAMILIA = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

ANCHO, ALTO = 1280, 400


def medir(texto, tam, negrita=False):
    """Ancho del texto en px con la fuente real (para que las etiquetas ajusten)."""
    archivo = FUENTES / ('segoeuib.ttf' if negrita else 'segoeui.ttf')
    try:
        return ImageFont.truetype(str(archivo), tam).getlength(texto)
    except OSError:
        return len(texto) * tam * (0.6 if negrita else 0.55)


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ---------------------------------------------------------------------------
# Ilustración: cerebro lateral (lóbulo frontal a la izquierda), coordenadas 0–300
# ---------------------------------------------------------------------------
CEREBRO = ('M28 120 C18 80 45 38 95 26 C135 10 190 8 228 24 C268 40 292 78 290 118 '
           'C289 145 275 160 255 164 C238 168 222 162 206 162 C190 180 160 188 130 184 '
           'C100 180 86 166 88 150 C70 150 40 145 28 120 Z')
CEREBELO = ('M206 164 C210 190 240 205 268 196 C290 188 292 166 276 160 '
            'C262 170 236 170 206 164 Z')
TRONCO = 'M196 166 C198 190 200 210 196 234 L214 234 C216 210 214 188 214 170 Z'
SURCOS = [
    # cisura lateral (Silvio), más marcada
    'M90 150 C108 140 122 142 136 134 C152 126 166 132 182 126 C198 120 212 124 228 110',
    # surcos central, precentral y poscentral: oblicuos y ondulados
    'M176 13 C168 28 180 40 172 56 C164 72 176 84 166 100 C158 114 164 122 154 132',
    'M146 17 C138 32 150 44 142 60 C134 76 144 88 134 104 C128 114 130 120 122 128',
    'M206 18 C198 34 210 46 202 62 C194 78 206 90 196 106 C190 116 194 120 186 126',
    # lóbulo frontal
    'M42 70 C54 60 62 74 74 64 C86 54 96 66 110 54 C118 48 124 52 130 46',
    'M34 100 C46 92 54 104 66 96 C78 88 88 100 100 92 C108 86 116 90 124 84',
    'M60 128 C70 118 82 126 92 118',
    'M74 36 C80 46 76 54 86 62',
    # lóbulo temporal
    'M106 170 C120 162 132 172 146 164 C160 156 172 166 186 158 C200 150 214 156 230 146',
    # lóbulos parietal y occipital
    'M216 54 C226 64 238 56 248 66 C258 76 268 70 274 84',
    'M232 92 C242 100 252 92 262 102 C270 110 280 104 286 112',
    'M240 128 C250 120 260 132 270 124 C276 120 282 126 286 130',
    'M252 40 C256 52 266 52 268 64',
]
FOLIAS = ['M222 180 C240 188 262 186 279 176', 'M230 192 C246 198 264 194 277 187']
# Arteria cerebral media: segmento proximal (con flujo), trombo y ramas distales sin flujo
ACM_PROXIMAL = 'M96 178 C106 164 118 152 132 143'
ACM_DISTAL = ['M144 136 C162 126 180 116 198 100', 'M144 136 C162 138 184 138 208 130',
              'M162 126 C168 108 178 96 190 84']


def neutrofilo(x, y, r):
    """Célula con núcleo multilobulado."""
    l = r * 0.27
    return (f'<g transform="translate({x} {y})">'
            f'<circle r="{r}" fill="#ffffff" fill-opacity="0.10" stroke="#99f6e4" stroke-width="2"/>'
            f'<path d="M{-r*0.42:.1f} {r*0.05:.1f} Q{-r*0.2:.1f} {-r*0.35:.1f} 0 {-r*0.05:.1f} T{r*0.42:.1f} {-r*0.1:.1f}" '
            f'stroke="#c4b5fd" stroke-width="{l*0.7:.1f}" fill="none" stroke-linecap="round"/>'
            f'<circle cx="{-r*0.42:.1f}" cy="{r*0.05:.1f}" r="{l:.1f}" fill="#c4b5fd"/>'
            f'<circle cx="0" cy="{-r*0.05:.1f}" r="{l:.1f}" fill="#c4b5fd"/>'
            f'<circle cx="{r*0.42:.1f}" cy="{-r*0.1:.1f}" r="{l:.1f}" fill="#c4b5fd"/></g>')


def linfocito(x, y, r):
    """Célula con núcleo grande y redondo."""
    return (f'<g transform="translate({x} {y})">'
            f'<circle r="{r}" fill="#ffffff" fill-opacity="0.10" stroke="#99f6e4" stroke-width="2"/>'
            f'<circle cx="{r*0.06:.1f}" cy="{r*0.04:.1f}" r="{r*0.68:.1f}" fill="#a78bfa"/></g>')


def etiqueta(x, y, texto, tam=16, relleno='#ffffff', opacidad_fondo=0.10, color='#ecfeff', punto=None):
    ancho = medir(texto, tam) + 28 + (14 if punto else 0)
    alto = tam + 18
    tx = x + 14 + (14 if punto else 0)
    marca = f'<circle cx="{x + 17}" cy="{y + alto / 2}" r="4" fill="{punto}"/>' if punto else ''
    return (f'<rect x="{x}" y="{y}" width="{ancho:.0f}" height="{alto}" rx="{alto / 2}" fill="{relleno}" '
            f'fill-opacity="{opacidad_fondo}" stroke="#ffffff" stroke-opacity="0.22"/>{marca}'
            f'<text x="{tx:.0f}" y="{y + alto / 2 + tam * 0.35:.1f}" font-size="{tam}" fill="{color}">{esc(texto)}</text>'), ancho


def svg():
    p = []
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{ANCHO}" height="{ALTO}" viewBox="0 0 {ANCHO} {ALTO}" '
             f'role="img" aria-labelledby="titulo descripcion" font-family="{FAMILIA}">')
    p.append('<title id="titulo">Cédula EVC · NLR — Protocolo PI-2026-7694</title>')
    p.append('<desc id="descripcion">Cerebro en vista lateral con el territorio de la arteria cerebral media en isquemia por un trombo, '
             'neutrófilos y linfocitos (índice neutrófilo/linfocito) y la escala de Rankin modificada dicotomizada.</desc>')
    p.append('''<defs>
  <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#05201f"/><stop offset="0.5" stop-color="#0a4743"/><stop offset="1" stop-color="#0f766e"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#5eead4" stop-opacity="0.30"/><stop offset="1" stop-color="#5eead4" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="infarto" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fb7185" stop-opacity="0.95"/><stop offset="0.5" stop-color="#f43f5e" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#f43f5e" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="brillo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fda4af" stop-opacity="0.9"/><stop offset="1" stop-color="#fda4af" stop-opacity="0"/>
  </radialGradient>
  <pattern id="puntos" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="1.2" fill="#ffffff" fill-opacity="0.06"/>
  </pattern>
  <clipPath id="recorte"><path d="''' + CEREBRO + '''"/></clipPath>
</defs>''')
    p.append(f'<rect width="{ANCHO}" height="{ALTO}" fill="url(#fondo)"/>')
    p.append(f'<rect width="{ANCHO}" height="{ALTO}" fill="url(#puntos)"/>')
    # Trazo de electrocardiograma (mismo motivo que el ícono de la app)
    p.append('<path d="M0 384 H680 l12 0 l9 -22 l13 42 l11 -32 l8 12 H1280" stroke="#5eead4" stroke-opacity="0.22" '
             'stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')

    # ------------------------------ texto ------------------------------
    x0 = 72
    pastilla = 'PROTOCOLO PI-2026-7694 · INVESTIGACIÓN CLÍNICA'
    ancho_p = medir(pastilla, 13, negrita=True) + 0.9 * len(pastilla) + 30
    p.append(f'<rect x="{x0}" y="58" width="{ancho_p:.0f}" height="30" rx="15" fill="#ffffff" fill-opacity="0.10" '
             f'stroke="#99f6e4" stroke-opacity="0.45"/>')
    p.append(f'<text x="{x0 + 15}" y="78" font-size="13" letter-spacing="0.9" fill="#99f6e4" font-weight="700">{esc(pastilla)}</text>')
    # logotipo + título
    p.append(f'<g transform="translate({x0} 112)"><rect width="58" height="58" rx="14" fill="#0f766e" stroke="#5eead4" stroke-opacity="0.6"/>'
             '<path d="M10 31 h9 l5 -13 l7 25 l6 -18 l4 6 h8" stroke="#ffffff" stroke-width="4.4" fill="none" '
             'stroke-linecap="round" stroke-linejoin="round"/></g>')
    p.append(f'<text x="{x0 + 78}" y="163" font-size="58" font-weight="700" fill="#ffffff" letter-spacing="-0.5">Cédula EVC · NLR</text>')
    p.append(f'<text x="{x0}" y="214" font-size="23" fill="#ccfbf1">Índice neutrófilo/linfocito y dependencia funcional</text>')
    p.append(f'<text x="{x0}" y="244" font-size="23" fill="#ccfbf1">a 90 días en el evento cerebrovascular isquémico agudo</text>')
    # etiquetas de funciones
    x = x0
    for texto, color in [('Acceso con Gmail', '#5eead4'), ('Google Sheets + Drive', '#5eead4'),
                         ('Seguimiento a 90 días', '#fda4af'), ('SPSS 27', '#c4b5fd')]:
        frag, ancho = etiqueta(x, 276, texto, 15, punto=color)
        p.append(frag)
        x += ancho + 10
    p.append(f'<text x="{x0}" y="352" font-size="14.5" fill="#99f6e4" fill-opacity="0.85">'
             'HGZ/MF No. 12 · Lázaro Cárdenas, Michoacán  ·  Cédula electrónica de código abierto (MIT)</text>')

    # --------------------------- ilustración ---------------------------
    p.append('<circle cx="1010" cy="162" r="190" fill="url(#halo)"/>')
    p.append('<g transform="translate(850 34) scale(1.04)">')
    p.append(f'<path d="{TRONCO}" fill="#ffffff" fill-opacity="0.10" stroke="#e6fffb" stroke-width="3" stroke-linejoin="round"/>')
    p.append(f'<path d="{CEREBELO}" fill="#ffffff" fill-opacity="0.12" stroke="#e6fffb" stroke-width="3" stroke-linejoin="round"/>')
    for d in FOLIAS:
        p.append(f'<path d="{d}" stroke="#e6fffb" stroke-opacity="0.55" stroke-width="2.2" fill="none" stroke-linecap="round"/>')
    p.append(f'<path d="{CEREBRO}" fill="#ffffff" fill-opacity="0.10"/>')
    # territorio de la arteria cerebral media en isquemia
    p.append('<g clip-path="url(#recorte)"><ellipse cx="172" cy="104" rx="70" ry="56" fill="url(#infarto)"/></g>')
    for d in SURCOS:
        p.append(f'<path d="{d}" stroke="#e6fffb" stroke-opacity="0.6" stroke-width="2.6" fill="none" stroke-linecap="round" clip-path="url(#recorte)"/>')
    p.append(f'<path d="{CEREBRO}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>')
    # vaso: proximal con flujo, trombo, ramas distales sin flujo (punteadas)
    p.append(f'<path d="{ACM_PROXIMAL}" stroke="#fecdd3" stroke-width="5" fill="none" stroke-linecap="round"/>')
    for d in ACM_DISTAL:
        p.append(f'<path d="{d}" stroke="#fecdd3" stroke-opacity="0.75" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 7"/>')
    p.append('<circle cx="138" cy="140" r="16" fill="url(#brillo)"/>')
    p.append('<ellipse cx="138" cy="140" rx="8.5" ry="7" fill="#be123c" stroke="#ffffff" stroke-width="2.2" transform="rotate(-30 138 140)"/>')
    p.append('</g>')
    # rótulo del trombo (abajo a la izquierda del cerebro, fuera de la silueta)
    p.append('<path d="M987 184 C960 204 936 214 906 226" stroke="#fecdd3" stroke-opacity="0.85" stroke-width="1.6" fill="none"/>')
    frag, _ = etiqueta(760, 214, 'oclusión · isquemia', 13, relleno='#be123c', opacidad_fondo=0.55, color='#fff1f2')
    p.append(frag)

    # células: linfocitos (L) a la izquierda, neutrófilos (N) a la derecha
    p.append(linfocito(806, 84, 17))
    p.append(linfocito(782, 132, 12))
    p.append('<text x="836" y="90" font-size="14" fill="#ccfbf1" font-weight="700">L</text>')
    p.append(neutrofilo(1212, 70, 22))
    p.append(neutrofilo(1242, 122, 15))
    p.append('<text x="1178" y="76" font-size="14" fill="#ccfbf1" font-weight="700" text-anchor="end">N</text>')
    frag, _ = etiqueta(1040, 296, 'NLR = N ÷ L  ·  ≥ 3,51', 14, relleno='#7c3aed', opacidad_fondo=0.35, color='#f5f3ff')
    p.append(frag)

    # escala de Rankin modificada 0–6, dicotomizada en 3
    x_m, y_m, lado, sep = 760, 296, 26, 5
    colores = ['#2dd4bf', '#2dd4bf', '#2dd4bf', '#fb7185', '#fb7185', '#fb7185', '#fb7185']
    p.append(f'<text x="{x_m}" y="{y_m - 10}" font-size="12.5" fill="#ccfbf1" font-weight="700" letter-spacing="0.6">mRS A 90 DÍAS</text>')
    for i, c in enumerate(colores):
        xx = x_m + i * (lado + sep)
        p.append(f'<rect x="{xx}" y="{y_m}" width="{lado}" height="{lado}" rx="6" fill="{c}" fill-opacity="{0.35 + i * 0.09:.2f}" stroke="#ffffff" stroke-opacity="0.35"/>')
        p.append(f'<text x="{xx + lado / 2}" y="{y_m + 18}" font-size="13" text-anchor="middle" fill="#ffffff" font-weight="700">{i}</text>')
    xc = x_m + 3 * (lado + sep) - sep / 2 - 0.5
    p.append(f'<path d="M{xc:.1f} {y_m - 4} V{y_m + lado + 4}" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 3"/>')
    p.append(f'<text x="{x_m}" y="{y_m + lado + 18}" font-size="12" fill="#99f6e4">independencia</text>')
    p.append(f'<text x="{x_m + 3 * (lado + sep)}" y="{y_m + lado + 18}" font-size="12" fill="#fecdd3">dependencia funcional</text>')

    p.append('</svg>')
    return '\n'.join(p)


def navegador():
    for c in [shutil.which('chrome'), shutil.which('msedge'),
              r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', shutil.which('google-chrome')]:
        if c and Path(c).exists():
            return c
    return None


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta_svg = SALIDA / 'portada.svg'
    ruta_svg.write_text(svg(), encoding='utf-8')
    print('->', ruta_svg.relative_to(RAIZ))
    exe = navegador()
    if not exe:
        print('No se encontró Chrome/Edge: sólo se generó el SVG.', file=sys.stderr)
        return
    ruta_png = SALIDA / 'portada.png'
    subprocess.run([exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
                    f'--window-size={ANCHO},{ALTO}', f'--screenshot={ruta_png}', '--default-background-color=00000000',
                    ruta_svg.as_uri()], check=True, capture_output=True, timeout=120)
    print('->', ruta_png.relative_to(RAIZ))


if __name__ == '__main__':
    main()
