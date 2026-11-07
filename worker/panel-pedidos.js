// Panel de Tato para los pedidos con influencers:
//   /panel/pedidos/       todos los pedidos, con lo que toca hacer en cada uno
//   /panel/influencers/   cuentas de los influencers: crearlas, clave temporal, porcentaje y costos
//   /panel/ajustes/       porcentaje por defecto, comisión de Mercado Pago y producción por defecto
// Usa el mismo acceso que el resto del panel (usuario «tato» + PANEL_PASSWORD).

import { page, html, esc } from './ui.js';
import { SCRIPT_CLAVE, formatoClave, cifrarClave, cerrarSesionesDe, aleatorio } from './seguridad.js';
import { configCorreo, correoValido } from './correo.js';
import {
  leerPedido, listarPedidos, metasPedidos, accionTato, cuentasDe, cuentas, metodoSaldo, ajustes, guardarAjustes,
  catalogo, leerCuenta, guardarCuenta, idValido, ESTADOS, ACTIVOS, turno, soles, r2, identidadDe, correoDe, idPorCorreo,
} from './pedidos.js';
import { mpListo, REDIRECCION } from './mercadopago.js';
import { servirArchivo } from './medios.js';
import { FOTOS, ITEMS, NOMBRES, decidirIdentidad } from './identidad.js';
import { telefonoConfirmado } from './verificacion.js';
import { avisar } from './avisos.js';
import { duracion } from './orden.js';
import { verStorytelling, CSS_STORY } from './storytelling.js';
import { fotosOrden } from './portal-negocio.js';

const fecha = (s) => (s ? new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : '');
const wa = (numero, textoMsj) => `https://wa.me/51${String(numero || '').replace(/\D/g, '').slice(-9)}?text=${encodeURIComponent(textoMsj)}`;
const nombreNegocio = (p) => p.negocio.nombreComercial || p.negocio.razonSocial || `RUC ${p.negocio.ruc}`;
const origenOk = (request, url) => {
  const o = request.headers.get('Origin');
  return !o || o === url.origin;
};
const volver = (url, ruta, params) => Response.redirect(`${url.origin}${ruta}?${new URLSearchParams(params)}`, 303);

function form(p, accion, campos, boton, clase = 'ok') {
  return `<form method="post" action="/panel/pedidos/accion" class="acciones"><input type="hidden" name="pedido" value="${esc(p.id)}"><input type="hidden" name="accion" value="${accion}">${campos}<button class="${clase}">${boton}</button></form>`;
}

function tablaCuentas(c, p) {
  if (!c) return '<p class="muted">Precio por cotizar.</p>';
  const filas = [
    ['Precio', soles(c.precio)],
    ['Adelanto (producción, para ti)', soles(c.adelanto)],
    ['Saldo', soles(c.saldo)],
    ...(c.comisionMP ? [[`Comisión de Mercado Pago${c.real ? '' : ` (aprox. ${c.tasaMP} %)`}`, `− ${soles(c.comisionMP)}`]] : []),
    [`Tu parte del saldo (${p.dinero.porcentajeTato} %)`, soles(c.parteTato)],
    [`Parte de ${p.influencer.nombre} (${100 - p.dinero.porcentajeTato} %)`, soles(c.parteInfluencer)],
    ['Total para ti', soles(r2(c.adelanto + c.parteTato))],
  ];
  return `<table class="plata">${filas.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
<p class="muted">${c.real ? 'Cifras reales del pago.' : c.metodo === 'mercadopago' ? 'El saldo se cobra con el Mercado Pago del influencer y se divide solo.' : 'Cobro a mano: tú le pagas al influencer su parte.'}</p>`;
}

function linkPago(p, parte, cuentaInf) {
  const l = p.links?.[parte];
  if (!l) return '';
  if (l.error) return `<p class="err">No se pudo crear el link del ${parte}: ${esc(l.error)}</p>`;
  return `<p>Link del ${parte} (${soles(l.monto)}${l.comision ? `, tu parte ${soles(l.comision)}` : ''}): <a href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.link)}</a>${parte === 'saldo' && cuentaInf?.mp?.nombre ? ` · se cobra en la cuenta de ${esc(cuentaInf.mp.nombre)}` : ''}</p>`;
}

