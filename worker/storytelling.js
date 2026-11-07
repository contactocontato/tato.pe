// Storytelling con IA para la orden de servicio: desarrolla la idea del negocio (o ordena su guion final)
// en escenas con tiempos, para el video donde aparece el personaje IA del influencer.
// Usa la API de Claude (ANTHROPIC_API_KEY). Sin la clave, la orden se manda sin storytelling y el equipo
// creativo lo arma con el negocio.
//
// La regla de oro: todo sale de lo que escribió el negocio y de sus fotos. Lo que falta no se inventa:
// queda como [por confirmar] para que el negocio lo complete.

import { esc } from './ui.js';

const MODELO = 'claude-sonnet-5-5';
const MAX_FOTOS = 3;

const SISTEMA = `Eres guionista de Tato Studio, una productora peruana que hace videos publicitarios verticales con inteligencia artificial.
En cada video aparece el personaje IA de un influencer real (su imagen y su voz recreadas con IA, con su permiso) promocionando un negocio.
Tu trabajo es convertir la idea del cliente en un storytelling claro, corto y filmable.

Reglas:
- Todo sale de lo que escribió el cliente y de lo que se ve en sus fotos. No inventes precios, promociones, descuentos, direcciones, horarios, teléfonos, nombres de productos ni datos del negocio. Si hace falta uno, escribe [por confirmar].
- Si el cliente mandó su guion final, respeta sus palabras: solo ordénalo en escenas con tiempos y acciones, sin cambiar lo que dice.
- Respeta la duración exacta del video. El gancho va en los primeros 3 segundos y el cierre termina con una llamada a la acción simple.
- Lo que dice el personaje debe poder decirse en voz alta en el tiempo de cada escena (unas 2 o 3 palabras por segundo).
- Si hay foto del escenario, el personaje aparece ahí; descríbelo según la foto. Si hay foto del producto o del local, muéstralo tal como es.
- Español del Perú, natural, de tú. Sin groserías, sin promesas de salud o resultados, sin comparar con otras marcas, apto para todo público.
- No pongas al personaje a decir que es la persona real ni a dar testimonios de haber usado el producto si el cliente no lo pidió.

Responde solo con un objeto JSON, sin texto antes ni después, con esta forma:
{"titulo": "...", "idea": "una frase con la idea central", "escenario": "dónde ocurre y cómo se ve", "personaje": "cómo aparece y con qué actitud", "escenas": [{"tiempo": "0–3 s", "se_ve": "...", "hace": "...", "dice": "..."}], "cierre": "llamada a la acción", "texto_en_pantalla": ["..."], "musica": "estilo sugerido", "por_confirmar": ["datos que faltan"]}`;

/** ¿Está configurada la IA? */
export const iaLista = (env) => Boolean(env.ANTHROPIC_API_KEY);

function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fotosParaIA(env, claves) {
  const out = [];
  for (const { clave, que } of claves.slice(0, MAX_FOTOS)) {
    const obj = env.MEDIOS ? await env.MEDIOS.get(clave) : null;
    if (!obj || obj.size > 3.5 * 1024 * 1024) continue;
    const tipo = obj.httpMetadata?.contentType || 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) continue;
    out.push({ type: 'text', text: que });
    out.push({ type: 'image', source: { type: 'base64', media_type: tipo, data: aBase64(await obj.arrayBuffer()) } });
  }
  return out;
}

