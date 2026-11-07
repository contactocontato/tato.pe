// Orden de servicio: el negocio, desde su panel, pide un video a un influencer en /negocio/pedir/<id>/.
//   1. Elige el negocio y el paquete (con los segundos de cada video bien claros).
//   2. Cuenta qué quiere promocionar, su idea (o su guion final) y qué debe hacer el influencer;
//      sube fotos de su negocio o producto y del escenario donde debe aparecer el personaje.
//   3. La IA desarrolla su idea en un storytelling (worker/storytelling.js). Lo aprueba o pide otra versión.
//   4. Acepta que el video usa la imagen y la voz del influencer recreadas con IA, y envía la orden:
//      se crea el pedido (worker/pedidos.js) y el equipo creativo lo recibe para coordinar.
//
// El borrador vive en PEDIDOS_KV (orden:<usuario>:<influencer>, 30 días). Las fotos, en R2 (MEDIOS, privado)
// bajo negocios/<ruc>/orden-…; solo las ve el negocio y Tato.

import { esc } from './ui.js';
import { contar } from './seguridad.js';
import { influencerPublicado, leerCuenta, recibePedidos, crearPedido, soles } from './pedidos.js';
import { generarStorytelling, iaLista, verStorytelling, CSS_STORY } from './storytelling.js';
import { avisarTato } from './avisos.js';
import { pagina, respuesta, ir, WHATSAPP_TATO } from './portal.js';
import planes from '../src/data/planes-influencer.json' with { type: 'json' };

const MAX_VERSIONES = 6;
const MAX_FOTOS = { negocio: 3, escenario: 2 };
const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const nombreDe = (n) => n.negocio?.nombreComercial || n.sunat?.razonSocial || `RUC ${n.ruc}`;

/** El texto que el negocio acepta antes de enviar (queda guardado en el pedido). */
export const textoIA = (nombre) => `Entiendo que el video usa la imagen y la voz de ${nombre} recreadas con inteligencia artificial, y que su forma de actuar, su personalidad y su voz en el video pueden no ser idénticas a las de la persona real.`;
const TEXTO_FOTOS = 'Las fotos que subo son de mi negocio o tengo permiso para usarlas en este video.';

/** El paquete con sus segundos y videos (los paquetes estándar los toman de planes-influencer.json). */
export function paqueteCompleto(paq) {
  if (!paq) return null;
  const plan = planes.paquetes.find((x) => x.nombre === paq.nombre) || {};
  return { ...paq, segundos: paq.segundos ?? plan.segundos ?? null, videos: paq.videos ?? plan.videos ?? 1, descripcion: paq.descripcion ?? plan.descripcion ?? '' };
}
export const duracion = (paq) => (paq?.segundos ? `${paq.videos > 1 ? `${paq.videos} videos de ` : ''}${paq.segundos} segundos${paq.videos > 1 ? ' cada uno' : ''}` : 'la duración la coordinamos contigo');

const claveBorrador = (usuario, id) => `orden:${usuario}:${id}`;
const leerBorrador = async (env, usuario, id) => (await env.PEDIDOS_KV.get(claveBorrador(usuario, id), 'json')) || { fotos: { negocio: [], escenario: [] }, versiones: [], aprobada: null };
const guardarBorrador = (env, usuario, id, b) => env.PEDIDOS_KV.put(claveBorrador(usuario, id), JSON.stringify({ ...b, actualizado: new Date().toISOString() }), { expirationTtl: 30 * 86400 });
const limpio = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

/** ¿Tiene lo necesario para pedir el storytelling? Devuelve '' o lo que falta. */
function falta(b) {
  if (!b.paquete) return 'Elige un paquete.';
  if (!b.ruc) return 'Elige tu negocio.';
  if ((b.promociona || '').length < 10) return 'Cuéntanos en una frase qué quieres promocionar.';
  if ((b.idea || '').length < 20) return b.tipo === 'guion' ? 'Pega tu guion.' : 'Cuéntanos tu idea con un poco más de detalle.';
  return '';
}