function bloquePedido(env, p, aj, cuentaInf, abierto) {
  const metodo = metodoSaldo(env, cuentaInf);
  const c = cuentasDe(p, { metodo, tasaMP: aj.tasaMP });
  const n = p.negocio;
  const contacto = n.contacto?.nombre?.split(' ')[0] || '';
  const t = turno(p);
  const acciones = [];
  const mensajes = [];
  const negocioWa = (msj) => mensajes.push(`<a href="${esc(wa(n.contacto?.whatsapp, msj))}" target="_blank" rel="noopener">WhatsApp al negocio</a>`);
  const influencerWa = (msj) => cuentaInf?.whatsapp && mensajes.push(`<a href="${esc(wa(cuentaInf.whatsapp, msj))}" target="_blank" rel="noopener">WhatsApp a ${esc(p.influencer.nombre)}</a>`);

  switch (p.estado) {
    case 'solicitud':
      acciones.push(form(p, 'precio', `<input name="precio" inputmode="decimal" placeholder="Precio S/" value="${p.dinero.precio ?? ''}" required><input name="produccion" inputmode="decimal" placeholder="Producción S/" value="${p.dinero.produccion ?? 0}">`, p.dinero.precio == null ? 'Poner precio' : 'Cambiar precio', 'pausa'));
      if (p.dinero.precio == null) negocioWa(`Hola ${contacto}, recibimos tu pedido ${p.id} con ${p.influencer.nombre}. Te cuento el precio: `);
      else influencerWa(`Hola ${p.influencer.nombre.split(' ')[0]}, tienes una solicitud nueva de ${nombreNegocio(p)} (pedido ${p.id}). Revísala en tato.pe/cuenta`);
      break;
    case 'adelanto':
      acciones.push(linkPago(p, 'adelanto'));
      if (mpListo(env)) acciones.push(form(p, 'link', '<input type="hidden" name="parte" value="adelanto">', p.links?.adelanto?.link ? 'Volver a crear el link' : 'Crear link de Mercado Pago', 'pausa'));
      acciones.push(form(p, 'pagado', `<input type="hidden" name="parte" value="adelanto"><input name="monto" inputmode="decimal" placeholder="Monto S/" value="${c?.adelanto ?? ''}"><input name="operacion" placeholder="N.º de operación (Yape, Plin, transferencia)" required>`, 'Marcar adelanto pagado'));
      acciones.push(form(p, 'precio', `<input name="precio" inputmode="decimal" value="${p.dinero.precio ?? ''}" required><input name="produccion" inputmode="decimal" value="${p.dinero.produccion ?? 0}">`, 'Cambiar precio', 'pausa'));
      negocioWa(`Hola ${contacto}, ${p.influencer.nombre} aceptó tu pedido ${p.id}. Para empezar, paga el adelanto de producción de ${soles(c?.adelanto)}${p.links?.adelanto?.link ? `: ${p.links.adelanto.link}` : '. Te paso los datos para el pago.'}`);
      break;
    case 'guion':
    case 'video': {
      const que = p.estado;
      const item = p[que];
      if (item?.estado === 'cambios') acciones.push(`<p class="err">${esc(p.influencer.nombre)} pidió cambios: ${esc(item.comentario)}</p>`);
      if (item?.estado === 'pendiente') {
        acciones.push(`<p class="notice">Esperando que ${esc(p.influencer.nombre)} apruebe el ${que} (versión ${item.version}).</p>`);
        influencerWa(`Hola ${p.influencer.nombre.split(' ')[0]}, te mandé el ${que} del pedido ${p.id} (${nombreNegocio(p)}). Revísalo en tato.pe/cuenta`);
      }
      const pide = item?.pideActuacion || {};
      const campo = que === 'guion'
        ? `<textarea name="texto" required minlength="20" maxlength="6000" placeholder="Guion completo">${esc(item?.texto || '')}</textarea>
          <label class="muted"><input type="checkbox" name="actuar_audio" value="1"${pide.audio ? ' checked' : ''}> Pedir que lo actúe en audio</label>
          <label class="muted"><input type="checkbox" name="actuar_video" value="1"${pide.video ? ' checked' : ''}> Pedir que lo actúe en video</label>`
        : `<input name="link" type="url" required placeholder="Link privado del video (Drive, WeTransfer…)" value="${esc(item?.link || '')}">`;
      acciones.push(form(p, que, campo, item?.estado === 'pendiente' ? `Corregir y volver a mandar el ${que}` : `Mandar ${que} a ${p.influencer.nombre}`));
      break;
    }
    case 'saldo':
      acciones.push(linkPago(p, 'saldo', cuentaInf));
      if (metodo === 'mercadopago') acciones.push(form(p, 'link', '<input type="hidden" name="parte" value="saldo">', p.links?.saldo?.link ? 'Volver a crear el link' : 'Crear link de Mercado Pago', 'pausa'));
      acciones.push(form(p, 'pagado', `<input type="hidden" name="parte" value="saldo"><input name="monto" inputmode="decimal" placeholder="Monto S/" value="${c?.saldo ?? ''}"><input name="operacion" placeholder="N.º de operación" required>`, 'Marcar saldo pagado a mano'));
      negocioWa(`Hola ${contacto}, tu video con ${p.influencer.nombre} ya está aprobado. Para recibirlo, paga el saldo de ${soles(c?.saldo)}${p.links?.saldo?.link ? `: ${p.links.saldo.link}` : '. Te paso los datos para el pago.'}`);
      break;
    case 'entrega':
      acciones.push(form(p, 'entregar', '', 'Marcar como entregado'));
      negocioWa(`Hola ${contacto}, aquí tienes tu video con ${p.influencer.nombre} (pedido ${p.id}): `);
      break;
    case 'rechazado':
      negocioWa(`Hola ${contacto}, ${p.influencer.nombre} no puede tomar tu pedido ${p.id}. ¿Te muestro otros influencers?`);
      break;
    default:
  }
  if (p.pagos?.saldo?.metodo === 'manual' && !p.pagoInfluencer) {
    acciones.push(form(p, 'pago-influencer', `<input name="monto" inputmode="decimal" value="${c?.parteInfluencer ?? ''}"><input name="operacion" placeholder="N.º de operación" required>`, `Registrar pago a ${p.influencer.nombre}`));
  }
  if (ACTIVOS.includes(p.estado)) {
    acciones.push(`<details><summary class="muted">Cancelar el pedido</summary>${form(p, 'cancelar', '<input name="motivo" placeholder="Motivo (lo ve el influencer)">', 'Cancelar pedido', 'no')}</details>`);
  }

  const pagos = ['adelanto', 'saldo'].filter((k) => p.pagos?.[k]).map((k) => {
    const x = p.pagos[k];
    return `${k}: ${soles(x.monto)} · ${x.metodo === 'mercadopago' ? `Mercado Pago ${esc(x.id)}` : `a mano, op. ${esc(x.operacion)}`} · ${esc(fecha(x.fecha))}`;
  });
  if (p.pagoInfluencer) pagos.push(`a ${esc(p.influencer.nombre)}: ${soles(p.pagoInfluencer.monto)} · op. ${esc(p.pagoInfluencer.operacion)} · ${esc(fecha(p.pagoInfluencer.fecha))}`);

  return `<details class="reg" id="${esc(p.id)}"${abierto ? ' open' : ''}>
  <summary><span class="badge b-${t === 'tato' ? 'amarillo' : p.estado === 'entregado' ? 'verde' : ['rechazado', 'cancelado'].includes(p.estado) ? 'pausado' : 'gris'}">${esc(t === 'tato' ? 'Te toca' : ESTADOS[p.estado])}</span>
    <b>${esc(p.id)}</b> ${esc(nombreNegocio(p))} → ${esc(p.influencer.nombre)}
    <span class="muted">${esc(p.paquete.nombre)} · ${c ? soles(c.precio) : 'a cotizar'} · ${esc(fecha(p.actualizado))}</span></summary>
  <div class="cuerpo">
    ${p.alertas?.length ? `<p class="err">Menciona ${esc(p.alertas.join(', '))}: revísalo.</p>` : ''}
    <p><b>${esc(ESTADOS[p.estado])}.</b> ${t === 'influencer' ? `Le toca a ${esc(p.influencer.nombre)}.` : t === 'negocio' ? 'Le toca al negocio (pagar).' : ''}</p>
    ${acciones.join('')}
    ${mensajes.length ? `<p>${mensajes.join(' · ')}</p>` : ''}
    <dl>
      <dt>Promocionar</dt><dd>${esc(p.brief.promociona)}</dd>
      ${p.brief.segundos ? `<dt>Duración</dt><dd>${esc(duracion({ segundos: p.brief.segundos, videos: p.brief.videos || 1 }))}</dd>` : ''}
      ${p.brief.detalle ? `<dt>${p.brief.tipo === 'guion' ? 'Su guion' : p.brief.orden ? 'Su idea' : 'Detalles'}</dt><dd>${esc(p.brief.detalle).replace(/\n/g, '<br>')}</dd>` : ''}
      ${p.brief.accion ? `<dt>Qué hace el influencer</dt><dd>${esc(p.brief.accion).replace(/\n/g, '<br>')}</dd>` : ''}
      ${p.brief.fecha ? `<dt>Para cuándo</dt><dd>${esc(p.brief.fecha)}</dd>` : ''}
      ${p.brief.aceptaIA ? `<dt>Aceptó</dt><dd>${esc(p.brief.aceptaIA.texto)} (${esc(fecha(p.brief.aceptaIA.fecha))})</dd>` : ''}
      <dt>Negocio</dt><dd><a href="/panel/negocio/?ruc=${esc(n.ruc)}">${esc(n.razonSocial || n.nombreComercial)}</a> · RUC ${esc(n.ruc)} · código ${esc(n.codigo)}</dd>
      <dt>Contacto</dt><dd>${esc(n.contacto?.nombre)} · ${esc(n.contacto?.whatsapp)}${n.contacto?.correo ? ` · ${esc(n.contacto.correo)}` : ''}</dd>
      <dt>Creador</dt><dd><a href="/panel/creador/?id=${esc(p.influencer.id)}">${esc(p.influencer.nombre)}</a></dd>
      ${p.guion?.texto ? `<dt>Guion v${p.guion.version}</dt><dd>${esc(p.guion.estado)}</dd>` : ''}
      ${Object.keys(p.actuaciones || {}).length ? `<dt>Actuación</dt><dd>${['audio', 'video'].filter((t) => p.actuaciones[t]).map((t) => `<a href="/panel/archivo?clave=${encodeURIComponent(p.actuaciones[t].clave)}" target="_blank" rel="noopener">${t}</a> (${esc(fecha(p.actuaciones[t].subido))}) · <a href="/panel/archivo?clave=${encodeURIComponent(p.actuaciones[t].clave)}&descargar=1">descargar</a>`).join('<br>')}</dd>` : ''}
      ${p.video?.link ? `<dt>Video v${p.video.version}</dt><dd><a href="${esc(p.video.link)}" target="_blank" rel="noopener">${esc(p.video.estado)}</a></dd>` : ''}
      ${pagos.length ? `<dt>Pagos</dt><dd>${pagos.join('<br>')}</dd>` : ''}
      ${p.motivo ? `<dt>Motivo</dt><dd>${esc(p.motivo)}</dd>` : ''}
    </dl>
    ${p.brief.storytelling ? `<details open><summary><b>Storytelling aprobado por el negocio</b>${p.brief.versiones > 1 ? ` (después de ${p.brief.versiones} versiones)` : ''}</summary><style>${CSS_STORY}</style>${verStorytelling(p.brief.storytelling)}</details>` : p.brief.orden ? '<p class="muted">Orden sin storytelling de IA: ármalo con el negocio.</p>' : ''}
    ${fotosOrden(p, (k) => `/panel/archivo?clave=${encodeURIComponent(k)}`)}
    ${tablaCuentas(c, p)}
    ${p.estado === 'entregado' ? `<p><a class="btn" href="/panel/publicaciones/?pedido=${esc(p.id)}">Ver y registrar publicaciones</a></p>` : ''}
    <details><summary class="muted">Historial</summary><ol class="muted">${(p.historial || []).map((h) => `<li>${esc(fecha(h.fecha))} · ${esc(h.quien)}: ${esc(h.que)}</li>`).join('')}</ol></details>
  </div>
</details>`;
}

