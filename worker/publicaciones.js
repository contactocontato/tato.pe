import { esc } from './ui.js';
import { leerPedido } from './pedidos.js';
import { mismoOrigen } from './seguridad.js';
import { ir, pagina, respuesta } from './portal.js';

const REDES = {
  'tiktok.com': ['TikTok', /^\/@[^/]+\/video\/\d+\/?$/],
  'vm.tiktok.com': ['TikTok', /^\/[\w-]+\/?$/],
  'vt.tiktok.com': ['TikTok', /^\/[\w-]+\/?$/],
  'instagram.com': ['Instagram', /^\/(reels?|p|tv)\/[\w-]+\/?$/],
  'facebook.com': ['Facebook', /^\/(reel\/\d+|watch\/?|share\/[vrp]\/[^/]+|[^/]+\/posts\/[^/]+|[^/]+\/videos\/\d+)\/?$/],
  'fb.watch': ['Facebook', /^\/[\w-]+\/?$/],
  'youtube.com': ['YouTube', /^\/(watch|shorts\/[\w-]+)\/?$/],
  'youtu.be': ['YouTube', /^\/[\w-]+\/?$/],
};
export const METRICAS = [['vistas', 'Vistas'], ['meGusta', 'Me gusta'], ['comentarios', 'Comentarios'], ['compartidos', 'Compartidos']];
const prefijo = (creador, pedido = '') => `publicacion:${creador}:${pedido ? pedido + ':' : ''}`;
const formatear = (n) => new Intl.NumberFormat('es-PE').format(n);

function enlace(valor) {
  if (typeof valor !== 'string' || valor.length > 500) return null;
  let url;
  try { url = new URL(valor); } catch { return null; }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const red = Object.hasOwn(REDES, host) ? REDES[host] : null;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !red?.[1].test(url.pathname)) return null;
  const parametro = url.pathname.replace(/\/$/, '') === '/watch' ? 'v' : '';
  const video = parametro && url.searchParams.get(parametro);
  if (parametro && (!video || !/^[\w-]{1,40}$/.test(video))) return null;
  url.hostname = host;
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = parametro ? new URLSearchParams({ [parametro]: video }).toString() : '';
  url.hash = '';
  return url.href.length <= 500 ? { url: url.href, red: red[0] } : null;
}

export async function listarPublicaciones(env, creador, pedido = '') {
  let cursor;
  const publicaciones = [];
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: prefijo(creador, pedido), cursor, limit: 1000 });
    publicaciones.push(...lote.keys.flatMap((k) => k.metadata ? [k.metadata] : []));
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  return publicaciones.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.actualizada.localeCompare(a.actualizada));
}

export async function guardarPublicacion(env, pedido, form, quien) {
  if (pedido.estado !== 'entregado') return 'Registra publicaciones cuando el pedido figure como entregado.';
  const base = prefijo(pedido.influencer.id, pedido.id);
  const accion = form.get('accion');
  if (accion === 'quitar') {
    const id = form.get('publicacion');
    if (!/^[a-f0-9]{32}$/.test(id || '')) return 'Publicación no válida.';
    await env.PEDIDOS_KV.delete(base + id);
    return '';
  }
  if (accion !== 'guardar') return 'Acción no válida.';
  const link = enlace(form.get('url'));
  if (!link) return 'Pega el enlace público de un video de TikTok, Instagram, Facebook o YouTube.';
  const cuenta = String(form.get('cuenta') || '').trim().slice(0, 60);
  if (!cuenta) return 'Escribe la cuenta que publicó el video.';
  const fecha = String(form.get('fecha') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha) return 'Ingresa la fecha de publicación.';
  const metricas = {};
  for (const [k, nombre] of METRICAS) {
    const v = String(form.get(k) || '').trim();
    if (v && !/^\d{1,10}$/.test(v)) return `${nombre}: ingresa un número entero, o déjalo vacío si no lo sabes.`;
    metricas[k] = v ? Number(v) : null;
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(link.url));
  const id = Array.from(new Uint8Array(hash).slice(0, 16), (n) => n.toString(16).padStart(2, '0')).join('');
  const clave = base + id;
  const existe = await env.PEDIDOS_KV.get(clave, 'json');
  if (!existe && (await env.PEDIDOS_KV.list({ prefix: base, limit: 12 })).keys.length >= 12) return 'Este pedido ya tiene 12 publicaciones.';
  const p = { ...link, id, pedido: pedido.id, cuenta, fecha, metricas, quien, actualizada: new Date().toISOString() };
  await env.PEDIDOS_KV.put(clave, JSON.stringify(p), { metadata: p });
  return '';
}