async function guardarFoto(env, ruc, archivo) {
  const ext = TIPOS[archivo.type];
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const firma = (datos[0] === 0x89 && datos[1] === 0x50) || (datos[0] === 0xff && datos[1] === 0xd8) || (datos[8] === 0x57 && datos[9] === 0x45 && datos[10] === 0x42 && datos[11] === 0x50);
  if (!ext || !firma || datos.length > 8 * 1024 * 1024) return { error: 'Sube fotos en JPG, PNG o WEBP de hasta 8 MB.' };
  const clave = `negocios/${ruc}/orden-${crypto.randomUUID()}.${ext}`;
  await env.MEDIOS.put(clave, datos, { httpMetadata: { contentType: archivo.type } });
  return { clave };
}

// ---------- Página ----------

function pasoActual(b, ia) {
  if (falta(b)) return 1;
  if (ia && b.aprobada == null) return 2;
  return 3;
}

function paginaOrden({ cuenta, negocios, inf, paquetes, b, error = '', aviso = '', ia }) {
  const id = inf.id;
  const accion = `/negocio/pedir/${esc(id)}/`;
  const verdes = negocios.filter((n) => n.semaforo === 'verde');
  const paso = pasoActual(b, ia);
  const ultima = b.versiones.at(-1);
  const aprobada = b.aprobada != null ? b.versiones[b.aprobada] : null;
  const foto = (grupo, f) => `<figure class="foto-orden"><img src="/negocio/archivo?clave=${encodeURIComponent(f.clave)}" alt="${grupo === 'escenario' ? 'Foto del escenario' : 'Foto del negocio o producto'}" loading="lazy">
    <button class="quitar" type="submit" name="quitar" value="${esc(f.clave)}" formnovalidate formaction="${accion}?accion=quitar" aria-label="Quitar esta foto">Quitar</button></figure>`;
  const fotos = (grupo, titulo, ayuda) => `<fieldset class="fotos-orden"><legend>${titulo} <span class="nota">(hasta ${MAX_FOTOS[grupo]})</span></legend>
    <p class="nota">${ayuda}</p>
    ${b.fotos[grupo].length ? `<div class="fotos-fila">${b.fotos[grupo].map((f) => foto(grupo, f)).join('')}</div>` : ''}
    ${b.fotos[grupo].length < MAX_FOTOS[grupo] ? `<input type="file" name="foto_${grupo}" accept="image/jpeg,image/png,image/webp" ${MAX_FOTOS[grupo] - b.fotos[grupo].length > 1 ? 'multiple' : ''} data-achicar>` : ''}
  </fieldset>`;
  const paqueteCard = (p) => `<label class="paquete-op"><input type="radio" name="paquete" value="${esc(p.nombre)}" required${b.paquete === p.nombre ? ' checked' : ''}>
    <span><b>${esc(p.nombre)}</b> <span class="precio">${p.precio == null ? 'A cotizar' : soles(p.precio)}</span>
    <span class="segundos">${esc(duracion(p))}</span>
    ${p.descripcion ? `<span class="nota">${esc(p.descripcion)}</span>` : ''}
    <span class="nota">Entrega: ${esc(p.entrega)} · Uso: ${esc(p.uso)}</span></span></label>`;

  const pasos = `<ol class="avance caja" aria-label="Pasos de tu orden">
  <li class="${paso > 1 ? 'hecho' : 'ahora'}"><b>1. Tu pedido</b><span>Paquete, idea y fotos</span></li>
  <li class="${paso > 2 ? 'hecho' : paso === 2 ? 'ahora' : ''}"><b>2. Storytelling</b><span>${ia ? 'La IA desarrolla tu idea y tú la apruebas' : 'Lo arma el equipo creativo contigo'}</span></li>
  <li class="${paso === 3 ? 'ahora' : ''}"><b>3. Enviar</b><span>Llega a ${esc(inf.nombre.split(' ')[0])} y al equipo creativo</span></li>
  <li><b>4. Producción</b><span>Adelanto, guion final, video y entrega</span></li>
</ol>`;

  const datos = `<form class="caja orden-form" method="post" action="${accion}?accion=guardar" enctype="multipart/form-data">
  <h2>1. Tu pedido</h2>
  ${verdes.length > 1 ? `<label for="ruc">¿Para cuál de tus negocios?</label><select id="ruc" name="ruc" required>${verdes.map((n) => `<option value="${esc(n.ruc)}"${b.ruc === n.ruc ? ' selected' : ''}>${esc(nombreDe(n))}</option>`).join('')}</select>` : `<input type="hidden" name="ruc" value="${esc(verdes[0].ruc)}"><p class="nota">Para <b>${esc(nombreDe(verdes[0]))}</b>.</p>`}
  <fieldset><legend>Elige el paquete</legend><div class="paquetes-op">${paquetes.map(paqueteCard).join('')}</div></fieldset>
  <label for="promociona">¿Qué quieres promocionar?</label>
  <input id="promociona" name="promociona" type="text" maxlength="200" required placeholder="El ceviche mixto de los domingos" value="${esc(b.promociona || '')}">
  <fieldset><legend>¿Qué tienes?</legend><div class="opciones">
    <label class="check"><input type="radio" name="tipo" value="idea"${b.tipo !== 'guion' ? ' checked' : ''}> Una idea: que la IA la desarrolle</label>
    <label class="check"><input type="radio" name="tipo" value="guion"${b.tipo === 'guion' ? ' checked' : ''}> Mi guion final: que solo lo ordene en escenas</label>
  </div></fieldset>
  <label for="idea">Tu idea o tu guion</label>
  <textarea id="idea" name="idea" rows="6" maxlength="3000" required placeholder="Quiero que ${esc(inf.nombre.split(' ')[0])} llegue con hambre a mi local, pruebe el ceviche y diga que es el mejor de Huaraz. Que se vea el plato servido y la gente en las mesas.">${esc(b.idea || '')}</textarea>
  <label for="accion">¿Qué debe hacer ${esc(inf.nombre.split(' ')[0])} en el video?</label>
  <textarea id="accion" name="accion" rows="3" maxlength="800" placeholder="Que pruebe el plato, sonría y señale la carta. Que diga el nombre del local al final.">${esc(b.accion || '')}</textarea>
  <label for="fecha">¿Para cuándo lo necesitas? <span class="nota">(opcional)</span></label>
  <input id="fecha" name="fecha" type="date" value="${esc(b.fecha || '')}">
  ${fotos('negocio', 'Fotos de tu negocio o producto', 'El local, el plato o el producto tal como es. Así sale igual en el video.')}
  ${fotos('escenario', 'Foto del escenario', `El lugar donde debe aparecer ${esc(inf.nombre.split(' ')[0])}: tu local por dentro, la fachada o donde quieras.`)}
  <div class="acciones"><button class="btn fucsia" type="submit">${b.versiones.length ? 'Guardar cambios' : 'Guardar y seguir'}</button></div>
</form>`;

  let story;
  if (!ia) {
    story = `<section class="caja"><h2>2. Storytelling</h2><p>Cuando envíes tu orden, el equipo creativo desarrolla tu idea en un storytelling y lo coordina contigo por WhatsApp antes de producir.</p></section>`;
  } else if (falta(b)) {
    story = `<section class="caja apagada"><h2>2. Storytelling</h2><p class="nota">Primero guarda tu pedido: ${esc(falta(b))}</p></section>`;
  } else if (!ultima) {
    story = `<section class="caja"><h2>2. Storytelling</h2><p>La IA desarrolla tu ${b.tipo === 'guion' ? 'guion en escenas, sin cambiar lo que dice' : 'idea en escenas con tiempos'}, para un video de ${esc(duracion(b.paqueteDatos))}. Todo sale de lo que escribiste y de tus fotos.</p>
<form method="post" action="${accion}?accion=generar" data-espera="La IA está escribiendo tu storytelling… puede tardar hasta 30 segundos."><div class="acciones"><button class="btn fucsia" type="submit">${b.tipo === 'guion' ? 'Ordenar mi guion con IA' : 'Desarrollar mi idea con IA'}</button></div></form></section>`;
  } else {
    const n = b.versiones.length;
    const mostrada = aprobada || ultima;
    story = `<section class="caja${aprobada ? ' aprobado' : ''}"><h2>2. Storytelling ${aprobada ? '<span class="chip ok">Aprobado</span>' : `<span class="nota">versión ${n} de ${MAX_VERSIONES}</span>`}</h2>
${verStorytelling(mostrada.storytelling)}
${aprobada ? `<p class="nota">Aprobaste la versión ${b.aprobada + 1}. Si cambias algo de tu pedido arriba, vuelve a revisarlo.</p>` : `<form method="post" action="${accion}?accion=aprobar"><input type="hidden" name="version" value="${n - 1}"><div class="acciones"><button class="btn fucsia" type="submit">Aprobar este storytelling</button></div></form>
${n < MAX_VERSIONES ? `<form method="post" action="${accion}?accion=generar" class="otra" data-espera="La IA está escribiendo otra versión… puede tardar hasta 30 segundos.">
  <label for="cambios">¿Qué cambiarías? <span class="nota">(opcional)</span></label>
  <textarea id="cambios" name="cambios" rows="2" maxlength="500" placeholder="Que el final sea más divertido y que se vea más el plato."></textarea>
  <div class="acciones"><button class="btn linea" type="submit">Generar otra versión</button></div></form>` : '<p class="nota">Llegaste al máximo de versiones. Aprueba la que más te guste: el equipo creativo la ajusta contigo.</p>'}`}
${n > 1 ? `<details><summary>Ver versiones anteriores</summary>${b.versiones.slice(0, -1).map((v, i) => `<div class="caja"><p class="nota">Versión ${i + 1}${v.cambios ? ` · pediste: ${esc(v.cambios)}` : ''}</p>${verStorytelling(v.storytelling, { compacto: true })}<form method="post" action="${accion}?accion=aprobar"><input type="hidden" name="version" value="${i}"><button class="btn linea chico" type="submit">Aprobar esta versión</button></form></div>`).join('')}</details>` : ''}
</section>`;
  }

  const listo = !falta(b) && (!ia || aprobada);
  const enviar = `<form class="caja${listo ? '' : ' apagada'}" method="post" action="${accion}?accion=enviar">
  <h2>3. Envía tu orden</h2>
  ${listo ? `<p>Tu orden llega a ${esc(inf.nombre)} y al equipo creativo de Tato Studio, que coordina el storytelling contigo antes de producir. ${b.paqueteDatos?.precio != null ? `Cuando ${esc(inf.nombre.split(' ')[0])} la acepte, pagas el adelanto de producción y empezamos.` : 'Primero te cotizamos el precio.'}</p>` : `<p class="nota">${ia ? 'Cuando apruebes tu storytelling, envías tu orden aquí.' : 'Cuando guardes tu pedido, envías tu orden aquí.'}</p>`}
  <label class="check bloque"><input type="checkbox" name="aceptaIA" value="1" required${listo ? '' : ' disabled'}> ${esc(textoIA(inf.nombre))}</label>
  ${b.fotos.negocio.length + b.fotos.escenario.length ? `<label class="check bloque"><input type="checkbox" name="aceptaFotos" value="1" required${listo ? '' : ' disabled'}> ${esc(TEXTO_FOTOS)}</label>` : ''}
  <div class="acciones"><button class="btn fucsia" type="submit"${listo ? '' : ' disabled'}>Enviar orden de servicio</button></div>
</form>`;

  return pagina({
    titulo: `Orden de servicio · ${inf.nombre}`,
    cuenta: { nombre: cuenta.nombre || cuenta.usuario },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    error,
    aviso,
    cuerpo: `<style>${CSS_ORDEN}${CSS_STORY}</style>
<a class="volver" href="/negocio/">← Tu panel</a>
<h1>Video con <span class="fx">${esc(inf.nombre)}</span></h1>
<p class="sub">Tu orden de servicio. Se guarda sola mientras la armas: puedes volver cuando quieras.</p>
${pasos}${datos}${story}${enviar}
<p class="nota">¿Dudas? <a href="https://wa.me/${WHATSAPP_TATO}?text=${encodeURIComponent(`Hola Tato, tengo una duda con mi orden para ${inf.nombre}.`)}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>
${SCRIPT_ORDEN}`,
  });
}