const FILTROS = {
  tato: ['Te toca', (k) => k.metadata?.turno === 'tato'],
  influencer: ['Esperando al influencer', (k) => k.metadata?.turno === 'influencer'],
  negocio: ['Esperando pago', (k) => k.metadata?.turno === 'negocio'],
  activos: ['En curso', (k) => ACTIVOS.includes(k.metadata?.estado)],
  fin: ['Terminados', (k) => !ACTIVOS.includes(k.metadata?.estado)],
  todos: ['Todos', () => true],
};

export async function handlePanelPedidos(request, env, url) {
  const ver = FILTROS[url.searchParams.get('ver')] ? url.searchParams.get('ver') : 'tato';
  const abrir = url.searchParams.get('abrir') || '';
  const metas = await metasPedidos(env);
  const tabs = Object.entries(FILTROS).map(([k, [nombre, f]]) => `<a href="?ver=${k}"${k === ver ? ' aria-current="page"' : ''}>${nombre} (${metas.filter(f).length})</a>`).join('');
  const [pedidos, aj] = await Promise.all([listarPedidos(env, FILTROS[ver][1], 100), ajustes(env)]);
  const cuentasInf = new Map();
  for (const id of new Set(pedidos.map((p) => p.influencer.id))) cuentasInf.set(id, await leerCuenta(env, id));
  const avisos = [];
  if (url.searchParams.get('msg')) avisos.push(`<p class="notice">${esc(url.searchParams.get('msg'))}</p>`);
  if (url.searchParams.get('err')) avisos.push(`<p class="err">${esc(url.searchParams.get('err'))}</p>`);
  if (!mpListo(env)) avisos.push('<p class="muted">Mercado Pago no está configurado: los pagos se registran a mano. Ver <a href="/panel/ajustes/">Ajustes</a>.</p>');
  else if (aj.tasaMP == null) avisos.push('<p class="err">Falta la comisión de Mercado Pago en <a href="/panel/ajustes/">Ajustes</a>: sin ella no se crean los links del saldo.</p>');
  const filas = pedidos.map((p) => bloquePedido(env, p, aj, cuentasInf.get(p.influencer.id), p.id === abrir || pedidos.length === 1)).join('');
  return html(page('Pedidos', `${avisos.join('')}<div class="tabs">${tabs}</div>${filas || '<p class="muted">No hay pedidos aquí.</p>'}`));
}

