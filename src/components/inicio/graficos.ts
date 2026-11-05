// Gráficos propios para las tarjetas sin foto (4:3). {alt} se reemplaza por la descripción de la tarjeta.
import type { Media } from '../../data/inicio';

const SVG: Record<string, string> = {
  ficha: `<svg viewBox="0 0 400 300" role="img" aria-label="{alt}"><rect width="400" height="300" fill="#EFE9E0"/>
<g fill="#141414"><circle cx="90" cy="92" r="26"/><path d="M52 236c4-62 20-96 38-96s34 34 38 96z"/>
<circle cx="200" cy="92" r="26"/><path d="M166 236c6-62 22-96 36-96s28 34 32 96z"/>
<circle cx="310" cy="92" r="26"/><path d="M290 236c2-62 10-96 20-96s20 34 22 96z"/></g>
<path d="M44 250h312" stroke="#E2037E" stroke-width="3"/>
<g font-family="DM Mono, monospace" font-size="12" fill="#5B5B57" text-anchor="middle"><text x="90" y="276">FRENTE</text><text x="200" y="276">TRES CUARTOS</text><text x="310" y="276">PERFIL</text></g>
<path d="M150 64c30-22 82-18 96 16 12 30-10 58-46 60-34 2-60-20-56-46" fill="none" stroke="#E2037E" stroke-width="3" stroke-linecap="round"/></svg>`,
  convenio: `<svg viewBox="0 0 400 300" role="img" aria-label="{alt}"><rect width="400" height="300" fill="#141414"/>
<rect x="24" y="24" width="168" height="252" rx="12" fill="#22211F"/><circle cx="108" cy="104" r="34" fill="#F3EEE6"/>
<path d="M60 220c4-44 24-66 48-66s44 22 48 66z" fill="#F3EEE6"/><circle cx="148" cy="76" r="12" fill="#E2037E"/>
<path d="M142 76l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.6"/>
<rect x="208" y="24" width="168" height="252" rx="12" fill="#22211F"/><rect x="232" y="96" width="120" height="96" fill="#F3EEE6"/>
<path d="M226 96h132l-10-26H236z" fill="#E2037E"/><rect x="278" y="138" width="28" height="54" fill="#141414"/>
<g font-family="DM Mono, monospace" font-size="12" fill="#B9B2A7"><text x="40" y="252">SU IMAGEN</text><text x="224" y="252">TU NEGOCIO</text></g></svg>`,
  vela: `<svg viewBox="0 0 400 300" role="img" aria-label="{alt}"><defs><radialGradient id="gl" cx="62%" cy="70%" r="60%">
<stop offset="0" stop-color="#E9A33B" stop-opacity=".55"/><stop offset=".5" stop-color="#6E3F12" stop-opacity=".25"/><stop offset="1" stop-color="#141414" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="300" fill="#141414"/><rect width="400" height="300" fill="url(#gl)"/>
<rect x="70" y="52" width="130" height="168" fill="none" stroke="#C9A25A" stroke-width="5"/><rect x="82" y="64" width="106" height="144" fill="#24221F"/>
<circle cx="135" cy="120" r="26" fill="#57534C"/><path d="M98 202c4-30 20-42 37-42s33 12 37 42z" fill="#57534C"/>
<rect x="262" y="182" width="16" height="66" fill="#F3EEE6"/><path d="M270 132c14 18 14 32 0 46-14-14-14-28 0-46z" fill="#F2B544"/>
<text x="200" y="282" font-family="DM Mono, monospace" font-size="12" fill="#B9B2A7" text-anchor="middle">HECHO CON IA, CON PERMISO DE LA FAMILIA</text></svg>`,
  tickets: `<svg viewBox="0 0 400 300" role="img" aria-label="{alt}"><rect width="400" height="300" fill="#E2037E"/>
<g font-family="Archivo, Arial, sans-serif"><g transform="translate(28 30)"><rect width="344" height="64" rx="10" fill="#F3EEE6"/><path d="M262 8v48" stroke="#C9C0B3" stroke-dasharray="4 4"/>
<text x="18" y="28" font-weight="800" font-size="17" fill="#141414">Taller en vivo</text><text x="18" y="48" font-size="12" fill="#5B5B57">2 horas por Zoom, 20 cupos</text><text x="278" y="40" font-weight="800" font-size="18" fill="#B50265">S/ 49</text></g>
<g transform="translate(28 118)"><rect width="344" height="64" rx="10" fill="#F3EEE6"/><path d="M262 8v48" stroke="#C9C0B3" stroke-dasharray="4 4"/>
<text x="18" y="28" font-weight="800" font-size="17" fill="#141414">Pack de prompts</text><text x="18" y="48" font-size="12" fill="#5B5B57">12 prompts Zombie Love</text><text x="278" y="40" font-weight="800" font-size="18" fill="#B50265">S/ 29</text></g>
<g transform="translate(28 206)"><rect width="344" height="64" rx="10" fill="#F3EEE6"/><path d="M262 8v48" stroke="#C9C0B3" stroke-dasharray="4 4"/>
<text x="18" y="28" font-weight="800" font-size="17" fill="#141414">Clase 1:1</text><text x="18" y="48" font-size="12" fill="#5B5B57">Por videollamada o en persona</text><text x="272" y="40" font-weight="700" font-size="12" fill="#B50265">A COORDINAR</text></g></g></svg>`,
};
const TERMINAL = `<div class="term" role="img" aria-label="{alt}"><span class="p">&gt; Subtitula reel.mp4 con el estilo editorial</span><span>Transcribiendo el audio… listo</span><span class="ok">✓ reel_subtitulado.mp4 (0:42)</span><span class="gap"></span><span class="p">&gt; Saca 3 clips verticales con lo mejor</span><span class="ok">✓ 3 clips listos para TikTok</span><span class="gap"></span><span class="p">&gt; Haz uno como este video, con mi producto</span><span>Leyendo la referencia… listo</span></div>`;
const NARA = `<div class="nara" role="img" aria-label="{alt}"><div class="nara__win"><div class="nara__title"><span>Nara</span><span class="nara__dot"></span></div><div class="nara__wave"><i style="--d:1"></i><i style="--d:2"></i><i style="--d:3"></i><i style="--d:4"></i><i style="--d:5"></i><i style="--d:6"></i><i style="--d:7"></i><i style="--d:8"></i><i style="--d:9"></i></div><div class="nara__chat"><p class="me">Nara, ordena mis descargas.</p><p class="her">¿Por tipo o por fecha?</p><p class="me">Por tipo.</p></div></div></div>`;
const LOGO = `<div class="logoanim" role="img" aria-label="{alt}"><img src="/inicio/logo-tato.webp" width="640" height="640" alt="" loading="lazy" decoding="async"><span class="logoanim__sweep"></span></div>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function grafico(m: Media): string {
  const alt = esc(m.alt);
  if (m.type === 'logo') return LOGO.replace('{alt}', alt);
  if (m.type !== 'svg') return '';
  const html = m.name === 'terminal' ? TERMINAL : m.name === 'nara' ? NARA : SVG[m.name];
  if (!html) throw new Error(`Gráfico desconocido: ${m.name}`);
  return html.replace('{alt}', alt);
}