const CSS_ORDEN = `.orden-form h2,.caja>h2{margin-top:0}.apagada{opacity:.6}
.paquetes-op{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.paquete-op{display:flex;gap:10px;align-items:flex-start;border:1.5px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff;cursor:pointer;font-weight:400}
.paquete-op:has(input:checked){border-color:var(--fucsia);box-shadow:0 0 0 2px rgba(226,3,126,.15)}.paquete-op input{margin-top:5px}
.paquete-op>span{display:grid;gap:3px}.paquete-op .precio{color:var(--fucsia-tinta);font-weight:800}.paquete-op .segundos{font-weight:700}
.fotos-orden{border:0;padding:0;margin:16px 0 4px}.fotos-orden legend{font-weight:700}
.fotos-fila{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.foto-orden{margin:0;width:110px;display:grid;gap:4px}
.foto-orden img{width:110px;height:110px;object-fit:cover;border-radius:12px;border:1px solid var(--line);background:#fff}
.foto-orden .quitar{font:inherit;font-size:13px;background:none;border:0;color:var(--fucsia-tinta);text-decoration:underline;cursor:pointer;padding:0}
.check.bloque{display:flex;align-items:flex-start;gap:10px;margin:10px 0;line-height:1.45}.check.bloque input{margin-top:4px;flex:none}
.aprobado{border-color:#1f7a3f}.otra{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
@media(max-width:880px){.avance{grid-template-columns:1fr 1fr}}`;

