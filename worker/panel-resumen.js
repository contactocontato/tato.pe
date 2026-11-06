// Resumen del panel de Tato: junta a los negocios y a los creadores en un solo lugar.
//   /panel/                     lo que te toca, cifras del mes, pedidos por paso, actividad reciente,
//                               y las listas de creadores y negocios con sus pedidos
//   /panel/negocio/?ruc=        ficha de un negocio: datos, decisión, correo, pedidos y lo que paga
//   /panel/creador/?id=         ficha de un creador: datos, identidad (aprobar aquí), pedidos y lo que gana
//   /panel/vista/negocio/?ruc=  la página del negocio tal como la ve él (sin poder tocar nada)
//   /panel/vista/creador/?id=   la cuenta del creador tal como la ve él (sin poder tocar nada)
// Usa el mismo acceso que el resto del panel (usuario «tato» + PANEL_PASSWORD).

import { page, html, esc } from './ui.js';
import {
  listarPedidos, leerCuenta, ajustes, cuentasDe, metodoSaldo, identidadDe, correoDe, turno, soles, r2,
  ESTADOS, ACTIVOS, catalogo,
} from './pedidos.js';
import { mpListo } from './mercadopago.js';
import { configCorreo } from './correo.js';
import { configVerificacion, telefonoConfirmado } from './verificacion.js';
import { bloqueIdentidad } from './panel-pedidos.js';
import { paginaInicio } from './cuenta.js';
import { paginaInicioNegocio, situacionNegocio, pagoPendiente } from './portal-negocio.js';
import { listarPublicaciones } from './publicaciones.js';
import { respuesta } from './portal.js';

