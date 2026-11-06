// Portal del negocio en tato.pe/negocio/: entra con un código que le llega a su correo verificado
// (el que confirmó al registrar su negocio) y ve sus pedidos, lo que le toca pagar y en qué va cada video.
//
//   /negocio/                inicio (o la página para entrar)
//   /negocio/entrar          POST: correo → código → sesión
//   /negocio/salir           POST: cierra la sesión
//   /negocio/pedido/<id>/    un pedido
//
// La sesión es otra cookie (tato_negocio, ver worker/seguridad.js); en ella solo va el correo.
// Al abrir el inicio, el código y el RUC de su negocio verificado quedan en el navegador (localStorage
// «tato-negocio», el mismo que usa el registro), así el formulario de pedido de cada influencer se llena solo.

import { esc } from './ui.js';
import { crearSesionNegocio, leerSesionNegocio, cerrarSesionNegocio, mismoOrigen, contar } from './seguridad.js';
import { configCorreo, correoValido, correoOculto, pedirCodigo, comprobarCodigoCorreo } from './correo.js';
import { negociosDeCorreo } from './negocios.js';
import { leerPedido, listarPedidos, cuentas, soles, ESTADOS, PASOS, ACTIVOS } from './pedidos.js';
import { listarPublicaciones, METRICAS } from './publicaciones.js';
import { WHATSAPP_TATO, fecha, fechaDia, multilinea, pagina, respuesta, ir } from './portal.js';

const ETIQUETA = { verde: 'Verificado', amarillo: 'En revisión', rojo: 'No entra', pausado: 'En pausa' };
const nombreDe = (n) => n.sunat?.razonSocial || n.negocio?.nombreComercial || `RUC ${n.ruc}`;
const perfilDe = (p) => (/^creador-[0-9a-f]{32}$/.test(p.influencer.id) ? `/influencers/perfil/${p.influencer.id}/` : `/influencers/${p.influencer.id}/`);
const wa = (texto) => `https://wa.me/${WHATSAPP_TATO}?text=${encodeURIComponent(texto)}`;

const MENSAJES = {
  sesion: 'Tu sesión se cerró. Vuelve a entrar.',
  origen: 'No pudimos confirmar que el envío venga de tato.pe. Recarga la página.',
  salir: 'Cerraste tu sesión.',
};

/** Lo que tiene que pagar el negocio ahora, o null. */
export function pagoPendiente(p) {
  const c = cuentas(p.dinero);
  if (!c) return null;
  for (const parte of ['adelanto', 'saldo']) {
    if (p.estado === parte && !p.pagos?.[parte]) return { parte, monto: p.links?.[parte]?.monto ?? c[parte], link: p.links?.[parte]?.link || '' };
  }
  return null;
}

/** En qué va el pedido, en una frase para el negocio. */
export function situacionNegocio(p) {
  const inf = p.influencer.nombre;
  const pago = pagoPendiente(p);
  switch (p.estado) {
    case 'solicitud': return p.dinero.precio == null ? 'Tato está cotizando tu pedido. Te escribimos por WhatsApp con el precio.' : `Esperamos que ${inf} acepte tu solicitud.`;
    case 'adelanto': return pago?.link ? 'Te toca: paga el adelanto de producción para empezar.' : 'Te toca: falta el adelanto. Te escribimos por WhatsApp con el link para pagarlo.';
    case 'guion': return `Tato está escribiendo el guion. ${inf} lo revisa antes de producir.`;
    case 'video': return `Tato está produciendo tu video. ${inf} lo revisa antes de entregarlo.`;
    case 'saldo': return pago?.link ? 'Te toca: tu video está listo. Paga el saldo para recibirlo.' : 'Tu video está listo. Te escribimos por WhatsApp con el link para pagar el saldo.';
    case 'entrega': return 'Recibimos tu pago. Tato te entrega el video final.';
    case 'entregado': return `Entregado el ${fecha(p.entregado || p.actualizado)}.`;
    case 'rechazado': return `${inf} no pudo tomar este pedido. No se cobró nada.`;
    case 'cancelado': return `Este pedido se canceló.${p.motivo ? ` Motivo: ${p.motivo}` : ''}`;
    default: return '';
  }
}