/** Saca el primer objeto JSON del texto y revisa que tenga lo mínimo. */
export function leerStorytelling(texto) {
  const t = String(texto || '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o;
  try {
    o = JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
  const corto = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  if (!o || !Array.isArray(o.escenas) || !o.escenas.length) return null;
  const s = {
    titulo: corto(o.titulo, 120),
    idea: corto(o.idea, 300),
    escenario: corto(o.escenario, 400),
    personaje: corto(o.personaje, 300),
    escenas: o.escenas.slice(0, 12).map((e) => ({ tiempo: corto(e.tiempo, 20), se_ve: corto(e.se_ve, 300), hace: corto(e.hace, 300), dice: corto(e.dice, 300) })),
    cierre: corto(o.cierre, 300),
    texto_en_pantalla: (Array.isArray(o.texto_en_pantalla) ? o.texto_en_pantalla : []).slice(0, 8).map((x) => corto(x, 120)).filter(Boolean),
    musica: corto(o.musica, 160),
    por_confirmar: (Array.isArray(o.por_confirmar) ? o.por_confirmar : []).slice(0, 8).map((x) => corto(x, 160)).filter(Boolean),
  };
  return s.titulo && s.escenas.every((e) => e.tiempo && (e.se_ve || e.hace || e.dice)) ? s : null;
}

/**
 * Pide un storytelling a la IA. `orden` trae lo que escribió el negocio; `fotos` son [{ clave, que }].
 * `cambios` es lo que el negocio pidió cambiar de la versión anterior (`anterior`).
 * Devuelve { storytelling } o { error }.
 */
export async function generarStorytelling(env, { negocio, perfil = {}, influencer, paquete, orden, fotos = [], anterior = null, cambios = '' }) {
  if (!iaLista(env)) return { error: 'La IA no está disponible ahora. Envía tu orden igual: el equipo creativo arma el storytelling contigo.' };
  const datos = [
    `Negocio: ${negocio.nombre}${negocio.rubro ? ` (rubro: ${negocio.rubro})` : ''}.`,
    perfil.estrella ? `Productos o platos estrella (según el negocio): ${perfil.estrella}` : '',
    perfil.publico ? `A quién le vende: ${perfil.publico}` : '',
    perfil.direccion ? `Dirección del local: ${perfil.direccion}` : '',
    perfil.horario ? `Horario: ${perfil.horario}` : '',
    `Influencer (su personaje IA): ${influencer.nombre}${influencer.contenido ? `. Su contenido: ${influencer.contenido}` : ''}.`,
    `Paquete: ${paquete.nombre}. Duración de cada video: ${paquete.segundos ? `${paquete.segundos} segundos exactos` : 'hasta 30 segundos'}.${paquete.videos > 1 ? ` Son ${paquete.videos} videos: escribe el primero y sugiere en "idea" el ángulo del segundo.` : ''}`,
    `Qué quiere promocionar: ${orden.promociona}`,
    orden.tipo === 'guion' ? `GUION FINAL DEL CLIENTE (respeta sus palabras):\n${orden.idea}` : `IDEA DEL CLIENTE:\n${orden.idea}`,
    orden.accion ? `Qué quiere que haga el personaje: ${orden.accion}` : '',
    anterior ? `VERSIÓN ANTERIOR QUE NO APROBÓ:\n${JSON.stringify(anterior)}` : '',
    anterior ? `QUÉ QUIERE CAMBIAR: ${cambios || 'Quiere otra versión distinta, siempre basada en su idea.'}` : '',
  ].filter(Boolean).join('\n');
  const contenido = [...(await fotosParaIA(env, fotos)), { type: 'text', text: datos }];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${(env.ANTHROPIC_API || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.MODELO_STORYTELLING || MODELO, max_tokens: 1800, system: SISTEMA, messages: [{ role: 'user', content: contenido }] }),
    });
    if (!res.ok) {
      console.error('Storytelling: la IA respondió', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return { error: 'La IA no pudo escribir tu storytelling ahora. Inténtalo en un momento.' };
    }
    const data = await res.json();
    const storytelling = leerStorytelling((data.content || []).map((c) => c.text || '').join(''));
    return storytelling ? { storytelling } : { error: 'La IA no devolvió un storytelling completo. Inténtalo otra vez.' };
  } catch (e) {
    console.error('Storytelling: falló la IA', e);
    return { error: 'La IA tardó demasiado. Inténtalo otra vez.' };
  } finally {
    clearTimeout(t);
  }
}

/** El storytelling en HTML (para el negocio, el creador y el panel). */
export function verStorytelling(s, { compacto = false } = {}) {
  if (!s) return '';
  return `<div class="story">
  <h3>${esc(s.titulo)}</h3>
  ${s.idea ? `<p class="story-idea">${esc(s.idea)}</p>` : ''}
  <dl class="story-datos">${s.escenario ? `<dt>Escenario</dt><dd>${esc(s.escenario)}</dd>` : ''}${s.personaje ? `<dt>Personaje</dt><dd>${esc(s.personaje)}</dd>` : ''}</dl>
  <ol class="story-escenas">${s.escenas.map((e) => `<li><span class="story-tiempo">${esc(e.tiempo)}</span><div>${e.se_ve ? `<p><b>Se ve:</b> ${esc(e.se_ve)}</p>` : ''}${e.hace ? `<p><b>Hace:</b> ${esc(e.hace)}</p>` : ''}${e.dice ? `<p class="story-dice">«${esc(e.dice)}»</p>` : ''}</div></li>`).join('')}</ol>
  ${s.cierre ? `<p><b>Cierre:</b> ${esc(s.cierre)}</p>` : ''}
  ${!compacto && s.texto_en_pantalla?.length ? `<p><b>Texto en pantalla:</b> ${s.texto_en_pantalla.map(esc).join(' · ')}</p>` : ''}
  ${!compacto && s.musica ? `<p><b>Música:</b> ${esc(s.musica)}</p>` : ''}
  ${s.por_confirmar?.length ? `<p class="story-falta"><b>Por confirmar:</b> ${s.por_confirmar.map(esc).join(' · ')}</p>` : ''}
</div>`;
}

export const CSS_STORY = `.story{display:grid;gap:8px}.story h3{margin:0;font-size:1.2rem}.story p{margin:0}.story-idea{color:var(--soft,#555)}
.story-datos{display:grid;grid-template-columns:110px 1fr;gap:4px 10px;margin:0;font-size:15px}.story-datos dt{color:var(--soft,#666)}.story-datos dd{margin:0}
.story-escenas{list-style:none;margin:6px 0;padding:0;display:grid;gap:8px}.story-escenas li{display:grid;grid-template-columns:70px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:12px;background:#fff}
.story-tiempo{font-weight:800;color:var(--fucsia-tinta,#b50265);font-variant-numeric:tabular-nums}.story-dice{font-style:italic}.story-falta{color:#8a5a00}
@media(max-width:600px){.story-datos{grid-template-columns:1fr}.story-escenas li{grid-template-columns:1fr}}`;