export function filasPublicaciones(publicaciones, editar = '', admin = false) {
  if (!publicaciones.length) return '<p class="vacio">Todavía no hay publicaciones registradas.</p>';
  return `<ul class="lista publicaciones">${publicaciones.map((p) => `<li class="caja publicacion">
  <div><span class="chip">${esc(p.red)}</span><h3><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.cuenta)} ↗</a></h3>
  <p class="nota">${esc(p.fecha)} · ${admin ? esc(p.pedido) : `<a href="/cuenta/pedido/${esc(p.pedido)}/">${esc(p.pedido)}</a>`} · Registrado por ${p.quien === 'estudio' ? 'Tato Studio' : 'el creador'}</p></div>
  <dl class="metricas-publicacion">${METRICAS.map(([k, label]) => `<div><dt>${esc(label)}</dt><dd>${p.metricas[k] == null ? '—' : formatear(p.metricas[k])}</dd></div>`).join('')}</dl>
  ${editar ? `<details><summary>Editar métricas</summary>${formPublicacion(editar, p)}
  <form method="post" action="${esc(editar)}" class="acciones"><input type="hidden" name="publicacion" value="${esc(p.id)}">
  <button name="accion" value="quitar" class="btn linea chico">Quitar enlace</button></form></details>` : ''}
</li>`).join('')}</ul>`;
}

export async function handlePanelPublicaciones(request, env, url) {
  const volver = '<a class="volver" href="/panel/pedidos/?ver=fin">← Pedidos terminados</a>';
  const p = await leerPedido(env, url.searchParams.get('pedido'));
  if (!p || p.estado !== 'entregado') return respuesta(pagina({ titulo: 'Pedido no disponible', cuerpo: volver + '<h1>El pedido debe estar entregado</h1>' }), 404);
  const ruta = `/panel/publicaciones/?pedido=${p.id}`;
  let error = '';
  if (request.method === 'POST') {
    if (!mismoOrigen(request)) return new Response('Origen no permitido.', { status: 403 });
    error = await guardarPublicacion(env, p, await request.formData(), 'estudio');
    if (!error) return ir(ruta + '&guardado=1');
  }
  const publicaciones = await listarPublicaciones(env, p.influencer.id, p.id);
  return respuesta(pagina({
    titulo: 'Publicaciones del pedido', ancho: true, error,
    aviso: url.searchParams.has('guardado') ? 'Registro actualizado.' : '',
    cuerpo: `${volver}<h1>Publicaciones de ${esc(p.id)}</h1>
<p class="sub">${esc(p.influencer.nombre)} · ${esc(p.negocio.nombreComercial || p.negocio.razonSocial || '')}</p>
<div class="estudio-doble"><section><h2>Videos registrados</h2>${filasPublicaciones(publicaciones, ruta, true)}</section>
<section><h2>Agregar enlace</h2><div class="caja">${formPublicacion(ruta)}</div></section></div>`,
  }), error ? 400 : 200);
}

export function formPublicacion(ruta, p) {
  const campo = (nombre, titulo, tipo, extra = '', valor = '') =>
    `<label>${titulo}<input name="${nombre}" type="${tipo}" value="${esc(valor)}" ${extra}></label>`;
  return `<form class="publicacion-form" method="post" action="${esc(ruta)}">
  ${campo('url', 'Enlace del video', 'url', `maxlength="500" required ${p ? 'readonly' : 'placeholder="https://…"'}`, p?.url)}
  <div class="publicacion-campos">
  ${campo('cuenta', 'Cuenta que lo publicó', 'text', 'maxlength="60" required placeholder="@cuenta o nombre de la marca"', p?.cuenta)}
  ${campo('fecha', 'Fecha de publicación', 'date', 'required', p?.fecha)}
  ${METRICAS.map(([k, label]) => campo(k, label, 'number', 'min="0" max="9999999999" step="1" placeholder="Sin dato"', p?.metricas[k] ?? '')).join('')}
  </div>
  <p class="nota">Las métricas son opcionales. Anota las cifras que muestra la red social.</p>
  <div class="acciones"><button class="btn fucsia chico" name="accion" value="guardar">${p ? 'Guardar cambios' : 'Registrar publicación'}</button></div>
</form>`;
}