export async function handlePanelPedidoAccion(request, env, url) {
  if (!origenOk(request, url)) return html(page('Pedidos', '<p class="err">Origen no permitido.</p>'), 403);
  const f = await request.formData();
  const p = await leerPedido(env, String(f.get('pedido') || ''));
  if (!p) return volver(url, '/panel/pedidos/', { err: 'No encontré ese pedido.' });
  const datos = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
  const r = await accionTato(env, p, datos.accion, datos);
  const ver = Object.entries(FILTROS).find(([, [, fil]]) => fil({ metadata: { turno: turno(p), estado: p.estado } }))?.[0] || 'todos';
  return volver(url, '/panel/pedidos/', { ver, abrir: p.id, ...(r.error ? { err: r.error } : { msg: r.mensaje }) });
}

// ---------- Cuentas de influencers ----------

function camposCuenta(inf, cuenta, aj) {
  const produccion = (inf?.paquetes || []).map((paq, i) => `<label class="muted">Producción de «${esc(paq.nombre)}» (S/)<input type="hidden" name="paq_${i}" value="${esc(paq.nombre)}">
    <input name="prod_${i}" inputmode="decimal" value="${cuenta?.produccion?.[paq.nombre] ?? aj.produccion ?? 0}"></label>
    <span class="muted">${paq.precio != null ? `precio ${soles(paq.precio)}` : 'a cotizar'}</span>`).join('');
  return `<label class="muted">WhatsApp<input name="whatsapp" inputmode="numeric" pattern="9[0-9]{8}" maxlength="9" placeholder="9 dígitos" value="${esc(cuenta?.whatsapp || '')}" required></label>
  <label class="muted">Tu porcentaje del saldo (%)<input name="porcentaje" inputmode="decimal" value="${cuenta?.porcentajeTato ?? aj.porcentajeTato}" required></label>
  ${produccion}`;
}

function camposClave(id, nombre, whatsapp) {
  return `<label class="muted">Contraseña temporal<input id="tmp-${esc(id)}" type="text" readonly data-hash="clave" data-falta="Genera la contraseña temporal primero." data-wa="${esc(whatsapp || '')}" data-nombre="${esc(nombre)}" data-cuenta="${esc(id)}" required placeholder="Genera una"></label>
  <input type="hidden" name="clave"><button type="button" class="pausa" data-generar="tmp-${esc(id)}">Generar</button>
  <a class="muted" data-wa-de="tmp-${esc(id)}" hidden target="_blank" rel="noopener">Mandársela por WhatsApp</a>
  <p class="err" data-aviso-clave hidden></p>`;
}