/** Los momentos del pedido que le importan al negocio, del más antiguo al más nuevo. */
function hitos(p) {
  const inf = p.influencer.nombre;
  const acepto = (p.historial || []).find((h) => h.que === 'Aceptó el pedido.');
  return [
    [p.creado, 'Enviaste la solicitud'],
    [acepto?.fecha, `${inf} aceptó el pedido`],
    [p.pagos?.adelanto?.fecha, `Pagaste el adelanto (${soles(p.pagos?.adelanto?.monto)})`],
    [p.guion?.aprobado, `${inf} aprobó el guion`],
    [p.video?.aprobado, `${inf} aprobó el video`],
    [p.pagos?.saldo?.fecha, `Pagaste el saldo (${soles(p.pagos?.saldo?.monto)})`],
    [p.entregado, 'Tato entregó el video final'],
    [p.estado === 'rechazado' || p.estado === 'cancelado' ? p.actualizado : null, p.estado === 'rechazado' ? `${inf} no tomó el pedido` : 'El pedido se canceló'],
  ].filter(([f]) => f).sort(([a], [b]) => String(a).localeCompare(String(b)));
}

function botonPago(p) {
  const pago = pagoPendiente(p);
  if (!pago) return '';
  return pago.link
    ? `<a class="btn fucsia" href="${esc(pago.link)}" target="_blank" rel="noopener">Pagar el ${pago.parte} · ${soles(pago.monto)}</a>`
    : `<a class="btn linea" href="${esc(wa(`Hola Tato, quiero pagar el ${pago.parte} del pedido ${p.id}.`))}" target="_blank" rel="noopener">Pedir el link por WhatsApp</a>`;
}

function tarjeta(p) {
  const toca = Boolean(pagoPendiente(p));
  return `<li><a class="ped${toca ? ' toca' : ''}" href="/negocio/pedido/${esc(p.id)}/">
  <span class="chip${toca ? ' toca' : p.estado === 'entregado' ? ' ok' : ''}">${esc(toca ? 'Te toca pagar' : ESTADOS[p.estado])}</span>
  <b>Video con ${esc(p.influencer.nombre)}</b>
  <span>${esc(situacionNegocio(p))}</span>
  <span class="meta">${esc(p.id)} · ${esc(p.paquete.nombre)} · ${p.dinero.precio == null ? 'por cotizar' : soles(p.dinero.precio)}</span>
</a></li>`;
}

function tarjetaNegocio(n) {
  const estado = {
    verde: 'Puedes pedir videos a cualquier influencer del catálogo con tu RUC y este código.',
    amarillo: 'Estamos revisando tu registro. Te escribimos por WhatsApp.',
    rojo: 'Por ahora no podemos tomar pedidos de este negocio.',
    pausado: 'Tu registro está en pausa. Te escribimos por WhatsApp para ver cómo seguir.',
  }[n.semaforo] || '';
  const s = n.sunat || {};
  return `<div class="caja negocio-ficha">
  <span class="chip${n.semaforo === 'verde' ? ' ok' : n.semaforo === 'amarillo' ? ' toca' : ''}">${esc(ETIQUETA[n.semaforo] || n.semaforo)}</span>
  <h3>${esc(nombreDe(n))}</h3>
  <p class="nota mono">RUC ${esc(n.ruc)}${s.estado ? ` · SUNAT: ${esc([s.estado, s.condicion].filter(Boolean).join(' y ').toLowerCase())}` : ''}</p>
  ${n.semaforo === 'verde' && n.codigo ? `<p class="codigo-negocio"><span>Tu código</span><b class="mono">${esc(n.codigo)}</b></p>` : ''}
  <p>${esc(estado)}</p>
</div>`;
}

