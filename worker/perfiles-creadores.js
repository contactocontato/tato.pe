import { influencerPublicado, leerCuenta, recibePedidos, soles } from './pedidos.js';
import { esc, json } from './ui.js';
import { pagina, respuesta } from './portal.js';
import { paqueteCompleto, duracion } from './orden.js';

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
  const paquetes = p.paquetes.map((x) => paqueteCompleto(x)).map((paq) => `<article class="caja">
<h3>${esc(paq.nombre)}</h3><p class="precio">${soles(paq.precio)}</p><p>${esc(paq.descripcion)}</p>
<p><b>${esc(duracion(paq))}</b></p>
<p class="nota">${esc(paq.entrega)}. ${esc(paq.uso)}.</p>${disponible ? `<div class="acciones"><a class="btn fucsia chico" href="/negocio/pedir/${esc(id)}/?paquete=${encodeURIComponent(paq.nombre)}">Pedir ${esc(paq.nombre)}</a></div>` : ''}</article>`).join('');
  const formulario = disponible ? `<section id="pedir" class="estudio-seccion"><h2>Cómo pides tu video</h2>
<ol class="avance caja" aria-label="Cómo pides">
  <li><b>Registra tu negocio</b><span>Lo verificamos con tu RUC y creas tu usuario.</span></li>
  <li><b>Arma tu orden</b><span>Eliges el paquete, subes fotos de tu negocio y del escenario, y cuentas tu idea.</span></li>
  <li><b>Aprueba tu storytelling</b><span>La IA desarrolla tu idea; tú la apruebas o pides otra versión.</span></li>
  <li><b>Producimos</b><span>${esc(p.nombre.split(' ')[0])} acepta, pagas el adelanto y el equipo creativo empieza.</span></li>
</ol>
<div class="acciones"><a class="btn fucsia" href="/negocio/pedir/${esc(id)}/">Pedir un video a ${esc(p.nombre.split(' ')[0])}</a><a class="btn linea" href="/influencers/registro/?para=${esc(id)}">Registrar mi negocio</a></div>
<p class="nota">Si ya tienes usuario, entras a tu panel y la orden se arma ahí.</p>
</section>` : '';
  return respuesta(pagina({ titulo: p.nombre, ancho: true, cuerpo: `${volver}<section class="perfil-hero"><p class="mono">TATO STUDIO / CREADORES DEL PERÚ</p>
<h1>${esc(p.nombre)}</h1><p class="sub">${esc(p.region)} · ${esc(p.redes)}</p><p class="presentacion">${esc(p.contenido)}</p>
${p.telefonoVerificado ? '<p><strong>WhatsApp verificado</strong></p>' : ''}
<div class="acciones"><a class="btn fucsia" href="#paquetes">Ver paquetes</a></div></section>
<section id="paquetes" class="estudio-seccion"><h2>Videos disponibles</h2><div class="perfil-paquetes">${paquetes}</div></section>${formulario}` }));
}