/** Fotos, voz, cuento leído y autorización del influencer, con los botones para aprobar o pedir que rehaga. */
export function bloqueIdentidad(cuenta, i, enFicha = false) {
  const id = cuenta.id;
  const archivo = (clave, descarga) => `/panel/archivo?clave=${encodeURIComponent(clave)}${descarga ? `&descargar=1` : ''}`;
  const fotos = FOTOS.map(([k, nombre]) => {
    const f = i.fotos[k];
    return `<figure class="miniatura">${f ? `<a href="${archivo(f.clave)}" target="_blank" rel="noopener"><img src="${archivo(f.clave)}" alt="${esc(nombre)}" loading="lazy"></a>` : '<span class="muted">sin foto</span>'}<figcaption>${esc(nombre)}${f ? ` · <a href="${archivo(f.clave, true)}">descargar</a>` : ''}</figcaption></figure>`;
  }).join('');
  const v = i.voz;
  const voz = v
    ? `<p><b>Voz</b> (${esc(String(v.segundos || '?'))} s, ${esc(fecha(v.subido))}) · <a href="${archivo(v.clave, true)}">descargar</a></p>
       <audio controls preload="none" src="${archivo(v.clave)}" style="width:100%;max-width:520px"></audio>
       ${v.cuento ? `<details><summary class="muted">Lo que leyó: «${esc(v.cuento.titulo)}» · código ${esc(v.cuento.codigo)}${v.cuento.porIA ? ' · escrito con IA' : ''}</summary><p class="muted">${esc(v.cuento.texto)}</p></details>` : ''}`
    : '<p class="muted">Sin grabación de voz.</p>';
  const consentimiento = i.consentimiento ? `<p class="muted">Autorizó el ${esc(fecha(i.consentimiento.fecha))} (versión ${esc(i.consentimiento.version)}${i.consentimiento.ip ? `, IP ${esc(i.consentimiento.ip)}` : ''}).</p>` : '';
  const acciones = ['en-revision', 'aprobada'].includes(i.estado)
    ? `<form method="post" action="/panel/influencers/accion" class="acciones cuenta"><input type="hidden" name="id" value="${esc(id)}">${enFicha ? '<input type="hidden" name="volver" value="ficha">' : ''}
        ${ITEMS.map((k) => `<label class="muted"><input type="checkbox" name="rehacer_${k}" value="1"> ${esc(NOMBRES[k])}</label>`).join('')}
        <input name="nota" maxlength="300" placeholder="Nota para el influencer (qué mejorar)">
        ${i.estado === 'en-revision' ? '<button class="ok" name="accion" value="identidad-aprobar">Aprobar identidad</button>' : ''}
        <button class="no" name="accion" value="identidad-rehacer">Pedir que rehaga lo marcado</button></form>`
    : '';
  const derivados = i.derivadosPorBorrar
    ? `<p class="err">Borró sus fotos y su voz${i.borrada ? ` el ${esc(fecha(i.borrada))}` : ''}: borra su hoja de personaje y su voz clonada en tus herramientas, y resuelve sus pedidos en curso.</p>
       <form method="post" action="/panel/influencers/accion" class="acciones"><input type="hidden" name="id" value="${esc(id)}"><button class="pausa" name="accion" value="identidad-derivados">Ya las borré</button></form>`
    : '';
  const estados = { incompleta: 'todavía no la completa', 'en-revision': 'te toca revisarla', aprobada: 'aprobada', rehacer: `rehaciendo: ${i.rehacer.map((k) => NOMBRES[k].toLowerCase()).join(', ')}`, borrada: 'la borró' };
  return `<div class="identidad"><h3>Identidad: ${esc(estados[i.estado] || i.estado)}</h3>${derivados}<div class="miniaturas">${fotos}</div>${voz}${consentimiento}${acciones}
    ${(i.historial || []).length ? `<details><summary class="muted">Historial de su identidad</summary><ol class="muted">${i.historial.map((h) => `<li>${esc(fecha(h.fecha))}: ${esc(h.que)}</li>`).join('')}</ol></details>` : ''}</div>`;
}

/**
 * Invitación por correo: un link de 7 días para que el creador elija su contraseña (/cuenta/invitacion/).
 * Usar el link prueba que el correo es suyo, así que queda verificado. Guarda la invitación en la cuenta
 * (no guarda la cuenta). Devuelve true si el correo salió.
 */
export async function mandarInvitacion(env, cuenta, correo) {
  const token = aleatorio(24);
  await env.PEDIDOS_KV.put(`invitacion:${token}`, JSON.stringify({ id: cuenta.id, correo }), { expirationTtl: 7 * 86400 });
  if (cuenta.invitacion?.token) await env.PEDIDOS_KV.delete(`invitacion:${cuenta.invitacion.token}`);
  cuenta.invitacion = { token, correo, enviada: new Date().toISOString() };
  return avisar(env, correo, {
    asunto: 'Tato Studio te invita a tu cuenta de creador',
    titulo: `Hola, ${cuenta.nombre.split(' ')[0]}: tu cuenta está lista`,
    parrafos: ['Elige tu contraseña con este link y entra a tu cuenta. Ahí ves las solicitudes de los negocios, apruebas cada guion y cada video, y ves tus pagos.', 'El link vence en 7 días. Desde ahora entras con este correo.'],
    ruta: `/cuenta/invitacion/?t=${token}`,
    boton: 'Elegir mi contraseña',
  });
}

/** Aprueba la identidad o pide que rehaga algo, y se lo avisa por correo al creador (si tiene correo verificado). */
export async function decidirYAvisar(env, cuenta, accion, opciones) {
  const r = await decidirIdentidad(env, cuenta.id, accion, opciones);
  if (r.error || !correoDe(cuenta)) return r;
  const nota = opciones.nota ? [`Nota de Tato: ${opciones.nota}`] : [];
  if (accion === 'aprobar') {
    await avisar(env, correoDe(cuenta), cuenta.alta
      ? { asunto: 'Tu perfil ya está en el catálogo', titulo: 'Tato aprobó tu registro', parrafos: ['Tu perfil ya sale en el catálogo de tato.pe y los negocios verificados pueden enviarte solicitudes.', ...nota], ruta: '/cuenta/', boton: 'Ir a mi cuenta' }
      : { asunto: 'Tato aprobó tus fotos y tu voz', titulo: 'Ya recibes solicitudes', parrafos: ['Tato aprobó tus fotos y tu voz. Desde ahora los negocios verificados pueden enviarte solicitudes.', ...nota], ruta: '/cuenta/', boton: 'Ir a mi cuenta' });
  } else if (accion === 'rehacer') {
    await avisar(env, correoDe(cuenta), {
      asunto: 'Tato te pide rehacer parte de tu registro', titulo: 'Falta un detalle en tu registro',
      parrafos: [`Rehaz: ${opciones.rehacer.map((k) => NOMBRES[k].toLowerCase()).join(', ')}.`, ...nota], ruta: '/cuenta/identidad/', boton: 'Rehacerlo ahora',
    });
  }
  return r;
}