// ---------- Páginas ----------

function paginaEntrar({ paso = 'correo', correo = '', desafio = '', error = '', aviso = '', listo = true }) {
  const form = !listo
    ? '<p class="aviso ojo">El ingreso con código por correo todavía no está disponible. Escríbenos por WhatsApp para saber de tu pedido.</p>'
    : paso === 'codigo'
      ? `<form class="caja" method="post" action="/negocio/entrar">
  <input type="hidden" name="paso" value="codigo"><input type="hidden" name="correo" value="${esc(correo)}"><input type="hidden" name="desafio" value="${esc(desafio)}">
  <p>Si <b>${esc(correoOculto(correo))}</b> está registrado, le llegó un código de 6 números. Vence en 15 minutos.</p>
  <label for="codigo">Código</label>
  <input id="codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
  <div class="acciones"><button class="btn fucsia" type="submit">Entrar</button><a class="btn linea" href="/negocio/">Usar otro correo</a></div>
</form>`
      : `<form class="caja" method="post" action="/negocio/entrar">
  <input type="hidden" name="paso" value="correo">
  <label for="correo">El correo con el que registraste tu negocio</label>
  <input id="correo" name="correo" type="email" autocomplete="email" required maxlength="160" value="${esc(correo)}">
  <p class="nota">Te mandamos un código. No necesitas contraseña.</p>
  <div class="acciones"><button class="btn fucsia" type="submit">Mandarme el código</button></div>
</form>`;
  return pagina({
    titulo: 'Portal de negocios',
    error,
    aviso,
    inicio: '/negocio/',
    cuerpo: `<h1>Tu <span class="fx">negocio</span> en Tato Studio</h1>
<p class="sub">Sigue tus pedidos de videos con influencers, paga cada parte y mira en qué va cada video.</p>
${form}
<p class="nota">¿Registraste tu negocio sin correo o con otro? <a href="/influencers/registro/">Vuelve a registrarlo</a> con el mismo RUC y DNI, y confirma tu correo.</p>
<p class="nota">¿Todavía no lo registras? <a href="/influencers/registro/">Registra tu negocio</a> con tu RUC.</p>
<p class="nota">¿Eres creador? Tu cuenta está en <a href="/cuenta/">tato.pe/cuenta</a>.</p>`,
  });
}

