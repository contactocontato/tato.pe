import { influencerPublicado, leerCuenta, recibePedidos, soles } from './pedidos.js';
import { esc, json } from './ui.js';
import { pagina, respuesta } from './portal.js';

export async function handleCreadores(env, url) {
  const lote = await env.PEDIDOS_KV.list({
    prefix: 'influencer:creador-', limit: 100, cursor: url.searchParams.get('cursor') || undefined,
  });
  const perfiles = lote.keys.flatMap(({ name, metadata }) => metadata?.publico
    ? [{ id: name.slice('influencer:'.length), ...metadata.publico }]
    : []);
  return json({ perfiles, siguiente: lote.list_complete ? null : lote.cursor });
}

export async function handlePerfilCreador(env, url, id) {
  const p = await influencerPublicado(env, id);
  const volver = '<a class="volver" href="/influencers/">← Catálogo de influencers</a>';
  if (!p) return respuesta(pagina({ titulo: 'Perfil no disponible', cuerpo: volver + '<h1>Este perfil no está disponible</h1>' }), 404);
  const disponible = recibePedidos(await leerCuenta(env, id));
  const elegido = url.searchParams.get('paquete');
  const paquetes = p.paquetes.map((paq) => `<article class="caja">
<h3>${esc(paq.nombre)} · ${soles(paq.precio)}</h3><p>${esc(paq.descripcion)}</p>
<p class="nota">${esc(paq.entrega)}. ${esc(paq.uso)}.</p></article>`).join('');
  const formulario = disponible ? `<h2>Pide un video</h2>
<p>Necesitas el RUC y el código de un <a href="/influencers/registro/?para=${esc(id)}">negocio registrado</a>.</p>
<form id="pedido-creador" class="caja" method="post" action="/api/pedidos">
<input type="hidden" name="influencer" value="${esc(id)}">
<label for="paquete">Paquete</label><select id="paquete" name="paquete" required>
${p.paquetes.map((paq) => `<option${elegido === paq.nombre ? ' selected' : ''}>${esc(paq.nombre)}</option>`).join('')}</select>
<label for="ruc">RUC del negocio</label><input id="ruc" name="ruc" type="text" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" required>
<label for="codigo">Código del negocio</label><input id="codigo" name="codigo" type="text" maxlength="8" placeholder="TS-XXXXX" required>
<label for="promociona">¿Qué quieres promocionar?</label><input id="promociona" name="promociona" type="text" minlength="10" maxlength="300" required>
<label for="detalle">Detalles (opcional)</label><textarea id="detalle" name="detalle" maxlength="1000"></textarea>
<p class="aviso err" id="pedido-error" role="alert" hidden></p>
<div class="acciones"><button class="btn fucsia" disabled>Enviar solicitud</button></div></form>
<p class="aviso" id="pedido-recibo" tabindex="-1" hidden></p>
<script>
const form = document.querySelector('#pedido-creador');
const boton = form.querySelector('button');
const error = document.querySelector('#pedido-error');
const recibo = document.querySelector('#pedido-recibo');
boton.disabled = false;
try {
  const negocio = JSON.parse(localStorage.getItem('tato-negocio') || '{}');
  form.elements.ruc.value = negocio.ruc || '';
  form.elements.codigo.value = negocio.codigo || '';
} catch {}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  boton.disabled = true;
  error.hidden = true;
  try {
    const res = await fetch(form.action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'No se pudo enviar la solicitud.');
    form.hidden = true;
    recibo.textContent = r.mensaje;
    recibo.hidden = false;
    recibo.focus();
  } catch (err) {
    error.textContent = err.message || 'Vuelve a intentarlo.';
    error.hidden = false;
  } finally { boton.disabled = false; }
});
</script>` : '<p class="aviso ojo">Este creador ha pausado los pedidos nuevos.</p>';
  return respuesta(pagina({ titulo: p.nombre, cuerpo: `${volver}<h1>${esc(p.nombre)}</h1>
<p class="sub">${esc(p.region)} · ${esc(p.redes)}</p><p>${esc(p.contenido)}</p>
<h2>Videos disponibles</h2>${paquetes}${formulario}` }));
}