/** /panel/archivo?clave=…: fotos, voz y actuaciones guardadas en R2 (solo con la contraseña del panel). */
export async function handlePanelArchivo(request, env, url) {
  const clave = url.searchParams.get('clave') || '';
  if (!/^(identidad|pedidos|negocios)\/[A-Za-z0-9-]+\/[A-Za-z0-9.-]+$/.test(clave)) return new Response('No encontrado', { status: 404 });
  const descarga = url.searchParams.get('descargar') === '1' ? clave.replace(/\//g, '-') : '';
  return servirArchivo(env, request, clave, { descarga });
}

export async function handlePanelInfluencers(request, env, url) {
  const [cat, aj] = await Promise.all([catalogo(env), ajustes(env)]);
  const conCorreo = configCorreo(env).listo;
  const cuentasKV = [];
  let cursor;
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: 'influencer:', cursor });
    cuentasKV.push(...lote.keys.map((k) => k.name.slice('influencer:'.length)));
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  const ids = [...new Set([...cat.map((i) => i.id), ...cuentasKV])];
  const avisos = [];
  if (url.searchParams.get('msg')) avisos.push(`<p class="notice">${esc(url.searchParams.get('msg'))}</p>`);
  if (url.searchParams.get('err')) avisos.push(`<p class="err">${esc(url.searchParams.get('err'))}</p>`);
  avisos.push(`<p class="muted">Por defecto: tu parte ${aj.porcentajeTato} % del saldo · comisión de Mercado Pago ${aj.tasaMP == null ? 'sin definir' : `${aj.tasaMP} %`} · producción ${soles(aj.produccion)}. <a href="/panel/ajustes/">Cambiar</a></p>`);

  const filas = [];
  for (const id of ids) {
    const inf = cat.find((i) => i.id === id);
    const cuenta = await leerCuenta(env, id);
    const nombre = inf?.nombre || cuenta?.nombre || id;
    if (!cuenta) {
      filas.push(`<details class="reg"><summary><span class="badge b-gris">Sin cuenta</span><b>${esc(nombre)}</b><span class="muted">ID ${esc(id)}</span></summary><div class="cuerpo">
        <p>Crea su cuenta cuando el convenio esté firmado.${conCorreo ? ' Pon su correo: le llega una invitación para elegir su contraseña y entrar. No tienes que mandarle nada más.' : ''}</p>
        ${conCorreo ? `<form method="post" action="/panel/influencers/accion" class="acciones cuenta"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="crear-invitar">
          <label class="muted">Su correo<input name="correo" type="email" required maxlength="160" placeholder="correo@ejemplo.com"></label>
          ${camposCuenta(inf, null, aj)}<button class="ok">Crear cuenta e invitar</button></form>
        <details><summary class="muted">No tiene correo: crear con contraseña temporal por WhatsApp</summary>` : ''}
        <form method="post" action="/panel/influencers/accion" class="acciones cuenta" data-clave data-id="${esc(id)}"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="crear">
          ${camposCuenta(inf, null, aj)}${camposClave(id, nombre, '')}<button class="ok">Crear cuenta</button></form>${conCorreo ? '</details>' : ''}</div></details>`);
      continue;
    }
    const ident = identidadDe(cuenta);
    const estado = cuenta.activa === false
      ? ['pausado', 'Pausada']
      : ident.estado === 'en-revision'
        ? ['amarillo', 'Revisa su identidad']
        : ident.estado !== 'aprobada'
          ? ['gris', ident.estado === 'rehacer' ? 'Rehaciendo identidad' : ident.estado === 'borrada' ? 'Borró su identidad' : 'Falta su identidad']
          : cuenta.aceptaPedidos === false ? ['amarillo', 'No recibe pedidos'] : ['verde', 'Activa'];
    filas.push(`<details class="reg" id="c-${esc(id)}"${url.searchParams.get('abrir') === id ? ' open' : ''}><summary><span class="badge b-${estado[0]}">${estado[1]}</span><b>${esc(nombre)}</b>
      <span class="muted">ID ${esc(id)} · ${telefonoConfirmado(cuenta) ? 'WhatsApp verificado' : 'WhatsApp sin verificar'} · ${cuenta.mp?.accessToken ? `Mercado Pago: ${esc(cuenta.mp.nombre || cuenta.mp.userId)}` : 'sin Mercado Pago'} · ${cuenta.ultimoIngreso ? `entró ${esc(fecha(cuenta.ultimoIngreso))}` : 'no entra todavía'}${cuenta.alta ? ' · registro en línea' : inf ? '' : ' · ya no está en el catálogo'}</span></summary>
      <div class="cuerpo">
        <p><a href="/panel/creador/?id=${esc(id)}">Abrir su ficha: pedidos, ganancias y su cuenta como la ve →</a></p>
        ${conCorreo && !correoDe(cuenta) ? `<form method="post" action="/panel/influencers/accion" class="acciones cuenta"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="invitar">
          <label class="muted">Su correo<input name="correo" type="email" required maxlength="160" value="${esc(cuenta.invitacion?.correo || cuenta.correo || '')}"></label>
          <button class="pausa">${cuenta.invitacion ? 'Reenviar la invitación' : 'Mandarle una invitación por correo'}</button>
          <span class="muted">${cuenta.invitacion ? `Enviada el ${esc(fecha(cuenta.invitacion.enviada))}. ` : ''}Con el link elige su contraseña y desde ahí entra con su correo.</span></form>` : ''}
        <form method="post" action="/panel/influencers/accion" class="acciones cuenta"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="editar">
          ${camposCuenta(inf, cuenta, aj)}
          <label class="muted"><input type="checkbox" name="activa" value="1"${cuenta.activa === false ? '' : ' checked'}> Cuenta activa</label>
          <label class="muted"><input type="checkbox" name="acepta" value="1"${cuenta.aceptaPedidos === false ? '' : ' checked'}> Recibe pedidos</label>
          <button class="ok">Guardar</button></form>
        <form method="post" action="/panel/influencers/accion" class="acciones cuenta" data-clave data-id="${esc(id)}"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="clave">
          ${camposClave(id, nombre, cuenta.whatsapp)}<button class="pausa">Poner contraseña temporal</button></form>
        ${bloqueIdentidad(cuenta, ident)}
        ${cuenta.mp?.accessToken ? `<p class="muted">Mercado Pago: ${esc(cuenta.mp.nombre)} ${cuenta.mp.nickname ? `(${esc(cuenta.mp.nickname)})` : ''} · usuario ${esc(cuenta.mp.userId)} · conectada ${esc(fecha(cuenta.mp.conectada))} · vence ${esc(fecha(cuenta.mp.vence))}</p>` : ''}
        ${(cuenta.mpHistorial || []).length ? `<p class="muted">${cuenta.mpHistorial.map((h) => `${esc(fecha(h.fecha))}: ${esc(h.que)}`).join('<br>')}</p>` : ''}
      </div></details>`);
  }
  const script = `<script>
document.querySelectorAll('input[data-hash][data-cuenta]').forEach((campo) => campo.addEventListener('input', () => {
  const link = document.querySelector('[data-wa-de="' + campo.id + '"]');
  const numero = (campo.closest('form').querySelector('[name=whatsapp]')?.value || campo.dataset.wa || '').replace(/\\D/g, '');
  if (!link) return;
  const msj = 'Hola ' + campo.dataset.nombre.split(' ')[0] + ', ya tienes tu cuenta de influencer en tato.pe/cuenta. Tu ID: ' + campo.dataset.cuenta + ' · Tu contraseña temporal: ' + campo.value + ' (al entrar te pide cambiarla).';
  link.href = 'https://wa.me/' + (numero.length === 9 ? '51' + numero : '') + '?text=' + encodeURIComponent(msj);
  link.hidden = !campo.value;
}));
</script>`;
  return html(page('Influencers', `${avisos.join('')}${filas.join('') || '<p class="muted">Todavía no hay influencers en el catálogo.</p>'}${SCRIPT_CLAVE}${script}`));
}