// Achica las fotos en el navegador antes de subirlas (máximo 1600 px, JPEG): suben más rápido, pesan menos
// y pierden los datos de ubicación. Muestra un aviso mientras la IA escribe.
const SCRIPT_ORDEN = `<script>
(() => {
  async function achicar(f) {
    if (!/^image\\/(jpeg|png|webp)$/.test(f.type) || !window.createImageBitmap) return f;
    try {
      const img = await createImageBitmap(f);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      return blob ? new File([blob], f.name.replace(/\\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
    } catch (e) { return f; }
  }
  document.querySelectorAll('input[type=file][data-achicar]').forEach((input) => input.addEventListener('change', async () => {
    if (!window.DataTransfer) return;
    const dt = new DataTransfer();
    for (const f of input.files) dt.items.add(await achicar(f));
    input.files = dt.files;
  }));
  document.querySelectorAll('form[data-espera]').forEach((f) => f.addEventListener('submit', () => {
    const b = f.querySelector('button[type=submit]');
    if (b) { b.disabled = true; b.textContent = f.dataset.espera; }
  }));
})();
</script>`;

// ---------- Rutas ----------

/** /negocio/pedir/<id>/ (la sesión del negocio ya está revisada en worker/portal-negocio.js). */
export async function handleOrden(request, env, url, { cuenta, negocios, influencerId }) {
  const post = request.method === 'POST';
  const ia = iaLista(env);
  const inf = await influencerPublicado(env, influencerId);
  const cuentaInf = inf ? await leerCuenta(env, influencerId) : null;
  const sinPedido = (titulo, texto, status = 404) => respuesta(pagina({ titulo, cuenta: { nombre: cuenta.nombre || cuenta.usuario }, salir: '/negocio/salir', inicio: '/negocio/', cuerpo: `<a class="volver" href="/negocio/">← Tu panel</a><h1>${esc(titulo)}</h1><p class="sub">${texto}</p><p><a class="btn fucsia" href="/influencers/">Ver el catálogo</a></p>` }), status);
  if (!inf) return sinPedido('Ese influencer no está en el catálogo', 'Elige otro influencer del catálogo.');
  if (!recibePedidos(cuentaInf)) return sinPedido(`${inf.nombre} no está tomando pedidos`, 'Por ahora no recibe pedidos. Elige otro influencer del catálogo.', 409);
  const verdes = negocios.filter((n) => n.semaforo === 'verde');
  if (!verdes.length) return sinPedido('Tu negocio todavía no está verificado', 'Cuando lo verifiquemos, pides tus videos aquí. Si tienes dudas, escríbenos por WhatsApp.', 403);
  const paquetes = inf.paquetes.map(paqueteCompleto);
  const b = await leerBorrador(env, cuenta.usuario, inf.id);
  if (!b.ruc || !verdes.some((n) => n.ruc === b.ruc)) b.ruc = verdes.length === 1 ? verdes[0].ruc : '';
  if (!b.paquete && url.searchParams.get('paquete') && paquetes.some((p) => p.nombre === url.searchParams.get('paquete'))) b.paquete = url.searchParams.get('paquete');
  b.paqueteDatos = paquetes.find((p) => p.nombre === b.paquete) || null;
  const ver = (extra = {}, status = 200) => respuesta(paginaOrden({ cuenta, negocios, inf, paquetes, b, ia, ...extra }), status);
  if (!post) return ver({ aviso: { generado: 'Listo: revisa tu storytelling.', guardado: 'Guardamos tu pedido.', aprobado: 'Aprobaste tu storytelling. Ya puedes enviar tu orden.' }[url.searchParams.get('m')] || '' });

  const accion = url.searchParams.get('accion');
  const volver = (m) => ir(`/negocio/pedir/${inf.id}/?m=${m}`);
  if (Number(request.headers.get('Content-Length') || 0) > 40 * 1024 * 1024) return ver({ error: 'Las fotos pesan demasiado. Súbelas de a una.' }, 413);
  const f = await request.formData();

  if (accion === 'guardar' || accion === 'quitar') {
    const quitar = accion === 'quitar' ? String(f.get('quitar') || '') : '';
    const antes = JSON.stringify([b.paquete, b.promociona, b.tipo, b.idea, b.accion, b.ruc]);
    const ruc = String(f.get('ruc') || '');
    if (ruc && verdes.some((n) => n.ruc === ruc)) b.ruc = ruc;
    if (paquetes.some((p) => p.nombre === f.get('paquete'))) b.paquete = String(f.get('paquete'));
    b.promociona = limpio(f.get('promociona'), 200) || b.promociona || '';
    b.tipo = f.get('tipo') === 'guion' ? 'guion' : 'idea';
    if (f.has('idea')) b.idea = limpio(f.get('idea'), 3000);
    if (f.has('accion')) b.accion = limpio(f.get('accion'), 800);
    b.fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(f.get('fecha') || '')) ? String(f.get('fecha')) : '';
    if (quitar) {
      for (const g of ['negocio', 'escenario']) {
        if (b.fotos[g].some((x) => x.clave === quitar)) {
          b.fotos[g] = b.fotos[g].filter((x) => x.clave !== quitar);
          if (env.MEDIOS) await env.MEDIOS.delete(quitar);
        }
      }
    }
    let errorFoto = '';
    for (const g of ['negocio', 'escenario']) {
      for (const archivo of f.getAll(`foto_${g}`)) {
        if (!archivo || typeof archivo.arrayBuffer !== 'function' || !archivo.size) continue;
        if (!env.MEDIOS) { errorFoto = 'Todavía no podemos guardar fotos. Mándaselas a Tato por WhatsApp.'; break; }
        if (b.fotos[g].length >= MAX_FOTOS[g]) { errorFoto = `Puedes subir hasta ${MAX_FOTOS[g]} fotos en «${g === 'negocio' ? 'tu negocio o producto' : 'escenario'}».`; break; }
        const r = await guardarFoto(env, b.ruc || verdes[0].ruc, archivo);
        if (r.error) { errorFoto = r.error; break; }
        b.fotos[g].push({ clave: r.clave, subida: new Date().toISOString() });
      }
    }
    // Si cambió el pedido, el storytelling aprobado ya no corresponde: hay que revisarlo otra vez.
    if (b.aprobada != null && antes !== JSON.stringify([b.paquete, b.promociona, b.tipo, b.idea, b.accion, b.ruc])) b.aprobada = null;
    await guardarBorrador(env, cuenta.usuario, inf.id, b);
    b.paqueteDatos = paquetes.find((p) => p.nombre === b.paquete) || null;
    if (errorFoto) return ver({ error: errorFoto }, 400);
    return volver('guardado');
  }

  if (accion === 'generar') {
    if (falta(b)) return ver({ error: falta(b) }, 400);
    if (b.versiones.length >= MAX_VERSIONES) return ver({ error: 'Llegaste al máximo de versiones. Aprueba la que más te guste.' }, 429);
    if ((await contar(env, `storytelling:${cuenta.usuario}:${new Date().toISOString().slice(0, 10)}`, 86400)) > 20) {
      return ver({ error: 'Pediste muchas versiones hoy. Aprueba una o vuelve mañana.' }, 429);
    }
    const n = negocios.find((x) => x.ruc === b.ruc);
    const cambios = limpio(f.get('cambios'), 500);
    const r = await generarStorytelling(env, {
      negocio: { nombre: nombreDe(n), rubro: n.negocio?.rubro || '' },
      perfil: n.perfil || {},
      influencer: { nombre: inf.nombre, contenido: inf.contenido || '' },
      paquete: b.paqueteDatos,
      orden: { promociona: b.promociona, tipo: b.tipo, idea: b.idea, accion: b.accion },
      fotos: [
        ...b.fotos.escenario.map((x) => ({ clave: x.clave, que: 'Foto del escenario donde debe aparecer el personaje:' })),
        ...b.fotos.negocio.map((x) => ({ clave: x.clave, que: 'Foto del negocio o del producto:' })),
      ],
      anterior: b.versiones.at(-1)?.storytelling || null,
      cambios,
    });
    if (r.error) return ver({ error: r.error }, 502);
    b.versiones.push({ storytelling: r.storytelling, cambios, fecha: new Date().toISOString() });
    b.aprobada = null;
    await guardarBorrador(env, cuenta.usuario, inf.id, b);
    return volver('generado');
  }

  if (accion === 'aprobar') {
    const v = Number(f.get('version'));
    if (!Number.isInteger(v) || !b.versiones[v]) return ver({ error: 'Esa versión no existe.' }, 400);
    b.aprobada = v;
    await guardarBorrador(env, cuenta.usuario, inf.id, b);
    return volver('aprobado');
  }

  if (accion === 'enviar') {
    if (falta(b)) return ver({ error: falta(b) }, 400);
    if (ia && b.aprobada == null) return ver({ error: 'Aprueba tu storytelling antes de enviar la orden.' }, 400);
    if (f.get('aceptaIA') !== '1') return ver({ error: 'Para enviar tu orden marca que entiendes cómo se hace el video con IA.' }, 400);
    const conFotos = b.fotos.negocio.length + b.fotos.escenario.length > 0;
    if (conFotos && f.get('aceptaFotos') !== '1') return ver({ error: 'Marca que las fotos son de tu negocio o que tienes permiso para usarlas.' }, 400);
    const n = negocios.find((x) => x.ruc === b.ruc);
    const ahora = new Date().toISOString();
    const r = await crearPedido(env, {
      negocio: n,
      influencerId: inf.id,
      paquete: b.paquete,
      brief: {
        orden: true,
        promociona: b.promociona,
        detalle: b.idea,
        tipo: b.tipo,
        accion: b.accion || '',
        fecha: b.fecha || '',
        segundos: b.paqueteDatos?.segundos ?? null,
        videos: b.paqueteDatos?.videos ?? 1,
        storytelling: b.aprobada != null ? b.versiones[b.aprobada].storytelling : null,
        versiones: b.versiones.length,
        fotos: { negocio: b.fotos.negocio.map((x) => x.clave), escenario: b.fotos.escenario.map((x) => x.clave) },
        aceptaIA: { fecha: ahora, texto: textoIA(inf.nombre) },
        aceptaFotos: conFotos ? { fecha: ahora, texto: TEXTO_FOTOS } : null,
        usuario: cuenta.usuario,
      },
    });
    if (r.error) return ver({ error: r.error }, r.status || 400);
    await env.PEDIDOS_KV.delete(claveBorrador(cuenta.usuario, inf.id));
    await avisarTato(env, {
      asunto: `Nueva orden de servicio: ${nombreDe(n)} para ${inf.nombre}`,
      titulo: 'Llegó una orden de servicio',
      parrafos: [`${nombreDe(n)} pidió ${b.paquete} (${duracion(b.paqueteDatos)}) con ${inf.nombre}.`, b.aprobada != null ? 'Trae su storytelling aprobado y sus fotos.' : 'Hay que armar el storytelling con el negocio.'],
      ruta: `/panel/pedidos/?ver=todos&abrir=${r.p.id}`,
    });
    return ir(`/negocio/pedido/${r.p.id}/?m=orden`);
  }
  return ver();
}
