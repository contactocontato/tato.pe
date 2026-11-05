import { esc, html, json, page } from './ui.js';
import { contar, mismoOrigen, usos } from './seguridad.js';

const PREFIJO = 'postulacion:';
const RETENCION = 90 * 86400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function handlePostulacion(request, env) {
  if (request.method !== 'POST') return json({ error: 'Usa el formulario de registro.' }, 405);
  if (!mismoOrigen(request)) return json({ error: 'Abre el formulario desde tato.pe.' }, 403);
  if (!env.PEDIDOS_KV) return json({ error: 'El registro está temporalmente fuera de servicio.' }, 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Envía la solicitud desde el formulario.' }, 415);
  const lector = request.body?.getReader();
  if (!lector) return json({ error: 'No recibimos tus datos.' }, 400);
  const decoder = new TextDecoder();
  let cuerpo = '', bytes = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) {
      await lector.cancel();
      return json({ error: 'La solicitud es demasiado larga.' }, 413);
    }
    cuerpo += decoder.decode(value, { stream: true });
  }
  let datos;
  try { datos = JSON.parse(cuerpo + decoder.decode()); } catch { return json({ error: 'No pudimos leer tus datos.' }, 400); }
  const campo = (nombre, max) => typeof datos?.[nombre] === 'string' ? datos[nombre].trim().slice(0, max) : '';
  const id = campo('id', 37);
  const nombre = campo('nombre', 100);
  const whatsapp = campo('whatsapp', 22).replace(/[^\d]/g, '').replace(/^51(?=9\d{8}$)/, '');
  const region = campo('region', 80);
  const redes = campo('redes', 200);
  const contenido = campo('contenido', 500);
  if (!UUID.test(id) || datos.sitio || !nombre || !/^9\d{8}$/.test(whatsapp) || !region || !redes || !contenido || datos.mayor !== true || datos.autoriza !== true) {
    return json({ error: 'Revisa el WhatsApp, completa los campos y confirma las dos casillas.' }, 400);
  }
  const clave = PREFIJO + id;
  const guardada = await env.PEDIDOS_KV.get(clave, 'json');
  if (guardada) {
    if (guardada.whatsapp !== whatsapp) return json({ error: 'Recarga la página para enviar otra solicitud.' }, 409);
    return json({ referencia: id });
  }
  const limite = 'postulacion:' + (request.headers.get('CF-Connecting-IP') || 'local');
  if (await usos(env, limite) >= 5) return json({ error: 'Alcanzaste el límite de solicitudes. Inténtalo mañana.' }, 429);
  await contar(env, limite, 86400);
  await env.PEDIDOS_KV.put(clave, JSON.stringify({
    id, nombre, whatsapp, region, redes, contenido, fecha: new Date().toISOString(), consentimiento: 1,
  }), { expirationTtl: RETENCION });
  return json({ referencia: id }, 201);
}

export async function handlePanelPostulaciones(env, url) {
  const cursor = url.searchParams.get('cursor') || undefined;
  const lista = await env.PEDIDOS_KV.list({ prefix: PREFIJO, limit: 25, cursor });
  const solicitudes = (await Promise.all(lista.keys.map(({ name }) => env.PEDIDOS_KV.get(name, 'json'))))
    .filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const filas = solicitudes.map((s) => {
    const contacto = 'https://wa.me/51' + s.whatsapp;
    return `<details class="reg"><summary><b>${esc(s.nombre)}</b> <span>${esc(s.region)}</span></summary>
<div class="cuerpo"><dl>
<dt>Recibida</dt><dd>${esc(new Date(s.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' }))}</dd>
<dt>Referencia</dt><dd><code>${esc(s.id)}</code></dd>
<dt>WhatsApp</dt><dd><a href="${esc(contacto)}" target="_blank" rel="noopener noreferrer">${esc(s.whatsapp)}</a></dd>
<dt>Red principal</dt><dd style="overflow-wrap:anywhere">${esc(s.redes)}</dd>
<dt>Contenido</dt><dd style="overflow-wrap:anywhere">${esc(s.contenido)}</dd>
</dl></div></details>`;
  }).join('');
  const siguiente = lista.list_complete ? '' : `<p><a href="?cursor=${encodeURIComponent(lista.cursor)}">Ver más solicitudes</a></p>`;
  return html(page('Postulaciones', `<p>Revisa las solicitudes recibidas y contacta al influencer para el convenio. Con el convenio firmado, prepara su ficha y <a href="/panel/influencers/">crea su cuenta</a>.</p>
${filas || '<p>No hay solicitudes en esta página.</p>'}${siguiente}`));
}