export async function handlePanelInfluencerAccion(request, env, url) {
  if (!origenOk(request, url)) return html(page('Influencers', '<p class="err">Origen no permitido.</p>'), 403);
  const f = await request.formData();
  const id = String(f.get('id') || '');
  const accion = String(f.get('accion') || '');
  const fin = (params) => volver(url, '/panel/influencers/', params);
  if (!idValido(id)) return fin({ err: 'ID no válido.' });
  const inf = (await catalogo(env)).find((i) => i.id === id);
  let cuenta = await leerCuenta(env, id);

  const leerCampos = () => {
    const whatsapp = String(f.get('whatsapp') || '').replace(/\D/g, '');
    const porcentaje = r2(Number(String(f.get('porcentaje') || '').replace(',', '.')));
    if (!/^9\d{8}$/.test(whatsapp)) return { error: 'El WhatsApp tiene que tener 9 números y empezar con 9.' };
    if (!(porcentaje >= 0 && porcentaje <= 100)) return { error: 'El porcentaje tiene que estar entre 0 y 100.' };
    const produccion = {};
    for (let i = 0; f.has(`paq_${i}`); i++) {
      const v = r2(Number(String(f.get(`prod_${i}`) || '0').replace(',', '.')));
      if (!(v >= 0)) return { error: 'Revisa los costos de producción.' };
      produccion[String(f.get(`paq_${i}`))] = v;
    }
    return { whatsapp, porcentaje, produccion };
  };

  switch (accion) {
    case 'crear': {
      if (cuenta) return fin({ err: `${id} ya tiene cuenta.` });
      if (!inf) return fin({ err: 'Ese influencer no está publicado en el catálogo.' });
      const campos = leerCampos();
      if (campos.error) return fin({ err: campos.error });
      const clave = String(f.get('clave') || '');
      if (!formatoClave(clave)) return fin({ err: 'Genera la contraseña temporal antes de crear la cuenta.' });
      cuenta = {
        id,
        nombre: inf.nombre,
        usuario: inf.usuario,
        whatsapp: campos.whatsapp,
        porcentajeTato: campos.porcentaje,
        produccion: campos.produccion,
        clave: await cifrarClave(clave),
        cambiarClave: true,
        activa: true,
        aceptaPedidos: true,
        creada: new Date().toISOString(),
      };
      await guardarCuenta(env, cuenta);
      return fin({ msg: `Cuenta de ${inf.nombre} creada. Su ID es ${id}; al entrar le pide cambiar la contraseña temporal.` });
    }
    case 'crear-invitar': {
      if (cuenta) return fin({ err: `${id} ya tiene cuenta.` });
      if (!inf) return fin({ err: 'Ese influencer no está publicado en el catálogo.' });
      const campos = leerCampos();
      if (campos.error) return fin({ err: campos.error });
      const correo = correoValido(f.get('correo'));
      if (!correo) return fin({ err: 'Revisa su correo.' });
      if (await idPorCorreo(env, correo)) return fin({ err: 'Ese correo ya es de otra cuenta.' });
      cuenta = {
        id, nombre: inf.nombre, usuario: inf.usuario, whatsapp: campos.whatsapp, porcentajeTato: campos.porcentaje, produccion: campos.produccion,
        clave: null, cambiarClave: false, activa: true, aceptaPedidos: true, creada: new Date().toISOString(),
      };
      const ok = await mandarInvitacion(env, cuenta, correo);
      await guardarCuenta(env, cuenta);
      return fin(ok ? { msg: `Cuenta de ${inf.nombre} creada. Le mandamos la invitación a ${correo}: con el link elige su contraseña.` } : { err: `Cuenta creada, pero no se pudo mandar el correo a ${correo}. Revisa el correo y reenvía la invitación.` });
    }
    case 'invitar': {
      if (!cuenta) return fin({ err: 'Esa cuenta no existe.' });
      const correo = correoValido(f.get('correo'));
      if (!correo) return fin({ err: 'Revisa su correo.' });
      const otro = await idPorCorreo(env, correo);
      if (otro && otro !== id) return fin({ err: 'Ese correo ya es de otra cuenta.' });
      const ok = await mandarInvitacion(env, cuenta, correo);
      await guardarCuenta(env, cuenta);
      return fin(ok ? { msg: `Le mandamos la invitación a ${correo}.` } : { err: `No se pudo mandar el correo a ${correo}. Revísalo e inténtalo otra vez.` });
    }
    case 'editar': {
      if (!cuenta) return fin({ err: 'Esa cuenta no existe.' });
      const campos = leerCampos();
      if (campos.error) return fin({ err: campos.error });
      if (campos.whatsapp !== cuenta.whatsapp) delete cuenta.whatsappVerificado;
      Object.assign(cuenta, {
        whatsapp: campos.whatsapp,
        porcentajeTato: cuenta.alta ? cuenta.porcentajeTato : campos.porcentaje,
        produccion: { ...(cuenta.produccion || {}), ...campos.produccion },
        activa: f.get('activa') === '1',
        aceptaPedidos: f.get('acepta') === '1',
        ...(inf ? { nombre: inf.nombre, usuario: inf.usuario } : {}),
      });
      await guardarCuenta(env, cuenta);
      if (!cuenta.activa) await cerrarSesionesDe(env, id);
      return fin({ msg: `Cuenta de ${cuenta.nombre} guardada. Los pedidos nuevos usan estos valores; los que ya existen mantienen los suyos.` });
    }
    case 'identidad-aprobar':
    case 'identidad-rehacer':
    case 'identidad-derivados': {
      if (!cuenta) return fin({ err: 'Esa cuenta no existe.' });
      const r = await decidirYAvisar(env, cuenta, accion.replace('identidad-', ''), {
        rehacer: ITEMS.filter((k) => f.get(`rehacer_${k}`) === '1'),
        nota: String(f.get('nota') || '').trim().slice(0, 300),
      });
      const destino = String(f.get('volver') || '');
      if (destino === 'ficha') return volver(url, '/panel/creador/', { id, ...(r.error ? { err: r.error } : { msg: r.mensaje }) });
      return fin(r.error ? { err: r.error } : { msg: `${cuenta.nombre}: ${r.mensaje}` });
    }
    case 'clave': {
      if (!cuenta) return fin({ err: 'Esa cuenta no existe.' });
      const clave = String(f.get('clave') || '');
      if (!formatoClave(clave)) return fin({ err: 'Genera la contraseña temporal primero.' });
      cuenta.clave = await cifrarClave(clave);
      delete cuenta.claveCorreo; // con el correo vuelve a entrar cuando cambie la contraseña temporal
      cuenta.cambiarClave = true;
      await guardarCuenta(env, cuenta);
      await cerrarSesionesDe(env, id);
      return fin({ msg: `Contraseña temporal puesta para ${cuenta.nombre}. Se cerraron sus sesiones abiertas.` });
    }
    default:
      return fin({ err: 'Acción no válida.' });
  }
}