const ETIQUETA_NEG = { verde: 'Verificado', amarillo: 'En revisión', rojo: 'No entra', pausado: 'Pausado' };
const fecha = (s, hora = true) => (s ? new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', ...(hora ? { timeStyle: 'short' } : {}) }) : '');
const mesLima = (s) => {
  const t = Date.parse(s || '');
  return Number.isFinite(t) ? new Date(t - 5 * 3600000).toISOString().slice(0, 7) : '';
};
const nombreNegocio = (n) => n?.sunat?.razonSocial || n?.negocio?.nombreComercial || (n?.ruc ? `RUC ${n.ruc}` : '');
const nombrePedidoNeg = (p) => p.negocio.nombreComercial || p.negocio.razonSocial || `RUC ${p.negocio.ruc}`;
const linkPedido = (p) => `/panel/pedidos/?ver=todos&abrir=${encodeURIComponent(p.id)}`;
const wa = (numero, texto = '') => `https://wa.me/51${String(numero || '').replace(/\D/g, '').slice(-9)}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
const marca = (si, texto = '') => (si ? `<span class="si" title="${esc(texto)}">✓</span>` : '<span class="no-tiene">—</span>');

// ---------- Datos ----------

async function todasLasCuentas(env) {
  const ids = [];
  let cursor;
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: 'influencer:', cursor });
    ids.push(...lote.keys.map((k) => k.name.slice('influencer:'.length)));
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor && ids.length < 300);
  return (await Promise.all(ids.slice(0, 300).map((id) => leerCuenta(env, id)))).filter(Boolean);
}

async function todosLosNegocios(env) {
  const claves = [];
  let cursor;
  do {
    const lote = await env.NEGOCIOS_KV.list({ prefix: 'negocio:', cursor });
    claves.push(...lote.keys);
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor && claves.length < 300);
  claves.sort((a, b) => String(b.metadata?.actualizado || '').localeCompare(String(a.metadata?.actualizado || '')));
  return (await Promise.all(claves.slice(0, 300).map((k) => env.NEGOCIOS_KV.get(k.name, 'json')))).filter(Boolean);
}

/** Estado de un creador en una palabra, con su color. */
function estadoCreador(c) {
  const i = identidadDe(c);
  if (c.activa === false) return ['pausado', 'Cuenta pausada'];
  if (i.estado === 'en-revision') return ['amarillo', 'Por revisar'];
  if (i.estado === 'rehacer') return ['gris', 'Rehaciendo'];
  if (i.estado === 'borrada') return ['gris', 'Borró su identidad'];
  if (i.estado !== 'aprobada') return ['gris', 'Registro a medias'];
  if (c.aceptaPedidos === false) return ['amarillo', 'Pausó sus pedidos'];
  return ['verde', 'Publicado'];
}

/** Qué le toca hacer a Tato en un pedido (si le toca). */
function queHacer(p) {
  switch (p.estado) {
    case 'solicitud': return 'Cotiza el precio';
    case 'guion': return p.guion?.estado === 'cambios' ? 'Ajusta el guion' : 'Escribe el guion';
    case 'video': return p.video?.estado === 'cambios' ? 'Ajusta el video' : 'Produce el video';
    case 'entrega': return 'Entrega el video final';
    case 'entregado': return `Págale a ${p.influencer.nombre}`;
    default: return '';
  }
}

/** Cifras de dinero de un pedido para Tato: lo cobrado, su parte y lo que falta pagarle al creador. */
function plataDe(env, p, cuenta, aj) {
  const c = cuentasDe(p, { metodo: metodoSaldo(env, cuenta), tasaMP: aj.tasaMP });
  const pagos = ['adelanto', 'saldo'].map((parte) => p.pagos?.[parte]).filter(Boolean);
  const cobrado = pagos.reduce((s, x) => s + Number(x.monto || 0), 0);
  const parteTato = pagos.reduce((s, x) => s + Number(x.parteTato || 0), 0);
  const ganaCreador = p.pagos?.saldo && c ? c.parteInfluencer : 0;
  const porPagarCreador = p.pagos?.saldo?.metodo === 'manual' && !p.pagoInfluencer && c ? c.parteInfluencer : 0;
  return { c, cobrado: r2(cobrado), parteTato: r2(parteTato), ganaCreador: r2(ganaCreador), porPagarCreador: r2(porPagarCreador), pagos };
}

function estadoConfig(env) {
  const correo = configCorreo(env);
  const whatsapp = configVerificacion(env).estado;
  const items = [
    [correo.listo, correo.listo ? `Correos: listos (${correo.via === 'cloudflare' ? 'Cloudflare' : 'Resend'})` : 'Correos: falta configurar (sin códigos ni avisos)'],
    [mpListo(env), mpListo(env) ? 'Mercado Pago: listo' : 'Mercado Pago: cobros a mano'],
    [Boolean(env.MEDIOS), env.MEDIOS ? 'Fotos y voz (R2): listo' : 'Fotos y voz (R2): falta activar'],
    [Boolean(env.RUC_API_TOKEN), env.RUC_API_TOKEN ? 'Consulta de RUC: lista' : 'Consulta de RUC: falta el token'],
    [whatsapp !== 'pendiente', whatsapp === 'activa' ? 'WhatsApp con código: activo' : whatsapp === 'inactiva' ? 'WhatsApp con código: apagado' : 'WhatsApp con código: faltan claves'],
    [Boolean(env.CORREO_TATO), env.CORREO_TATO ? 'Avisos para ti: activos' : 'Avisos para ti: sin CORREO_TATO'],
  ];
  return `<div class="estado-cfg" aria-label="Configuración">${items.map(([ok, t]) => `<span class="${ok ? 'bien' : 'falta'}">${esc(t)}</span>`).join('')}</div>`;
}

// ---------- /panel/ ----------

export async function handlePanelResumen(request, env, url) {
  const [pedidos, cuentasLista, negocios, aj, postulaciones] = await Promise.all([
    listarPedidos(env, () => true, 500), todasLasCuentas(env), todosLosNegocios(env), ajustes(env),
    env.PEDIDOS_KV.list({ prefix: 'postulacion:', limit: 100 }).then((l) => l.keys.length).catch(() => 0),
  ]);
  const cuentasPorId = new Map(cuentasLista.map((c) => [c.id, c]));
  const negPorRuc = new Map(negocios.map((n) => [n.ruc, n]));
  const mes = mesLima(new Date().toISOString());

  // Lo que te toca
  const creadoresRevisar = cuentasLista.filter((c) => identidadDe(c).estado === 'en-revision')
    .sort((a, b) => String(identidadDe(a).enviada || '').localeCompare(String(identidadDe(b).enviada || '')));
  const negociosRevisar = negocios.filter((n) => n.semaforo === 'amarillo');
  const pedidosTato = pedidos.filter((p) => turno(p) === 'tato').sort((a, b) => String(a.actualizado).localeCompare(String(b.actualizado)));
  const cobrosAMano = pedidos.filter((p) => { const x = pagoPendiente(p); return x && !x.link; });

  const cola = (items) => (items.length ? `<ul class="cola">${items.join('')}</ul>` : '<p class="vacio">Nada pendiente.</p>');
  const filaCola = (href, titulo, detalle, que) => `<li><span><a href="${esc(href)}">${esc(titulo)}</a> <span class="muted">${esc(detalle)}</span></span><span class="que">${esc(que)}</span></li>`;

  // Cifras
  let cobradoMes = 0, tatoMes = 0, porPagarCreadores = 0;
  const porMes = new Map();
  for (const p of pedidos) {
    const x = plataDe(env, p, cuentasPorId.get(p.influencer.id), aj);
    porPagarCreadores += x.porPagarCreador;
    for (const pago of x.pagos) {
      const m = mesLima(pago.fecha);
      porMes.set(m, (porMes.get(m) || 0) + Number(pago.monto || 0));
      if (m === mes) { cobradoMes += Number(pago.monto || 0); tatoMes += Number(pago.parteTato || 0); }
    }
  }
  const hoy = new Date(Date.now() - 5 * 3600000);
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 5 + i, 15));
    const m = d.toISOString().slice(0, 7);
    return { nombre: d.toLocaleDateString('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' }), monto: porMes.get(m) || 0 };
  });
  const topeMes = Math.max(1, ...meses.map((m) => m.monto));
  const porPaso = ACTIVOS.map((e) => [e, pedidos.filter((p) => p.estado === e).length]);
  const topePaso = Math.max(1, ...porPaso.map(([, n]) => n));
  const publicados = cuentasLista.filter((c) => estadoCreador(c)[0] === 'verde').length;

  // Actividad reciente
  const eventos = [];
  for (const p of pedidos) {
    for (const h of (p.historial || []).slice(-6)) {
      eventos.push([h.fecha, `${p.id} · ${h.quien === 'negocio' ? nombrePedidoNeg(p) : h.quien}: ${h.que}`, linkPedido(p)]);
    }
  }
  for (const n of negocios) {
    for (const h of (n.historial || []).slice(-3)) {
      eventos.push([h.fecha, `${nombreNegocio(n)}: ${h.por === 'registro' ? 'se registró' : `decisión de ${h.por}`} → ${ETIQUETA_NEG[h.semaforo] || h.semaforo}${h.nota ? ` (${h.nota})` : ''}`, `/panel/negocio/?ruc=${n.ruc}`]);
    }
  }
  for (const c of cuentasLista) {
    if (c.alta?.fecha) eventos.push([c.alta.fecha, `${c.nombre} creó su cuenta de creador`, `/panel/creador/?id=${c.id}`]);
    for (const h of (identidadDe(c).historial || []).slice(-3)) eventos.push([h.fecha, `${c.nombre}: ${h.que}`, `/panel/creador/?id=${c.id}`]);
  }
  eventos.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

  // Listas de creadores y negocios
  const statsCreador = (id) => {
    const suyos = pedidos.filter((p) => p.influencer.id === id);
    const c = cuentasPorId.get(id);
    return {
      activos: suyos.filter((p) => ACTIVOS.includes(p.estado)).length,
      entregados: suyos.filter((p) => p.estado === 'entregado').length,
      gana: suyos.reduce((s, p) => s + plataDe(env, p, c, aj).ganaCreador, 0),
    };
  };
  const statsNegocio = (ruc) => {
    const suyos = pedidos.filter((p) => p.negocio.ruc === ruc);
    return {
      activos: suyos.filter((p) => ACTIVOS.includes(p.estado)).length,
      total: suyos.length,
      pagado: suyos.reduce((s, p) => s + Number(p.pagos?.adelanto?.monto || 0) + Number(p.pagos?.saldo?.monto || 0), 0),
    };
  };
  const filasCreadores = cuentasLista
    .map((c) => ({ c, s: statsCreador(c.id), e: estadoCreador(c) }))
    .sort((a, b) => b.s.activos - a.s.activos || String(b.c.actualizada || '').localeCompare(String(a.c.actualizada || '')))
    .slice(0, 60)
    .map(({ c, s, e }) => `<tr><td><a href="/panel/creador/?id=${esc(c.id)}"><b>${esc(c.nombre)}</b></a><br><span class="muted">${c.alta ? 'Registro en línea' : 'Convenio'}${c.alta?.perfil?.region ? ` · ${esc(c.alta.perfil.region)}` : ''}</span></td>
      <td><span class="badge b-${e[0]}">${esc(e[1])}</span></td><td>${marca(correoDe(c), correoDe(c))}</td><td>${marca(telefonoConfirmado(c))}</td><td>${marca(c.mp?.accessToken)}</td>
      <td class="n">${s.activos}</td><td class="n">${s.entregados}</td><td class="n">${soles(s.gana)}</td></tr>`).join('');
  const filasNegocios = negocios.slice(0, 60).map((n) => {
    const s = statsNegocio(n.ruc);
    return `<tr><td><a href="/panel/negocio/?ruc=${esc(n.ruc)}"><b>${esc(nombreNegocio(n))}</b></a><br><span class="muted">RUC ${esc(n.ruc)}${n.codigo ? ` · ${esc(n.codigo)}` : ''}</span></td>
      <td><span class="badge b-${esc(n.semaforo)}">${esc(ETIQUETA_NEG[n.semaforo] || n.semaforo)}</span></td><td>${marca(n.contacto?.correoVerificado, n.contacto?.correo)}</td>
      <td class="n">${s.activos}</td><td class="n">${s.total}</td><td class="n">${soles(s.pagado)}</td></tr>`;
  }).join('');

  const avisos = [];
  if (url.searchParams.get('msg')) avisos.push(`<p class="notice">${esc(url.searchParams.get('msg'))}</p>`);

  const body = `${avisos.join('')}${estadoConfig(env)}
<div class="kpis">
  <a href="#te-toca"><span>Te toca</span><b>${creadoresRevisar.length + negociosRevisar.length + pedidosTato.length + cobrosAMano.length}</b><small>revisiones, pedidos y cobros</small></a>
  <a href="#creadores"><span>Creadores publicados</span><b>${publicados}</b><small>de ${cuentasLista.length} cuentas</small></a>
  <a href="#negocios"><span>Negocios verificados</span><b>${negocios.filter((n) => n.semaforo === 'verde').length}</b><small>de ${negocios.length} registros</small></a>
  <a href="/panel/pedidos/?ver=activos"><span>Pedidos en curso</span><b>${pedidos.filter((p) => ACTIVOS.includes(p.estado)).length}</b><small>${pedidos.filter((p) => p.estado === 'entregado').length} entregados</small></a>
  <div><span>Cobrado este mes</span><b>${soles(cobradoMes)}</b><small>tu parte: ${soles(tatoMes)}</small></div>
  <div><span>Por pagar a creadores</span><b>${soles(porPagarCreadores)}</b><small>cobros hechos a mano</small></div>
</div>
<section class="card" id="te-toca"><h2>Te toca</h2><div class="grid3">
  <div><h3>Creadores por revisar (${creadoresRevisar.length})</h3>${cola(creadoresRevisar.map((c) => filaCola(`/panel/creador/?id=${c.id}`, c.nombre, `envió ${fecha(identidadDe(c).enviada)}`, c.alta ? 'Revisa y publica' : 'Revisa su identidad')))}</div>
  <div><h3>Negocios por revisar (${negociosRevisar.length})</h3>${cola(negociosRevisar.map((n) => filaCola(`/panel/negocio/?ruc=${n.ruc}`, nombreNegocio(n), (n.motivos || [])[0] || '', 'Decide')))}</div>
  <div><h3>Pedidos (${pedidosTato.length})</h3>${cola(pedidosTato.slice(0, 15).map((p) => filaCola(linkPedido(p), `${p.id} · ${nombrePedidoNeg(p)}`, `con ${p.influencer.nombre}`, queHacer(p))))}</div>
</div>
${cobrosAMano.length ? `<h3>Cobros sin link de Mercado Pago (${cobrosAMano.length})</h3>${cola(cobrosAMano.map((p) => filaCola(linkPedido(p), `${p.id} · ${nombrePedidoNeg(p)}`, situacionNegocio(p), `Cobra el ${pagoPendiente(p).parte}`)))}` : ''}
${postulaciones ? `<p class="muted"><a href="/panel/postulaciones/">Postulaciones guardadas: ${postulaciones}${postulaciones >= 100 ? ' o más' : ''}</a></p>` : ''}
</section>
<div class="grid2">
  <section class="card"><h2>Pedidos por paso</h2><ul class="barras">${porPaso.map(([e, n]) => `<li><span>${esc(ESTADOS[e])}</span><i style="width:${(n / topePaso) * 100}%"></i><b>${n}</b></li>`).join('')}</ul></section>
  <section class="card"><h2>Cobrado por mes</h2><ul class="barras">${meses.map((m) => `<li><span>${esc(m.nombre)}</span><i style="width:${(m.monto / topeMes) * 100}%"></i><b>${m.monto ? Math.round(m.monto) : 0}</b></li>`).join('')}</ul><p class="muted">Adelantos y saldos pagados, en soles.</p></section>
</div>
<section class="card"><h2>Actividad reciente</h2>${eventos.length ? `<ul class="feed">${eventos.slice(0, 30).map(([f, t, href]) => `<li><time datetime="${esc(f)}">${esc(fecha(f))}</time><a href="${esc(href)}">${esc(t)}</a></li>`).join('')}</ul>` : '<p class="vacio">Todavía no hay movimiento.</p>'}</section>
<section class="card" id="creadores"><h2>Creadores</h2>${filasCreadores ? `<table class="lista-t"><thead><tr><th>Creador</th><th>Estado</th><th>Correo</th><th>WhatsApp</th><th>Mercado Pago</th><th class="n">En curso</th><th class="n">Entregados</th><th class="n">Ganó</th></tr></thead><tbody>${filasCreadores}</tbody></table>` : '<p class="vacio">Todavía no hay cuentas de creadores.</p>'}</section>
<section class="card" id="negocios"><h2>Negocios</h2>${filasNegocios ? `<table class="lista-t"><thead><tr><th>Negocio</th><th>Estado</th><th>Correo</th><th class="n">En curso</th><th class="n">Pedidos</th><th class="n">Pagó</th></tr></thead><tbody>${filasNegocios}</tbody></table>` : '<p class="vacio">Todavía no hay negocios registrados.</p>'}</section>`;
  return html(page('Resumen', body));
}

// ---------- Fichas ----------

function tablaPedidos(env, pedidos, cuentasPorId, aj, columna) {
  if (!pedidos.length) return '<p class="vacio">Sin pedidos todavía.</p>';
  return `<table class="lista-t"><thead><tr><th>Pedido</th><th>${columna === 'creador' ? 'Creador' : 'Negocio'}</th><th>Estado</th><th class="n">Precio</th><th class="n">Cobrado</th><th>Le toca a</th></tr></thead><tbody>${pedidos.map((p) => {
    const x = plataDe(env, p, cuentasPorId.get(p.influencer.id), aj);
    const t = turno(p);
    const otro = columna === 'creador'
      ? `<a href="/panel/creador/?id=${esc(p.influencer.id)}">${esc(p.influencer.nombre)}</a>`
      : `<a href="/panel/negocio/?ruc=${esc(p.negocio.ruc)}">${esc(nombrePedidoNeg(p))}</a>`;
    return `<tr><td><a href="${esc(linkPedido(p))}"><b>${esc(p.id)}</b></a><br><span class="muted">${esc(p.paquete.nombre)} · ${esc(fecha(p.creado, false))}</span></td><td>${otro}</td><td>${esc(ESTADOS[p.estado])}</td>
      <td class="n">${p.dinero.precio == null ? 'por cotizar' : soles(p.dinero.precio)}</td><td class="n">${soles(x.cobrado)}</td>
      <td>${t === 'tato' ? `<b>Ti</b>: ${esc(queHacer(p))}` : t === 'influencer' ? 'Al creador' : t === 'negocio' ? 'Al negocio' : '—'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

export async function handlePanelFichaNegocio(request, env, url) {
  const ruc = String(url.searchParams.get('ruc') || '').replace(/\D/g, '');
  const n = /^\d{11}$/.test(ruc) ? await env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json') : null;
  if (!n) return html(page('Ficha del negocio', '<p class="err">No encontré ese negocio.</p><p><a href="/panel/negocios/">← Negocios</a></p>'), 404);
  const [pedidos, aj] = await Promise.all([listarPedidos(env, (k) => k.metadata?.ruc === ruc, 200), ajustes(env)]);
  const cuentasPorId = new Map();
  for (const id of new Set(pedidos.map((p) => p.influencer.id))) cuentasPorId.set(id, await leerCuenta(env, id));
  const s = n.sunat || {};
  const pagado = pedidos.reduce((t, p) => t + plataDe(env, p, cuentasPorId.get(p.influencer.id), aj).cobrado, 0);
  const porPagar = pedidos.reduce((t, p) => t + Number(pagoPendiente(p)?.monto || 0), 0);
  const avisos = [];
  if (url.searchParams.get('msg')) avisos.push(`<p class="notice">${esc(url.searchParams.get('msg'))}</p>`);
  const body = `${avisos.join('')}<p><a href="/panel/negocios/">← Negocios</a></p>
<section class="card ficha"><div class="botones" style="margin-top:0"><span class="badge b-${esc(n.semaforo)}">${esc(ETIQUETA_NEG[n.semaforo] || n.semaforo)}</span>${n.codigo ? `<b>${esc(n.codigo)}</b>` : ''}</div>
<h2>${esc(nombreNegocio(n))}</h2>
<dl>
  <dt>RUC</dt><dd>${esc(n.ruc)}${s.estado ? ` · ${esc(s.estado)} · ${esc(s.condicion)}` : ''}</dd>
  ${n.negocio?.nombreComercial ? `<dt>Nombre comercial</dt><dd>${esc(n.negocio.nombreComercial)}</dd>` : ''}
  <dt>Actividad</dt><dd>${esc(s.actividad || '—')}</dd>
  <dt>Va a promocionar</dt><dd>${esc(n.negocio?.promociona || '—')}</dd>
  <dt>Web o redes</dt><dd>${esc(n.negocio?.redes || '—')}</dd>
  <dt>Contacto</dt><dd>${esc(n.contacto?.nombre)} · DNI ${esc(n.contacto?.dni)} · <a href="${esc(wa(n.contacto?.whatsapp))}" target="_blank" rel="noopener">WhatsApp ${esc(n.contacto?.whatsapp)}</a></dd>
  <dt>Correo</dt><dd>${n.contacto?.correo ? `${esc(n.contacto.correo)} · ${n.contacto.correoVerificado ? `verificado el ${esc(fecha(n.contacto.correoVerificado, false))} (entra a su portal)` : 'sin verificar (no puede entrar a su portal)'}` : 'Sin correo'}</dd>
  <dt>Registro</dt><dd>${esc(fecha(n.creado))} · última vez ${esc(fecha(n.actualizado))}</dd>
  ${n.motivos?.length ? `<dt>Motivos</dt><dd>${n.motivos.map(esc).join('<br>')}</dd>` : ''}
  ${n.notas?.length ? `<dt>Notas</dt><dd>${n.notas.map(esc).join('<br>')}</dd>` : ''}
  ${n.intentos?.length ? `<dt>Otros contactos</dt><dd>${n.intentos.map((x) => `${esc(fecha(x.fecha))}: ${esc(x.contacto.nombre)} · DNI ${esc(x.contacto.dni)} · ${esc(x.contacto.whatsapp)}`).join('<br>')}</dd>` : ''}
</dl>
<div class="botones"><a class="fuerte" href="/panel/vista/negocio/?ruc=${esc(n.ruc)}">Ver su portal como lo ve</a><a href="${esc(wa(n.contacto?.whatsapp, `Hola ${String(n.contacto?.nombre || '').split(' ')[0]}, te escribo de Tato Studio.`))}" target="_blank" rel="noopener">Escribirle por WhatsApp</a></div>
<form class="acciones" method="post" action="/panel/negocios/decidir"><input type="hidden" name="ruc" value="${esc(n.ruc)}"><input type="hidden" name="volver" value="ficha">
  <input name="nota" placeholder="Nota (opcional): qué revisaste" maxlength="300">
  <button class="ok" name="decision" value="aprobar">Aprobar</button><button class="no" name="decision" value="rechazar">No entra</button><button class="pausa" name="decision" value="pausar">Pausar</button></form>
</section>
<div class="kpis"><div><span>Pedidos</span><b>${pedidos.length}</b></div><div><span>En curso</span><b>${pedidos.filter((p) => ACTIVOS.includes(p.estado)).length}</b></div><div><span>Pagó</span><b>${soles(pagado)}</b></div><div><span>Por pagar ahora</span><b>${soles(porPagar)}</b></div></div>
<section class="card"><h2>Sus pedidos</h2>${tablaPedidos(env, pedidos, cuentasPorId, aj, 'creador')}</section>
${n.historial?.length ? `<section class="card"><h2>Historial del registro</h2><ul class="feed">${n.historial.slice().reverse().map((h) => `<li><time>${esc(fecha(h.fecha))}</time><span>${esc(ETIQUETA_NEG[h.semaforo] || h.semaforo)} · ${esc(h.por)}${h.nota ? ` · ${esc(h.nota)}` : ''}</span></li>`).join('')}</ul></section>` : ''}`;
  return html(page('Ficha del negocio', body));
}

export async function handlePanelFichaCreador(request, env, url) {
  const id = String(url.searchParams.get('id') || '');
  const c = await leerCuenta(env, id);
  if (!c) {
    const enCatalogo = (await catalogo(env)).find((i) => i.id === id);
    return html(page('Ficha del creador', `<p class="err">${enCatalogo ? `${esc(enCatalogo.nombre)} todavía no tiene cuenta: créala en <a href="/panel/influencers/">Influencers</a>.` : 'No encontré esa cuenta.'}</p><p><a href="/panel/">← Resumen</a></p>`), 404);
  }
  const [pedidos, aj, publicaciones] = await Promise.all([listarPedidos(env, (k) => k.metadata?.influencer === id, 200), ajustes(env), listarPublicaciones(env, id)]);
  const cuentasPorId = new Map([[id, c]]);
  const e = estadoCreador(c);
  const ident = identidadDe(c);
  let gana = 0, porPagarle = 0, parteTato = 0;
  for (const p of pedidos) {
    const x = plataDe(env, p, c, aj);
    gana += x.ganaCreador;
    porPagarle += x.porPagarCreador;
    parteTato += x.parteTato;
  }
  const perfil = c.alta?.perfil;
  const avisos = [];
  if (url.searchParams.get('msg')) avisos.push(`<p class="notice">${esc(url.searchParams.get('msg'))}</p>`);
  if (url.searchParams.get('err')) avisos.push(`<p class="err">${esc(url.searchParams.get('err'))}</p>`);
  const publico = c.alta ? `/influencers/perfil/${c.id}/` : `/influencers/${c.id}/`;
  const body = `${avisos.join('')}<p><a href="/panel/influencers/">← Influencers</a></p>
<section class="card ficha"><div class="botones" style="margin-top:0"><span class="badge b-${e[0]}">${esc(e[1])}</span><span class="muted">${c.alta ? `Registro en línea el ${esc(fecha(c.alta.fecha, false))}` : 'Cuenta creada por ti (convenio)'}</span></div>
<h2>${esc(c.nombre)}</h2>
<dl>
  <dt>ID</dt><dd><code>${esc(c.id)}</code></dd>
  <dt>Correo</dt><dd>${correoDe(c) ? `${esc(correoDe(c))} · verificado (entra con él y recibe avisos)` : c.correo ? `${esc(c.correo)} · sin verificar` : 'Sin correo'}</dd>
  <dt>WhatsApp</dt><dd><a href="${esc(wa(c.whatsapp))}" target="_blank" rel="noopener">${esc(c.whatsapp || '—')}</a> · ${telefonoConfirmado(c) ? 'verificado' : 'sin verificar'}</dd>
  <dt>Mercado Pago</dt><dd>${c.mp?.accessToken ? `${esc(c.mp.nombre || c.mp.userId)}${c.mp.nickname ? ` (${esc(c.mp.nickname)})` : ''} · vence ${esc(fecha(c.mp.vence, false))}` : 'Sin conectar: le pagas a mano'}</dd>
  <dt>Reparto</dt><dd>Tu parte ${esc(String(c.porcentajeTato ?? aj.porcentajeTato))} % del saldo${c.produccion ? ` · producción: ${Object.entries(c.produccion).map(([k, v]) => `${esc(k)} ${soles(v)}`).join(', ')}` : ''}</dd>
  ${perfil ? `<dt>Región</dt><dd>${esc(perfil.region)}</dd><dt>Red principal</dt><dd>${esc(perfil.redes)}</dd><dt>Su contenido</dt><dd>${esc(perfil.contenido)}</dd>` : ''}
  ${c.alta?.paquetes ? `<dt>Paquetes</dt><dd>${c.alta.paquetes.map((p) => `${esc(p.nombre)} ${soles(p.precio)}`).join(' · ')}</dd>` : ''}
  <dt>Último ingreso</dt><dd>${c.ultimoIngreso ? esc(fecha(c.ultimoIngreso)) : 'No entra todavía'}</dd>
  <dt>Recibe pedidos</dt><dd>${c.activa === false ? 'No: cuenta pausada' : c.aceptaPedidos === false ? 'No: los pausó él' : ident.estado === 'aprobada' ? 'Sí' : 'Todavía no: falta aprobar su identidad'}</dd>
</dl>
<div class="botones"><a class="fuerte" href="/panel/vista/creador/?id=${esc(c.id)}">Ver su cuenta como la ve</a>${ident.estado === 'aprobada' && c.activa !== false ? `<a href="${esc(publico)}" target="_blank" rel="noopener">Perfil público ↗</a>` : ''}<a href="/panel/influencers/?abrir=${esc(c.id)}#c-${esc(c.id)}">Editar cuenta y contraseña</a>${c.whatsapp ? `<a href="${esc(wa(c.whatsapp, `Hola ${c.nombre.split(' ')[0]}, te escribo de Tato Studio.`))}" target="_blank" rel="noopener">Escribirle por WhatsApp</a>` : ''}</div>
</section>
<section class="card"><h2>Identidad${c.alta ? ' y registro' : ''}</h2>${c.alta && ident.estado === 'en-revision' ? '<p class="muted">Al aprobar, su perfil sale en el catálogo y empieza a recibir solicitudes. Le avisamos por correo.</p>' : ''}${bloqueIdentidad(c, ident, true)}</section>
<div class="kpis"><div><span>En curso</span><b>${pedidos.filter((p) => ACTIVOS.includes(p.estado)).length}</b></div><div><span>Entregados</span><b>${pedidos.filter((p) => p.estado === 'entregado').length}</b></div><div><span>Ganó</span><b>${soles(gana)}</b></div><div><span>Por pagarle</span><b>${soles(porPagarle)}</b></div><div><span>Tu parte con él</span><b>${soles(parteTato)}</b></div><div><span>Publicaciones</span><b>${publicaciones.length}</b></div></div>
<section class="card"><h2>Sus pedidos</h2>${tablaPedidos(env, pedidos, cuentasPorId, aj, 'negocio')}</section>`;
  return html(page('Ficha del creador', body));
}

// ---------- Vista de lo que ve cada uno ----------

export async function handlePanelVista(request, env, url, path) {
  if (path === '/panel/vista/creador') {
    const id = String(url.searchParams.get('id') || '');
    const c = await leerCuenta(env, id);
    if (!c) return html(page('Ficha del creador', '<p class="err">No encontré esa cuenta.</p>'), 404);
    return respuesta(await paginaInicio(env, c, { vista: { quien: c.nombre, volver: `/panel/creador/?id=${id}` } }));
  }
  const ruc = String(url.searchParams.get('ruc') || '').replace(/\D/g, '');
  const n = /^\d{11}$/.test(ruc) ? await env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json') : null;
  if (!n) return html(page('Ficha del negocio', '<p class="err">No encontré ese negocio.</p>'), 404);
  return respuesta(await paginaInicioNegocio(env, { correo: n.contacto?.correo || 'sin correo', negocios: [n] }, { vista: { quien: nombreNegocio(n), volver: `/panel/negocio/?ruc=${ruc}` } }));
}