/** Inicio del portal. `vista` la usa el panel de Tato para ver lo que ve el negocio. */
export async function paginaInicioNegocio(env, { correo, negocios }, { aviso = '', error = '', vista = null } = {}) {
  const rucs = negocios.map((n) => n.ruc);
  const pedidos = await listarPedidos(env, (k) => rucs.includes(k.metadata?.ruc), 300);
  const toca = pedidos.filter((p) => pagoPendiente(p));
  const curso = pedidos.filter((p) => ACTIVOS.includes(p.estado) && !pagoPendiente(p));
  const fin = pedidos.filter((p) => !ACTIVOS.includes(p.estado)).slice(0, 30);
  const pagado = pedidos.reduce((s, p) => s + Number(p.pagos?.adelanto?.monto || 0) + Number(p.pagos?.saldo?.monto || 0), 0);
  const porPagar = toca.reduce((s, p) => s + Number(pagoPendiente(p).monto || 0), 0);
  const contacto = negocios[0]?.contacto?.nombre || '';
  const verificado = negocios.some((n) => n.semaforo === 'verde');
  const verde = negocios.find((n) => n.semaforo === 'verde' && n.codigo);
  const recordar = verde ? { codigo: verde.codigo, ruc: verde.ruc, razonSocial: verde.sunat?.razonSocial || '' } : null;
  const lista = (items, vacio) => (items.length ? `<ul class="lista">${items.map(tarjeta).join('')}</ul>` : `<p class="vacio">${vacio}</p>`);
  return pagina({
    titulo: 'Tu negocio',
    cuenta: { nombre: contacto || correo },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    ancho: true,
    aviso,
    error,
    vista,
    cuerpo: `<section class="estudio-hero"><p class="mono">PORTAL DE NEGOCIOS</p>
<h1>Hola${contacto ? `, <span>${esc(contacto.split(' ')[0])}</span>` : ''}</h1>
<p>${toca.length ? `Tienes ${toca.length === 1 ? 'un pago pendiente' : `${toca.length} pagos pendientes`}.` : 'Aquí sigues tus videos con influencers.'}</p>
<div class="acciones">${verificado ? '<a class="btn fucsia chico" href="/influencers/">Pedir un video</a>' : ''}<a class="btn linea chico" href="/influencers/registro/">Registrar otro negocio</a></div>
</section>
<div class="estudio-kpi">
  <div><span>En curso</span><b>${toca.length + curso.length}</b></div>
  <div><span>Por pagar</span><b>${soles(porPagar)}</b></div>
  <div><span>Entregados</span><b>${pedidos.filter((p) => p.estado === 'entregado').length}</b></div>
  <div><span>Pagado en total</span><b>${soles(pagado)}</b></div>
</div>
${toca.length ? `<section class="estudio-seccion"><h2>Te toca pagar</h2><ul class="lista">${toca.map((p) => `<li class="caja toca pago-pendiente"><div><b>${esc(p.id)} · Video con ${esc(p.influencer.nombre)}</b><p>${esc(situacionNegocio(p))}</p></div><div class="acciones">${botonPago(p)}<a class="btn linea chico" href="/negocio/pedido/${esc(p.id)}/">Ver el pedido</a></div></li>`).join('')}</ul></section>` : ''}
<section class="estudio-seccion"><h2>Pedidos en curso</h2>${lista(curso, verificado ? 'No tienes otros pedidos en curso. Elige un influencer del catálogo para pedir un video.' : 'Cuando tu negocio esté verificado, pides videos desde el catálogo.')}</section>
${fin.length ? `<section class="estudio-seccion"><h2>Historial</h2>${lista(fin, '')}</section>` : ''}
<section class="estudio-seccion"><h2>${negocios.length === 1 ? 'Tu negocio' : 'Tus negocios'}</h2><div class="estudio-doble">${negocios.map(tarjetaNegocio).join('')}</div>
<p class="nota">Entras con ${esc(correo)}. ¿Algún dato cambió? <a href="${esc(wa('Hola Tato, quiero actualizar los datos de mi negocio.'))}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p></section>
${recordar && !vista ? `<script>try{localStorage.setItem('tato-negocio',${JSON.stringify(JSON.stringify(recordar)).replace(/</g, '\\u003c')})}catch(e){}</script>` : ''}`,
  });
}

