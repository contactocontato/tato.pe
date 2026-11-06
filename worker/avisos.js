// Avisos por correo: al creador, al negocio y a Tato. Usan worker/correo.js; si el correo no está
// configurado o la persona no tiene un correo verificado, no se manda nada (y nada falla).
//
// Avisos de cada pedido: guardarPedido (worker/pedidos.js) llama a eventosPedido y manda el aviso cuando
// cambia lo que le toca saber a cada uno. En el pedido se guarda el último aviso (p.avisos) para no repetir.

import { enviarCorreo, plantilla, correoValido } from './correo.js';

const sitio = (env) => (env.SITIO || 'https://tato.pe').replace(/\/+$/, '');
const soles = (n) => `S/ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nombreNegocio = (p) => p.negocio.nombreComercial || p.negocio.razonSocial || `RUC ${p.negocio.ruc}`;

/** Un aviso a una persona. `ruta` es una página de tato.pe (botón). */
export async function avisar(env, para, { asunto, titulo, parrafos = [], ruta = '', boton = '' }) {
  if (!correoValido(para)) return false;
  return enviarCorreo(env, {
    para,
    asunto,
    ...plantilla({ titulo, parrafos, boton: ruta ? { texto: boton || 'Abrir en tato.pe', url: `${sitio(env)}${ruta}` } : null }),
  });
}

/** Aviso a Tato, si configuró CORREO_TATO. */
export const avisarTato = (env, aviso) => (env.CORREO_TATO ? avisar(env, env.CORREO_TATO, { boton: 'Abrir el panel', ...aviso }) : false);

/**
 * Qué le toca saber al creador y al negocio en el estado actual del pedido.
 * Devuelve { creador, negocio }: cada uno es null o { clave, asunto, titulo, parrafos }.
 * La clave cambia solo cuando hay algo nuevo que contar.
 */
export function eventosPedido(p) {
  const neg = nombreNegocio(p);
  const inf = p.influencer.nombre;
  const precio = p.dinero?.precio;
  const adelanto = precio == null ? 0 : Math.min(Number(p.dinero.produccion || 0), precio);
  const saldo = precio == null ? 0 : precio - adelanto;

  let creador = null;
  if (p.estado === 'solicitud' && precio != null) {
    creador = { clave: 'solicitud', asunto: `Nueva solicitud de ${neg}`, titulo: `${neg} quiere un video contigo`,
      parrafos: [`Paquete «${p.paquete.nombre}». Quiere promocionar: ${p.brief.promociona}`, 'Revisa la solicitud y decide si la aceptas.'] };
  } else if (p.estado === 'guion' && p.guion?.estado === 'pendiente') {
    creador = { clave: `guion-${p.guion.version}`, asunto: `Tu guion para ${neg} está listo`, titulo: 'Te toca revisar el guion',
      parrafos: [`Tato te mandó el guion del pedido ${p.id}. Apruébalo o propón cambios.`] };
  } else if (p.estado === 'video' && p.video?.estado === 'pendiente') {
    creador = { clave: `video-${p.video.version}`, asunto: `Tu video para ${neg} está listo`, titulo: 'Te toca revisar el video',
      parrafos: [`Tato te mandó el video del pedido ${p.id}. Apruébalo o pide cambios.`] };
  } else if (p.pagoInfluencer) {
    creador = { clave: `pago-${p.pagoInfluencer.fecha}`, asunto: `Te pagamos tu parte del pedido ${p.id}`, titulo: `Te pagamos ${soles(p.pagoInfluencer.monto)}`,
      parrafos: [`Operación ${p.pagoInfluencer.operacion}. Es tu parte del video para ${neg}.`] };
  } else if (p.estado === 'entrega' && p.pagos?.saldo?.metodo === 'mercadopago') {
    creador = { clave: 'cobrado', asunto: `${neg} pagó el saldo`, titulo: 'Tu parte llegó a tu Mercado Pago',
      parrafos: [`El negocio pagó el saldo del pedido ${p.id} y Mercado Pago ya dividió el pago.`] };
  } else if (p.estado === 'cancelado') {
    creador = { clave: 'cancelado', asunto: `Se canceló el pedido ${p.id}`, titulo: 'Tato canceló un pedido', parrafos: [`El pedido de ${neg} se canceló.`] };
  }

  let negocio = null;
  const link = (parte) => p.links?.[parte]?.link || '';
  switch (p.estado) {
    case 'solicitud':
      negocio = { clave: 'solicitud', asunto: `Recibimos tu solicitud ${p.id}`, titulo: `Tu solicitud le llegó a ${inf}`,
        parrafos: [precio == null ? 'Primero te cotizamos: te escribimos por WhatsApp con el precio.' : `Te avisamos por aquí cuando ${inf} la acepte.`] };
      break;
    case 'adelanto':
      negocio = { clave: `adelanto:${link('adelanto')}`, asunto: `${inf} aceptó tu pedido ${p.id}`, titulo: `${inf} aceptó tu pedido`,
        parrafos: [link('adelanto')
          ? `Para empezar, paga el adelanto de producción (${soles(adelanto)}) desde tu portal.`
          : `Para empezar, falta el adelanto de producción (${soles(adelanto)}). Te escribimos por WhatsApp con el link para pagarlo.`] };
      break;
    case 'guion':
      negocio = { clave: 'guion', asunto: `Empezamos tu video ${p.id}`, titulo: p.pagos?.adelanto ? 'Recibimos tu adelanto' : `${inf} aceptó tu pedido`,
        parrafos: [`Tato está escribiendo el guion. ${inf} lo revisa antes de producir.`] };
      break;
    case 'video':
      negocio = { clave: 'video', asunto: `Tu video ${p.id} está en producción`, titulo: 'El guion está aprobado', parrafos: ['Ahora producimos tu video.'] };
      break;
    case 'saldo':
      negocio = { clave: `saldo:${link('saldo')}`, asunto: `Tu video ${p.id} está listo`, titulo: 'Tu video está listo',
        parrafos: [link('saldo')
          ? `Paga el saldo (${soles(saldo)}) desde tu portal y te lo entregamos.`
          : `Falta el saldo (${soles(saldo)}). Te escribimos por WhatsApp con el link para pagarlo.`] };
      break;
    case 'entrega':
      negocio = { clave: 'entrega', asunto: `Recibimos tu pago del pedido ${p.id}`, titulo: 'Recibimos tu pago', parrafos: ['Tato te entrega el video final.'] };
      break;
    case 'entregado':
      negocio = { clave: 'entregado', asunto: `Tu video ${p.id} está entregado`, titulo: 'Tu video está entregado',
        parrafos: ['Recuerda publicarlo con #Publicidad y la etiqueta de que está hecho con IA, solo donde y por el tiempo de tu paquete.'] };
      break;
    case 'rechazado':
      negocio = { clave: 'rechazado', asunto: `Tu pedido ${p.id} no siguió`, titulo: `${inf} no puede tomar tu pedido`,
        parrafos: ['No se cobró nada. Puedes pedirle un video a otro influencer del catálogo.'] };
      break;
    case 'cancelado':
      negocio = { clave: 'cancelado', asunto: `Se canceló tu pedido ${p.id}`, titulo: 'Tu pedido se canceló',
        parrafos: [p.motivo ? `Motivo: ${p.motivo}` : 'Si pagaste algo, Tato te escribe por WhatsApp para la devolución.'] };
      break;
    default:
  }
  return { creador, negocio };
}

/** Manda los avisos que cambiaron. `quienes` es una lista de ['creador'|'negocio', evento]. Nunca lanza error. */
export async function mandarAvisosPedido(env, p, quienes) {
  for (const [quien, e] of quienes) {
    try {
      let para = '';
      if (quien === 'creador') {
        const c = await env.PEDIDOS_KV.get(`influencer:${p.influencer.id}`, 'json');
        para = c?.correo && c.correoVerificado ? c.correo : '';
      } else {
        para = p.negocio.contacto?.correo || '';
        if (!para && env.NEGOCIOS_KV) {
          const n = await env.NEGOCIOS_KV.get(`negocio:${p.negocio.ruc}`, 'json');
          para = n?.contacto?.correoVerificado ? n.contacto.correo : '';
        }
      }
      await avisar(env, para, {
        ...e,
        ruta: quien === 'creador' ? `/cuenta/pedido/${p.id}/` : `/negocio/pedido/${p.id}/`,
        boton: quien === 'creador' ? 'Ver el pedido' : 'Ver mi pedido',
      });
    } catch (err) {
      console.error('Avisos: no se pudo avisar', quien, p.id, err);
    }
  }
}
