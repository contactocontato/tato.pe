// Pedidos de videos con influencers: del negocio verificado al influencer, y el reparto del dinero.
//
// Pasos de un pedido:
//   solicitud  el negocio la envía desde el perfil; el influencer la acepta o no (si el paquete
//              es «a cotizar», primero Tato pone el precio)
//   adelanto   el negocio paga el costo de producción (entero para Tato: cubre los créditos)
//   guion      Tato escribe el guion; el influencer lo aprueba o pide cambios
//   video      Tato produce el video; el influencer lo aprueba o pide cambios
//   saldo      el negocio paga el resto. Con Mercado Pago, el pago va a la cuenta del influencer y
//              Mercado Pago le pasa a Tato su parte (Split de Pagos); a mano, Tato le paga al influencer
//   entrega    pagado: Tato le entrega el video final al negocio
//   entregado  terminado
//   (rechazado: el influencer no aceptó; cancelado: lo canceló Tato)
//
// Reparto del saldo: primero sale la comisión de Mercado Pago (si se pagó por ahí) y lo que queda
// se divide: el porcentaje de Tato (40 % por defecto, en Ajustes o por influencer) y el resto para el influencer.
//
// Almacenamiento: KV PEDIDOS_KV
//   pedido:<P-XXXXXX>   cada pedido (metadata: estado, influencer, ruc, turno, actualizado)
//   influencer:<id>     cuenta del influencer (contraseña cifrada, porcentaje, costos, Mercado Pago)
//   ajustes             porcentaje por defecto, tasa de Mercado Pago y producción por defecto
//   sesion:*, limite:*, mpestado:*  sesiones, conteos e inicios de conexión con Mercado Pago

import { json } from './ui.js';
import { mpListo, crearLink, leerPago, comisiones, firmaValida, renovar } from './mercadopago.js';
import { mismoOrigen, contar } from './seguridad.js';
import { palabrasSospechosas } from './negocios.js';
import { guardarArchivo, borrarArchivo } from './medios.js';