export async function paginaPedidoNegocio(env, sesion, p, { vista = null } = {}) {
  const c = cuentas(p.dinero);
  const idx = (estado) => (estado === 'entrega' ? 5 : PASOS.findIndex(([k]) => k === estado));
  const actual = idx(p.estado);
  const pasos = ACTIVOS.includes(p.estado) || p.estado === 'entregado'
    ? `<ol class="pasos" aria-label="Pasos del pedido">${PASOS.map(([, nombre], i) => `<li class="${i < actual || p.estado === 'entregado' ? 'hecho' : i === actual ? 'ahora' : ''}"${i === actual && p.estado !== 'entregado' ? ' aria-current="step"' : ''}>${esc(nombre)}</li>`).join('')}</ol>`
    : '';
  const pago = pagoPendiente(p);
  const publicaciones = p.estado === 'entregado' ? await listarPublicaciones(env, p.influencer.id, p.id) : [];
  const filaPago = (parte) => {
    const pagadoParte = p.pagos?.[parte];
    return `<tr><td>${parte === 'adelanto' ? 'Adelanto de producción' : 'Saldo'}</td><td class="n">${soles(c[parte])}</td><td>${pagadoParte ? `Pagado el ${esc(fecha(pagadoParte.fecha))}` : pago?.parte === parte ? '<b>Por pagar</b>' : 'Más adelante'}</td></tr>`;
  };
  const plata = !c
    ? '<p>El precio todavía no está definido: Tato te lo cotiza por WhatsApp.</p>'
    : `<table class="pagos"><tbody>${c.adelanto > 0 ? filaPago('adelanto') : ''}${c.saldo > 0 ? filaPago('saldo') : ''}<tr class="tuyo"><td>Precio del video</td><td class="n">${soles(c.precio)}</td><td></td></tr></tbody></table>
<p class="nota">El adelanto cubre la producción (créditos de IA y edición). El saldo se paga cuando ${esc(p.influencer.nombre)} aprueba el video.</p>`;
  return pagina({
    titulo: `Pedido ${p.id}`,
    cuenta: { nombre: p.negocio.contacto?.nombre || sesion.correo },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    vista,
    cuerpo: `<a class="volver" href="/negocio/">← Tus pedidos</a>
<h1>Video con ${esc(p.influencer.nombre)}</h1>
<p class="sub mono">${esc(p.id)} · ${esc(p.paquete.nombre)} · ${esc(ESTADOS[p.estado])}</p>
${pasos}
<div class="caja${pago ? ' toca' : ''}"><h3>${esc(situacionNegocio(p))}</h3>${pago ? `<div class="acciones">${botonPago(p)}</div>${pago.link ? '<p class="nota">Pagas con Mercado Pago, con los medios que te ofrezca al abrir el link. Cuando se confirma, el pedido avanza solo.</p>' : ''}` : ''}</div>
<h2>Lo que pediste</h2>
<div class="caja"><dl class="datos">
  <dt>Promocionar</dt><dd>${esc(p.brief.promociona)}</dd>
  ${p.brief.detalle ? `<dt>Detalles</dt><dd>${multilinea(p.brief.detalle)}</dd>` : ''}
  ${p.brief.fecha ? `<dt>Para cuándo</dt><dd>${esc(fechaDia(p.brief.fecha))}</dd>` : ''}
  <dt>Influencer</dt><dd><a href="${esc(perfilDe(p))}">${esc(p.influencer.nombre)}</a></dd>
  <dt>Paquete</dt><dd>${esc(p.paquete.nombre)}</dd>
  <dt>Entrega</dt><dd>${esc(p.paquete.entrega)}</dd>
  <dt>Uso del video</dt><dd>${esc(p.paquete.uso)}</dd>
  <dt>Negocio</dt><dd>${esc(p.negocio.nombreComercial || p.negocio.razonSocial)} · RUC <span class="mono">${esc(p.negocio.ruc)}</span></dd>
</dl></div>
${p.guion?.estado === 'aprobado' ? `<details class="caja"><summary>Guion aprobado</summary><div class="guion">${esc(p.guion.texto)}</div></details>` : ''}
<h2>Pagos</h2>
<div class="caja">${plata}</div>
${publicaciones.length ? `<h2>Dónde se publicó</h2><ul class="lista">${publicaciones.map((x) => `<li class="caja"><span class="chip">${esc(x.red)}</span> <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.cuenta)} ↗</a> <span class="nota">${esc(x.fecha)}</span>
<p class="nota">${METRICAS.map(([k, n]) => (x.metricas[k] == null ? '' : `${esc(n)}: ${new Intl.NumberFormat('es-PE').format(x.metricas[k])}`)).filter(Boolean).join(' · ')}</p></li>`).join('')}</ul>` : ''}
<h2>Cómo va</h2>
<div class="caja"><ol class="hitos">${hitos(p).map(([f, t]) => `<li><span class="nota">${esc(fecha(f, true))}</span> ${esc(t)}</li>`).join('')}</ol></div>
<p class="nota">¿Dudas sobre este pedido? <a href="${esc(wa(`Hola Tato, te escribo por el pedido ${p.id}.`))}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>`,
  });
}