// ---------- Ajustes ----------

export async function handlePanelAjustes(request, env, url) {
  let aviso = '';
  if (request.method === 'POST') {
    if (!origenOk(request, url)) return html(page('Ajustes', '<p class="err">Origen no permitido.</p>'), 403);
    const f = await request.formData();
    const num = (k) => r2(Number(String(f.get(k) ?? '').replace(',', '.')));
    const porcentajeTato = num('porcentaje');
    const tasa = String(f.get('tasa') || '').trim();
    const tasaMP = tasa === '' ? null : num('tasa');
    const produccion = num('produccion');
    if (!(porcentajeTato >= 0 && porcentajeTato <= 100) || (tasaMP != null && !(tasaMP >= 0 && tasaMP < 30)) || !(produccion >= 0)) {
      aviso = '<p class="err">Revisa los valores: porcentaje entre 0 y 100, comisión entre 0 y 30, producción en soles.</p>';
    } else {
      await guardarAjustes(env, { porcentajeTato, tasaMP, produccion });
      aviso = '<p class="notice">Ajustes guardados. Valen para los pedidos nuevos y para los links de pago que se creen desde ahora.</p>';
    }
  }
  const aj = await ajustes(env);
  const secretos = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET'].map((k) => `<code>${k}</code> ${env[k] ? '✓' : '✗'}`).join(' · ');
  const ejemplo = cuentas({ precio: 500, produccion: aj.produccion || 80, porcentajeTato: aj.porcentajeTato }, { conMP: true, tasaMP: aj.tasaMP || 0 });
  return html(page('Ajustes', `${aviso}
<form method="post" class="acciones cuenta" style="max-width:640px">
  <label class="muted">Tu parte del saldo (%)<input name="porcentaje" inputmode="decimal" value="${aj.porcentajeTato}" required></label>
  <label class="muted">Comisión de Mercado Pago por cobro (%, con IGV)<input name="tasa" inputmode="decimal" value="${aj.tasaMP ?? ''}" placeholder="Ej.: 3.99 % + IGV = 4.71"></label>
  <label class="muted">Producción por defecto de un paquete (S/)<input name="produccion" inputmode="decimal" value="${aj.produccion}"></label>
  <button class="ok">Guardar ajustes</button>
</form>
<p class="muted">La comisión de Mercado Pago depende de cuándo liberas el dinero; mírala en tu cuenta de Mercado Pago. Se usa para repartir el saldo: primero sale la comisión y lo que queda se divide. Cada influencer puede tener su propio porcentaje y sus costos en <a href="/panel/influencers/">Influencers</a>.</p>
<p class="muted">Ejemplo con un video de S/ 500 y producción de ${soles(ejemplo.adelanto)}: adelanto ${soles(ejemplo.adelanto)} para ti; del saldo de ${soles(ejemplo.saldo)} sale la comisión de ${soles(ejemplo.comisionMP)}; tú ${soles(ejemplo.parteTato)} y el influencer ${soles(ejemplo.parteInfluencer)}.</p>
<h2>Mercado Pago</h2>
<p>${mpListo(env) ? 'Listo para cobrar y dividir pagos.' : 'Todavía no está configurado: los pagos se registran a mano.'}</p>
<p class="muted">Secretos: ${secretos}. URL de redirección de la aplicación: <code>${esc(env.MP_REDIRECT_URI || REDIRECCION)}</code>. Webhooks: <code>https://tato.pe/api/mp/webhook</code> (evento «Pagos»).</p>`));
}