export const sitio = (env) => (env.SITIO || 'https://tato.pe').replace(/\/+$/, '');
const ahora = () => new Date().toISOString();
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const soles = (n) => `S/ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto de varias líneas: sin caracteres de control, con saltos de línea y un largo máximo. */
export const texto = (s, max) =>
  String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const linea = (s, max) => texto(s, max).replace(/\s+/g, ' ');

// ---------- Catálogo publicado (/influencers/datos.json) ----------

const caches = new WeakMap();
export async function catalogo(env) {
  const c = caches.get(env.ASSETS);
  if (c && Date.now() - c.t < 60_000) return c.datos;
  const res = await env.ASSETS.fetch(new Request(`${sitio(env)}/influencers/datos.json`));
  const datos = res.ok ? (await res.json()).influencers || [] : [];
  caches.set(env.ASSETS, { t: Date.now(), datos });
  return datos;
}

/** El influencer si está publicado y con el convenio vigente; si no, null. */
export async function influencerPublicado(env, id) {
  if (/^creador-[0-9a-f]{32}$/.test(id)) {
    const c = await leerCuenta(env, id);
    return c?.alta && c.activa !== false && identidadDe(c).estado === 'aprobada'
      ? { id, nombre: c.nombre, ...c.alta.perfil, paquetes: c.alta.paquetes }
      : null;
  }
  const i = (await catalogo(env)).find((x) => x.id === id);
  return i && !(i.fin && i.fin < Date.now()) ? i : null;
}

// ---------- Ajustes ----------

export const AJUSTES_BASE = { porcentajeTato: 40, tasaMP: null, produccion: 0 };
export async function ajustes(env) {
  return { ...AJUSTES_BASE, ...((await env.PEDIDOS_KV.get('ajustes', 'json')) || {}) };
}
export const guardarAjustes = (env, a) => env.PEDIDOS_KV.put('ajustes', JSON.stringify({ ...a, actualizado: ahora() }));

// ---------- Cuentas de influencer ----------

export const idValido = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);
export const leerCuenta = (env, id) => (idValido(id) ? env.PEDIDOS_KV.get(`influencer:${id}`, 'json') : null);
export async function guardarCuenta(env, c) {
  c.actualizada = ahora();
  await env.PEDIDOS_KV.put(`influencer:${c.id}`, JSON.stringify(c), {
    metadata: {
      nombre: c.nombre, activa: c.activa !== false, mp: Boolean(c.mp?.accessToken),
      publico: c.alta && recibePedidos(c)
        ? { nombre: c.nombre, region: c.alta.perfil.region, desde: Math.min(...c.alta.paquetes.map((p) => p.precio)) }
        : null,
    },
  });
}
/** Identidad del influencer (fotos y voz, ver worker/identidad.js), con valores por defecto. */
export function identidadDe(c) {
  const i = c?.identidad || {};
  return { estado: 'incompleta', voz: null, cuento: null, consentimiento: null, historial: [], ...i, fotos: { ...(i.fotos || {}) }, rehacer: [...(i.rehacer || [])] };
}
/** Estados en los que el influencer puede subir o cambiar sus fotos y su voz. */
export const SUBIDAS_ABIERTAS = ['incompleta', 'rehacer', 'borrada'];
/** Recibe solicitudes si su cuenta está activa, no pausó sus pedidos y Tato aprobó su identidad. */
export const recibePedidos = (c) => Boolean(c && c.activa !== false && c.aceptaPedidos !== false && identidadDe(c).estado === 'aprobada');
export const porcentajeDe = (cuenta, aj) => Number(cuenta?.porcentajeTato ?? aj.porcentajeTato);
/** Cómo se cobra el saldo con este influencer: Mercado Pago si la app está lista y él conectó su cuenta. */
export const metodoSaldo = (env, cuenta) => (mpListo(env) && cuenta?.mp?.accessToken ? 'mercadopago' : 'manual');

// ---------- Dinero ----------

/**
 * El reparto de un pedido. `precio` es lo que paga el negocio; `produccion` es el adelanto (para Tato).
 * Con Mercado Pago, su comisión (tasaMP %, con IGV) sale del saldo antes de dividir.
 */
export function cuentas({ precio, produccion = 0, porcentajeTato }, { tasaMP = 0, conMP = false } = {}) {
  if (precio == null) return null;
  const adelanto = r2(Math.min(Math.max(0, Number(produccion) || 0), precio));
  const saldo = r2(precio - adelanto);
  const tasa = conMP ? Number(tasaMP) || 0 : 0;
  const comisionMP = r2((saldo * tasa) / 100);
  const neto = r2(saldo - comisionMP);
  const parteTato = r2((neto * porcentajeTato) / 100);
  return { precio: r2(precio), adelanto, saldo, tasaMP: tasa, comisionMP, neto, porcentajeTato, parteTato, parteInfluencer: r2(neto - parteTato) };
}

/** Las cuentas de un pedido: con las cifras reales si el saldo ya se pagó; si no, estimadas. */
export function cuentasDe(p, { metodo, tasaMP }) {
  const s = p.pagos?.saldo;
  const base = cuentas(p.dinero, { conMP: (s?.metodo || p.links?.saldo?.metodo || metodo) === 'mercadopago', tasaMP: p.links?.saldo?.tasaMP ?? tasaMP });
  if (!base) return null;
  if (!s) return { ...base, real: false, metodo: p.links?.saldo?.metodo || metodo };
  const comisionMP = r2(s.comisionMP || 0);
  const neto = r2(s.monto - comisionMP);
  const parteTato = r2(s.parteTato);
  return { ...base, saldo: s.monto, comisionMP, neto, parteTato, parteInfluencer: r2(neto - parteTato), real: true, metodo: s.metodo };
}

// ---------- Pedidos ----------

export const ESTADOS = {
  solicitud: 'Solicitud nueva',
  adelanto: 'Esperando el adelanto',
  guion: 'Guion',
  video: 'Video',
  saldo: 'Esperando el saldo',
  entrega: 'Por entregar',
  entregado: 'Entregado',
  rechazado: 'No aceptado',
  cancelado: 'Cancelado',
};
export const ACTIVOS = ['solicitud', 'adelanto', 'guion', 'video', 'saldo', 'entrega'];
export const PASOS = [
  ['solicitud', 'Solicitud'],
  ['adelanto', 'Adelanto'],
  ['guion', 'Guion'],
  ['video', 'Video'],
  ['saldo', 'Saldo'],
  ['entregado', 'Entrega'],
];

/** A quién le toca mover el pedido: influencer, tato, negocio o nadie. */
export function turno(p) {
  switch (p.estado) {
    case 'solicitud': return p.dinero.precio == null ? 'tato' : 'influencer';
    case 'adelanto': case 'saldo': return 'negocio';
    case 'guion': return p.guion?.estado === 'pendiente' ? 'influencer' : 'tato';
    case 'video': return p.video?.estado === 'pendiente' ? 'influencer' : 'tato';
    case 'entrega': return 'tato';
    case 'entregado': return p.pagos?.saldo?.metodo === 'manual' && !p.pagoInfluencer ? 'tato' : '';
    default: return '';
  }
}

export const leerPedido = (env, id) => (/^P-[A-Z2-9]{6}$/.test(String(id)) ? env.PEDIDOS_KV.get(`pedido:${id}`, 'json') : null);

export async function guardarPedido(env, p) {
  p.actualizado = ahora();
  await env.PEDIDOS_KV.put(`pedido:${p.id}`, JSON.stringify(p), {
    metadata: { estado: p.estado, influencer: p.influencer.id, ruc: p.negocio.ruc, turno: turno(p), actualizado: p.actualizado },
  });
}

/** Claves de los pedidos con su metadata (sin leer cada uno). */
export async function metasPedidos(env) {
  const out = [];
  let cursor;
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: 'pedido:', cursor });
    out.push(...lote.keys);
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  return out;
}

export async function listarPedidos(env, filtro = () => true, max = 200) {
  const metas = (await metasPedidos(env)).filter(filtro)
    .sort((a, b) => String(b.metadata?.actualizado || '').localeCompare(String(a.metadata?.actualizado || '')))
    .slice(0, max);
  return (await Promise.all(metas.map((k) => env.PEDIDOS_KV.get(k.name, 'json')))).filter(Boolean);
}

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 letras: sin sesgo con un byte al azar
async function idLibre(env) {
  for (;;) {
    const id = `P-${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => LETRAS[b % 32]).join('')}`;
    if (!(await env.PEDIDOS_KV.get(`pedido:${id}`))) return id;
  }
}

export function anotar(p, quien, que) {
  p.historial = [...(p.historial || []).slice(-29), { fecha: ahora(), quien, que }];
}

// ---------- Links de pago ----------

/** Crea el link de Mercado Pago del adelanto (cuenta de Tato) o del saldo (cuenta del influencer, dividido). */
export async function crearLinkPedido(env, p, parte) {
  const aj = await ajustes(env);
  let token;
  let monto;
  let comision = 0;
  let tasaMP = null;
  if (parte === 'adelanto') {
    token = env.MP_ACCESS_TOKEN;
    monto = cuentas(p.dinero).adelanto;
  } else {
    const cuenta = await cuentaConToken(env, p.influencer.id);
    if (!cuenta?.mp?.accessToken) throw new Error(`${p.influencer.nombre} no tiene su Mercado Pago conectado.`);
    if (aj.tasaMP == null) throw new Error('Falta la comisión de Mercado Pago en Ajustes.');
    token = cuenta.mp.accessToken;
    tasaMP = Number(aj.tasaMP);
    const c = cuentas(p.dinero, { conMP: true, tasaMP });
    monto = c.saldo;
    comision = c.parteTato;
  }
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN.');
  if (!(monto > 0)) throw new Error('No hay monto que cobrar.');
  const nombre = p.negocio.nombreComercial || p.negocio.razonSocial;
  const r = await crearLink(env, token, {
    id: `${p.id}-${parte}`,
    titulo: `${parte === 'adelanto' ? 'Adelanto de producción' : 'Saldo'} · Video con ${p.influencer.nombre} para ${nombre} · Pedido ${p.id}`,
    monto,
    comision,
    referencia: `${p.id}:${parte}`,
    notificacion: `${sitio(env)}/api/mp/webhook?pedido=${p.id}&parte=${parte}`,
    volver: `${sitio(env)}/influencers/pago/?pedido=${p.id}`,
  });
  p.links = { ...(p.links || {}), [parte]: { ...r, monto, comision, tasaMP, metodo: 'mercadopago' } };
  anotar(p, 'Tato Studio', `Link de pago del ${parte}: ${soles(monto)}.`);
}

/** Igual que crearLinkPedido, pero si falla deja el error anotado para verlo en el panel. */
async function intentarLink(env, p, parte) {
  try {
    await crearLinkPedido(env, p, parte);
  } catch (e) {
    console.error('Mercado Pago: no se pudo crear el link', p.id, parte, e);
    p.links = { ...(p.links || {}), [parte]: { error: e.message, creado: ahora() } };
  }
}

/** La cuenta del influencer con su token de Mercado Pago al día (se renueva si vence en menos de 7 días). */
export async function cuentaConToken(env, id) {
  const cuenta = await leerCuenta(env, id);
  if (cuenta?.mp?.refreshToken && mpListo(env) && cuenta.mp.vence - Date.now() < 7 * 86400000) {
    cuenta.mp = { ...cuenta.mp, ...(await renovar(env, cuenta.mp)) };
    await guardarCuenta(env, cuenta);
  }
  return cuenta;
}

// ---------- Cambios de paso ----------

/** El negocio pagó (por Mercado Pago o Tato lo marcó a mano). */
function pagado(p, parte, datos) {
  p.pagos = { ...(p.pagos || {}), [parte]: datos };
  if (parte === 'adelanto' && p.estado === 'adelanto') p.estado = 'guion';
  if (parte === 'saldo' && p.estado === 'saldo') p.estado = 'entrega';
}

/**
 * Lo que puede hacer el influencer desde su cuenta. Devuelve { error } o { ok }.
 * Guarda el pedido si cambió.
 */
export async function accionInfluencer(env, p, accion, datos = {}) {
  const comentario = texto(datos.comentario, 1000);
  switch (accion) {
    case 'aceptar': {
      if (p.estado !== 'solicitud') return { error: 'Este pedido ya no está esperando tu respuesta.' };
      if (p.dinero.precio == null) return { error: 'Tato todavía está cotizando este pedido.' };
      const c = cuentas(p.dinero);
      p.estado = c.adelanto > 0 ? 'adelanto' : 'guion';
      anotar(p, p.influencer.nombre, 'Aceptó el pedido.');
      if (p.estado === 'adelanto' && mpListo(env)) await intentarLink(env, p, 'adelanto');
      break;
    }
    case 'rechazar':
      if (p.estado !== 'solicitud') return { error: 'Este pedido ya no está esperando tu respuesta.' };
      p.estado = 'rechazado';
      p.motivo = comentario;
      anotar(p, p.influencer.nombre, `No aceptó el pedido.${comentario ? ` Motivo: ${comentario}` : ''}`);
      break;
    case 'aprobar-guion':
    case 'cambios-guion':
    case 'aprobar-video':
    case 'cambios-video': {
      const [que, cual] = accion.split('-').reverse(); // ['guion'|'video', 'aprobar'|'cambios']
      if (p.estado !== que || p[que]?.estado !== 'pendiente') return { error: `No hay un ${que} esperando tu revisión.` };
      if (que === 'guion' && cual === 'aprobar') {
        const falta = actuacionesQueFaltan(p);
        if (falta.length) return { error: `Antes de aprobar, sube tu ${falta.join(' y tu ')} actuando el guion.` };
      }
      if (cual === 'cambios') {
        if (comentario.length < 3) return { error: 'Cuéntale a Tato qué cambiarías.' };
        p[que] = { ...p[que], estado: 'cambios', comentario };
        anotar(p, p.influencer.nombre, `Pidió cambios en el ${que}: ${comentario}`);
        break;
      }
      p[que] = { ...p[que], estado: 'aprobado', aprobado: ahora() };
      anotar(p, p.influencer.nombre, `Aprobó el ${que}.`);
      if (que === 'guion') p.estado = 'video';
      else {
        p.estado = cuentas(p.dinero).saldo > 0 ? 'saldo' : 'entrega';
        const cuenta = await leerCuenta(env, p.influencer.id);
        if (p.estado === 'saldo' && metodoSaldo(env, cuenta) === 'mercadopago') await intentarLink(env, p, 'saldo');
      }
      break;
    }
    default:
      return { error: 'Acción no válida.' };
  }
  await guardarPedido(env, p);
  return { ok: true };
}

/** Lo que hace Tato desde su panel. Devuelve { error } o { ok, mensaje }. */
export async function accionTato(env, p, accion, datos = {}) {
  const numero = (v) => (v === '' || v == null ? NaN : r2(Number(String(v).replace(',', '.'))));
  let mensaje = 'Listo.';
  switch (accion) {
    case 'precio': {
      if (!['solicitud', 'adelanto'].includes(p.estado) || p.pagos?.adelanto) return { error: 'El precio ya no se puede cambiar: el adelanto está pagado.' };
      const precio = numero(datos.precio);
      const produccion = numero(datos.produccion || 0);
      if (!(precio > 0) || !(produccion >= 0) || produccion > precio) return { error: 'Revisa el precio y la producción (la producción no puede ser mayor que el precio).' };
      p.dinero = { ...p.dinero, precio, produccion };
      anotar(p, 'Tato Studio', `Precio: ${soles(precio)} (producción ${soles(produccion)}).`);
      if (p.estado === 'adelanto') {
        if (cuentas(p.dinero).adelanto > 0 && mpListo(env)) await intentarLink(env, p, 'adelanto');
        else if (!(cuentas(p.dinero).adelanto > 0)) p.estado = 'guion';
      }
      mensaje = `Precio guardado: ${soles(precio)}.`;
      break;
    }
    case 'link': {
      const parte = datos.parte === 'saldo' ? 'saldo' : 'adelanto';
      if (p.estado !== parte) return { error: `El pedido no está esperando el ${parte}.` };
      if (!mpListo(env)) return { error: 'Mercado Pago no está configurado: cobra a mano y márcalo como pagado.' };
      try {
        await crearLinkPedido(env, p, parte);
      } catch (e) {
        return { error: e.message };
      }
      mensaje = `Link del ${parte} listo.`;
      break;
    }
    case 'pagado': {
      const parte = datos.parte === 'saldo' ? 'saldo' : 'adelanto';
      if (p.estado !== parte || p.pagos?.[parte]) return { error: `El pedido no está esperando el ${parte}.` };
      const c = cuentas(p.dinero);
      const monto = numero(datos.monto || c[parte]);
      if (!(monto > 0)) return { error: 'Escribe el monto que recibiste.' };
      const operacion = linea(datos.operacion, 60);
      if (!operacion) return { error: 'Escribe el número de operación (Yape, Plin o transferencia).' };
      const parteTato = parte === 'saldo' ? r2((monto * p.dinero.porcentajeTato) / 100) : monto;
      pagado(p, parte, { metodo: 'manual', monto, operacion, comisionMP: 0, parteTato, fecha: ahora() });
      anotar(p, 'Tato Studio', `Registró el pago del ${parte}: ${soles(monto)} (operación ${operacion}).`);
      mensaje = `Pago del ${parte} registrado.`;
      break;
    }
    case 'guion':
    case 'video': {
      // Se puede mandar de nuevo mientras el influencer no lo apruebe (por ejemplo, para corregir algo).
      if (p.estado !== accion || p[accion]?.estado === 'aprobado') return { error: `El pedido no está esperando un ${accion} tuyo.` };
      let contenido;
      if (accion === 'guion') {
        contenido = texto(datos.texto, 6000);
        if (contenido.length < 20) return { error: 'Escribe el guion completo.' };
      } else {
        contenido = linea(datos.link, 500);
        let u;
        try { u = new URL(contenido); } catch { u = null; }
        if (!u || u.protocol !== 'https:') return { error: 'Pega el link del video (https://…). Que sea privado: Drive, WeTransfer o similar.' };
      }
      const version = (p[accion]?.version || 0) + 1;
      p[accion] = { [accion === 'guion' ? 'texto' : 'link']: contenido, enviado: ahora(), estado: 'pendiente', version, comentarioAnterior: p[accion]?.comentario || '' };
      if (accion === 'guion') p.guion.pideActuacion = { audio: datos.actuar_audio === '1', video: datos.actuar_video === '1' };
      const pide = accion === 'guion' ? ['audio', 'video'].filter((t) => p.guion.pideActuacion[t]) : [];
      anotar(p, 'Tato Studio', `Envió el ${accion} (versión ${version})${pide.length ? `, y pidió que lo actúe en ${pide.join(' y ')}` : ''}.`);
      mensaje = `${accion === 'guion' ? 'Guion' : 'Video'} enviado a ${p.influencer.nombre}.`;
      break;
    }
    case 'entregar':
      if (p.estado !== 'entrega') return { error: 'El pedido no está listo para entregar (falta el pago del saldo).' };
      p.estado = 'entregado';
      p.entregado = ahora();
      anotar(p, 'Tato Studio', 'Entregó el video final.');
      mensaje = 'Pedido entregado.';
      break;
    case 'pago-influencer': {
      if (!p.pagos?.saldo || p.pagos.saldo.metodo !== 'manual') return { error: 'Este pago se reparte solo por Mercado Pago o el saldo no está pagado.' };
      if (p.pagoInfluencer) return { error: 'El pago al influencer ya está registrado.' };
      const c = cuentasDe(p, { metodo: 'manual', tasaMP: 0 });
      const monto = numero(datos.monto || c.parteInfluencer);
      const operacion = linea(datos.operacion, 60);
      if (!(monto > 0) || !operacion) return { error: 'Escribe el monto y el número de operación.' };
      p.pagoInfluencer = { monto, operacion, fecha: ahora() };
      anotar(p, 'Tato Studio', `Le pagó a ${p.influencer.nombre}: ${soles(monto)} (operación ${operacion}).`);
      mensaje = `Pago a ${p.influencer.nombre} registrado.`;
      break;
    }
    case 'cancelar':
      if (!ACTIVOS.includes(p.estado)) return { error: 'Este pedido ya terminó.' };
      p.estado = 'cancelado';
      p.motivo = texto(datos.motivo, 300);
      anotar(p, 'Tato Studio', `Canceló el pedido.${p.motivo ? ` Motivo: ${p.motivo}` : ''}`);
      mensaje = 'Pedido cancelado. Si hubo pagos, la devolución se hace desde Mercado Pago o a mano.';
      break;
    default:
      return { error: 'Acción no válida.' };
  }
  await guardarPedido(env, p);
  return { ok: true, mensaje };
}

/** Las actuaciones que Tato pidió para el guion actual y que el influencer todavía no subió. */
export function actuacionesQueFaltan(p) {
  const pide = p.guion?.pideActuacion || {};
  return ['audio', 'video'].filter((t) => pide[t] && !(p.actuaciones?.[t]?.subido > (p.guion?.enviado || '')));
}

/** El influencer sube un audio o un video actuando el guion (mientras el pedido está en guion o en video). */
export async function subirActuacion(env, request, p, tipo, segundos) {
  if (!['guion', 'video'].includes(p.estado)) return { error: 'Este pedido ya no está en la etapa del guion.', status: 409 };
  const r = await guardarArchivo(env, request, tipo, `pedidos/${p.id}/actuacion-${tipo}`);
  if (r.error) return r;
  const fresco = await leerPedido(env, p.id);
  const anterior = fresco.actuaciones?.[tipo]?.clave;
  fresco.actuaciones = { ...(fresco.actuaciones || {}), [tipo]: { clave: r.clave, tipo: r.tipo, tamano: r.tamano, segundos: segundos || null, subido: ahora() } };
  anotar(fresco, fresco.influencer.nombre, `Subió su ${tipo} actuando el guion.`);
  await guardarPedido(env, fresco);
  await borrarArchivo(env, anterior);
  return { ok: true };
}

/** Cron diario: borra las actuaciones de los pedidos que terminaron hace más de 30 días. */
export async function limpiarActuaciones(env) {
  if (!env.MEDIOS || !env.PEDIDOS_KV) return { limpiados: 0 };
  const limite = new Date(Date.now() - 30 * 86400000).toISOString();
  let limpiados = 0;
  for (const k of await metasPedidos(env)) {
    if (ACTIVOS.includes(k.metadata?.estado) || String(k.metadata?.actualizado || '') > limite) continue;
    const p = await env.PEDIDOS_KV.get(k.name, 'json');
    const claves = Object.values(p?.actuaciones || {}).map((a) => a.clave).filter(Boolean);
    if (!claves.length) continue;
    for (const c of claves) await borrarArchivo(env, c);
    p.actuaciones = {};
    p.actuacionesBorradas = ahora();
    anotar(p, 'Tato Studio', 'Se borraron las actuaciones (el pedido terminó hace más de 30 días).');
    await guardarPedido(env, p);
    limpiados++;
  }
  return { limpiados };
}

/** Registra un pago de Mercado Pago ya leído de su API. Devuelve true si quedó registrado (o ya lo estaba). */
export async function registrarPagoMP(env, p, parte, pago) {
  if (String(pago.external_reference) !== `${p.id}:${parte}`) return false;
  if (pago.status !== 'approved' || pago.currency_id !== 'PEN') return false;
  if (p.pagos?.[parte]?.id === String(pago.id)) return true;
  if (p.pagos?.[parte]) {
    anotar(p, 'Mercado Pago', `Llegó otro pago del ${parte} (${pago.id}, ${soles(pago.transaction_amount)}): revisar y devolver.`);
    await guardarPedido(env, p);
    return false;
  }
  const esperado = p.links?.[parte]?.monto ?? cuentas(p.dinero)[parte];
  if (Number(pago.transaction_amount) + 0.01 < esperado) {
    anotar(p, 'Mercado Pago', `Pago del ${parte} por ${soles(pago.transaction_amount)}, menos de lo esperado (${soles(esperado)}): revisar.`);
    await guardarPedido(env, p);
    return false;
  }
  const fee = comisiones(pago);
  const monto = r2(pago.transaction_amount);
  pagado(p, parte, {
    metodo: 'mercadopago',
    id: String(pago.id),
    monto,
    comisionMP: fee.mp,
    parteTato: parte === 'saldo' ? fee.tato || p.links?.saldo?.comision || 0 : monto,
    fecha: pago.date_approved || ahora(),
  });
  anotar(p, 'Mercado Pago', `El negocio pagó el ${parte}: ${soles(monto)}.`);
  await guardarPedido(env, p);
  return true;
}

// ---------- API pública ----------

/** POST /api/pedidos: un negocio verificado le pide un video a un influencer. */
export async function handlePedidoNuevo(request, env) {
  if (request.method !== 'POST') return json({ error: 'Envía la solicitud desde el perfil del influencer.' }, 405);
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido.' }, 403);
  if (Number(request.headers.get('Content-Length') || 0) > 16000) return json({ error: 'Los datos son demasiado largos.' }, 413);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== 'object') return json({ error: 'Faltan datos.' }, 400);
  if (b.sitio) return json({ numero: null, mensaje: 'Recibimos tu solicitud.' }); // campo trampa para bots

  const codigo = linea(b.codigo, 20).toUpperCase();
  const ruc = String(b.ruc || '').replace(/\D/g, '');
  const id = String(b.influencer || '');
  const promociona = linea(b.promociona, 300);
  const detalle = texto(b.detalle, 1000);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : '';
  if (!/^TS-[A-Z2-9]{5}$/.test(codigo)) return json({ error: 'Escribe el código de tu negocio verificado (TS-XXXXX).' }, 400);
  if (!/^\d{11}$/.test(ruc)) return json({ error: 'Escribe el RUC de tu negocio (11 números).' }, 400);
  if (promociona.length < 10) return json({ error: 'Cuéntanos en una frase qué quieres promocionar.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
  if ((await contar(env, `pedidos:${ahora().slice(0, 10)}:${ip}`, 86400)) > 10) {
    return json({ error: 'Enviaste muchas solicitudes hoy. Escríbenos por WhatsApp.' }, 429);
  }
  if ((await env.NEGOCIOS_KV.get(`codigo:${codigo}`)) !== ruc) {
    return json({ error: 'Ese código no corresponde a ese RUC. Revisa los dos o vuelve a registrar tu negocio.' }, 403);
  }
  const negocio = await env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json');
  if (negocio?.semaforo !== 'verde') return json({ error: 'Tu negocio no está verificado en este momento. Escríbenos por WhatsApp.' }, 403);

  const inf = await influencerPublicado(env, id);
  if (!inf) return json({ error: 'Ese influencer ya no está en el catálogo.' }, 404);
  const paq = inf.paquetes.find((x) => x.nombre === b.paquete);
  if (!paq) return json({ error: 'Elige uno de sus paquetes.' }, 400);
  const cuenta = await leerCuenta(env, id);
  if (!recibePedidos(cuenta)) return json({ error: `${inf.nombre} no está tomando pedidos por ahora.` }, 409);
  const abiertos = (await metasPedidos(env)).filter((k) => k.metadata?.ruc === ruc && ACTIVOS.includes(k.metadata?.estado)).length;
  if (abiertos >= 5) return json({ error: 'Ya tienes 5 pedidos en curso. Cuando avance alguno, puedes pedir otro.' }, 429);

  const aj = await ajustes(env);
  const produccion = Number(paq.produccion ?? cuenta.produccion?.[paq.nombre] ?? aj.produccion ?? 0);
  const s = negocio.sunat || {};
  const p = {
    id: await idLibre(env),
    creado: ahora(),
    estado: 'solicitud',
    influencer: { id, nombre: inf.nombre },
    negocio: {
      ruc,
      codigo,
      razonSocial: s.razonSocial || '',
      nombreComercial: negocio.negocio?.nombreComercial || '',
      rubro: negocio.negocio?.rubro || '',
      contacto: { nombre: negocio.contacto?.nombre || '', whatsapp: negocio.contacto?.whatsapp || '' },
      sunat: { estado: s.estado || '', condicion: s.condicion || '', actividad: s.actividad || '' },
      verificado: negocio.decision?.fecha || negocio.creado || '',
    },
    paquete: { nombre: paq.nombre, entrega: paq.entrega, uso: paq.uso },
    brief: { promociona, detalle, fecha },
    alertas: palabrasSospechosas(`${promociona} ${detalle}`),
    dinero: { precio: paq.precio, produccion: paq.precio == null ? produccion : Math.min(produccion, paq.precio), porcentajeTato: porcentajeDe(cuenta, aj) },
    pagos: {},
    links: {},
    guion: null,
    video: null,
    pagoInfluencer: null,
    motivo: '',
    historial: [],
  };
  anotar(p, 'negocio', 'Envió la solicitud.');
  await guardarPedido(env, p);
  const siguiente = paq.precio == null
    ? 'Primero te cotizamos por WhatsApp.'
    : cuentas(p.dinero).adelanto > 0
      ? 'Cuando la acepte, te escribimos por WhatsApp con el link para pagar el adelanto.'
      : 'Cuando la acepte, te escribimos por WhatsApp.';
  return json({ numero: p.id, mensaje: `Listo: tu solicitud ${p.id} le llegó a ${inf.nombre}. ${siguiente}` });
}

/** GET /api/influencers/<id>/estado: si el influencer está tomando pedidos. */
export async function handleEstadoInfluencer(env, id) {
  const inf = await influencerPublicado(env, id);
  return json({ recibe: Boolean(inf && recibePedidos(await leerCuenta(env, id))) });
}

/** POST /api/mp/webhook?pedido=&parte=: aviso de Mercado Pago. El pago siempre se vuelve a leer en su API. */
export async function handleWebhook(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const tipo = String(url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic || '');
  const dataId = url.searchParams.get('data.id');
  const pagoId = dataId || body.data?.id || (tipo === 'payment' ? url.searchParams.get('id') : null);
  if (!pagoId || !tipo.includes('payment')) return new Response('ok'); // otros avisos (merchant_order, etc.)
  if ((await firmaValida(env, request, dataId || String(pagoId))) === false) return new Response('firma inválida', { status: 401 });

  const parte = url.searchParams.get('parte');
  const p = await leerPedido(env, url.searchParams.get('pedido'));
  if (!p || !['adelanto', 'saldo'].includes(parte)) return new Response('ok');
  const token = parte === 'adelanto' ? env.MP_ACCESS_TOKEN : (await cuentaConToken(env, p.influencer.id))?.mp?.accessToken;
  if (!token) return new Response('ok');
  const pago = await leerPago(env, token, pagoId); // si falla, el error da 500 y Mercado Pago vuelve a avisar
  const ok = await registrarPagoMP(env, p, parte, pago);
  return new Response(ok ? 'ok' : 'ignorado');
}

/** Cron diario: renueva la conexión de Mercado Pago de los influencers que vence en menos de 30 días. */
export async function renovarConexiones(env) {
  if (!mpListo(env) || !env.PEDIDOS_KV) return { renovadas: 0 };
  let renovadas = 0;
  let cursor;
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: 'influencer:', cursor });
    for (const k of lote.keys.filter((x) => x.metadata?.mp)) {
      const c = await env.PEDIDOS_KV.get(k.name, 'json');
      if (!c?.mp?.refreshToken || c.mp.vence - Date.now() > 30 * 86400000) continue;
      try {
        c.mp = { ...c.mp, ...(await renovar(env, c.mp)) };
        await guardarCuenta(env, c);
        renovadas++;
      } catch (e) {
        console.error('Mercado Pago: no se pudo renovar la conexión de', c.id, e);
      }
    }
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  return { renovadas };
}