// ---------- Rutas ----------

export async function handleNegocio(request, env, url, path) {
  const post = request.method === 'POST';
  if (post && !mismoOrigen(request)) return ir('/negocio/?e=origen');
  const listo = configCorreo(env).listo;

  if (path === '/negocio/salir' && post) return ir('/negocio/?m=salir', await cerrarSesionNegocio(env, request));
  if (path === '/negocio/entrar') {
    if (!post) return ir('/negocio/');
    if (!listo) return respuesta(paginaEntrar({ listo }), 503);
    const f = await request.formData();
    const correo = correoValido(f.get('correo'));
    if (f.get('paso') === 'codigo') {
      const desafio = String(f.get('desafio') || '');
      const r = await comprobarCodigoCorreo(env, { desafio, codigo: f.get('codigo'), correo, proposito: 'entrar-negocio', titular: `negocio:${correo}` });
      if (r.error) return respuesta(paginaEntrar({ paso: 'codigo', correo, desafio, error: r.error }), 400);
      if (!(await negociosDeCorreo(env, correo)).length) return respuesta(paginaEntrar({ correo, error: 'Ese correo no tiene un negocio registrado.' }), 404);
      return ir('/negocio/', await crearSesionNegocio(env, request, correo));
    }
    if (!correo) return respuesta(paginaEntrar({ error: 'Revisa tu correo: parece que le falta algo.' }), 400);
    const tiene = (await negociosDeCorreo(env, correo)).length > 0;
    const r = await pedirCodigo(env, request, { correo, proposito: 'entrar-negocio', titular: `negocio:${correo}`, enviar: tiene });
    if (r.error) return respuesta(paginaEntrar({ correo, error: r.error }), r.status || 400);
    return respuesta(paginaEntrar({ paso: 'codigo', correo, desafio: r.desafio }));
  }

  const sesion = await leerSesionNegocio(env, request);
  const negocios = sesion ? await negociosDeCorreo(env, sesion.correo) : [];

  if (!sesion || !negocios.length) {
    if (path !== '/negocio') return ir('/negocio/?e=sesion', sesion ? await cerrarSesionNegocio(env, request) : undefined);
    return respuesta(paginaEntrar({ listo, error: MENSAJES[url.searchParams.get('e')] || '', aviso: MENSAJES[url.searchParams.get('m')] || '' }));
  }

  if (path === '/negocio' && !post) return respuesta(await paginaInicioNegocio(env, { correo: sesion.correo, negocios }));

  const m = path.match(/^\/negocio\/pedido\/(P-[A-Z2-9]{6})$/);
  if (m && !post) {
    if ((await contar(env, `negocio-ver:${sesion.token.slice(0, 16)}`, 60)) > 120) return new Response('Espera un momento.', { status: 429 });
    const p = await leerPedido(env, m[1]);
    if (!p || !negocios.some((n) => n.ruc === p.negocio.ruc)) {
      return respuesta(pagina({ titulo: 'No encontrado', cuenta: { nombre: sesion.correo }, salir: '/negocio/salir', inicio: '/negocio/', cuerpo: '<h1>No encontramos ese pedido</h1><p><a class="volver" href="/negocio/">← Tus pedidos</a></p>' }), 404);
    }
    return respuesta(await paginaPedidoNegocio(env, sesion, p));
  }
  return respuesta(pagina({ titulo: 'No encontrado', cuenta: { nombre: sesion.correo }, salir: '/negocio/salir', inicio: '/negocio/', cuerpo: '<h1>Esta página no existe</h1><p><a class="volver" href="/negocio/">← Tus pedidos</a></p>' }), 404);
}
