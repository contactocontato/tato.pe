// Cuenta del influencer en tato.pe/cuenta/: entra con su ID y contraseña, ve las solicitudes de los
// negocios, acepta o no, aprueba cada guion y cada video, ve sus pagos y conecta su Mercado Pago.
// Las cuentas las crea Tato desde /panel/influencers/ cuando el convenio está firmado.

import reglas from '../src/data/negocios.json' with { type: 'json' };
import { esc } from './ui.js';
import {
  SCRIPT_CLAVE, aleatorio, claveCorrecta, cifrarClave, formatoClave, crearSesion, leerSesion, cerrarSesion,
  cerrarSesionesDe, mismoOrigen, contar, usos, borrarConteo,
} from './seguridad.js';
import {
  leerCuenta, guardarCuenta, leerPedido, listarPedidos, accionInfluencer, cuentasDe, metodoSaldo, ajustes, texto,
  ESTADOS, PASOS, ACTIVOS, turno, soles, idValido, identidadDe, SUBIDAS_ABIERTAS, actuacionesQueFaltan, subirActuacion,
} from './pedidos.js';
import { handleIdentidad } from './identidad.js';
import { servirArchivo } from './medios.js';
import { json } from './ui.js';
import { mpListo, urlConexion, canjearCodigo } from './mercadopago.js';
import { bloqueCodigoCuenta, comprobarCodigo, configVerificacion, telefonoConfirmado } from './verificacion.js';
import { filasPublicaciones, formPublicacion, guardarPublicacion, listarPublicaciones, METRICAS } from './publicaciones.js';
import { WHATSAPP_TATO, MENSAJES, fecha, fechaDia, multilinea, pagina, respuesta, ir } from './portal.js';

const RUBROS = Object.fromEntries(reglas.rubros.map((r) => [r.id, r.nombre]));

// ---------- Páginas ----------

function paginaEntrar(error) {
  return pagina({
    titulo: 'Tu cuenta',
    error,
    cuerpo: `<h1>Tu cuenta de <span class="fx">influencer</span></h1>
<p class="sub">Aquí ves las solicitudes de los negocios, apruebas cada guion y cada video, y ves tus pagos.</p>
<form class="caja" method="post" action="/cuenta/entrar" data-clave>
  <label for="id">Tu ID</label>
  <input id="id" name="id" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="60" placeholder="Te lo da Tato al crear tu cuenta">
  <label for="clave">Contraseña</label>
  <input id="clave" type="password" autocomplete="current-password" required data-hash="clave">
  <input type="hidden" name="clave">
  <p class="aviso err" data-aviso-clave hidden></p>
  <div class="acciones"><button class="btn fucsia" type="submit">Entrar</button></div>
  <noscript><p class="nota">Activa JavaScript para entrar: tu contraseña se prepara en tu navegador y nunca viaja tal cual.</p></noscript>
</form>
<p class="nota">¿Todavía no tienes cuenta? <a href="/influencers/unete/">Revisa los planes y crea tu cuenta</a>.</p>
<p class="nota">¿Olvidaste tu contraseña? <a href="https://wa.me/${WHATSAPP_TATO}?text=${encodeURIComponent('Hola Tato, olvidé la contraseña de mi cuenta de influencer.')}" target="_blank" rel="noopener">Escríbele a Tato por WhatsApp</a> y te da una nueva.</p>`,
  });
}

function paginaClave(cuenta, { obligatoria, error }) {
  return pagina({
    titulo: 'Contraseña',
    cuenta,
    error,
    cuerpo: `${obligatoria ? '' : '<a class="volver" href="/cuenta/">← Volver a tu cuenta</a>'}
<h1>${obligatoria ? 'Crea tu contraseña' : 'Cambia tu contraseña'}</h1>
<p class="sub">${obligatoria ? 'Entraste con una contraseña temporal. Cámbiala por una tuya para seguir.' : 'Al cambiarla se cierran tus otras sesiones.'}</p>
<form class="caja" method="post" action="/cuenta/clave" data-clave data-id="${esc(cuenta.id)}">
  <label for="actual">${obligatoria ? 'Contraseña temporal' : 'Contraseña actual'}</label>
  <input id="actual" type="password" autocomplete="current-password" required data-hash="actual"><input type="hidden" name="actual">
  <label for="nueva">Contraseña nueva</label>
  <input id="nueva" type="password" autocomplete="new-password" required data-hash="nueva" data-min="8" data-repetir="repetir"><input type="hidden" name="nueva">
  <label for="repetir">Repite la contraseña nueva</label>
  <input id="repetir" type="password" autocomplete="new-password" required>
  <p class="nota">Al menos 8 caracteres. Mejor una frase corta que solo tú recuerdes, y que no uses en otras apps.</p>
  <p class="aviso err" data-aviso-clave hidden></p>
  <div class="acciones"><button class="btn fucsia" type="submit">Guardar contraseña</button></div>
</form>`,
  });
}

/** Qué está pasando con el pedido, en una frase para el influencer. */
function situacion(p) {
  switch (p.estado) {
    case 'solicitud': return p.dinero.precio == null ? 'Tato está cotizando este pedido. Cuando tenga precio, podrás aceptarlo.' : 'Te toca: ¿aceptas este pedido?';
    case 'adelanto': return 'Aceptaste. Esperamos que el negocio pague el adelanto para empezar.';
    case 'guion':
      if (p.guion?.estado === 'pendiente') return 'Te toca: revisa el guion.';
      return p.guion?.estado === 'cambios' ? 'Tato está haciendo los cambios que pediste al guion.' : 'Tato está escribiendo el guion.';
    case 'video':
      if (p.video?.estado === 'pendiente') return 'Te toca: revisa el video.';
      return p.video?.estado === 'cambios' ? 'Tato está haciendo los cambios que pediste al video.' : 'Tato está produciendo el video.';
    case 'saldo': return 'Aprobaste el video. Esperamos que el negocio pague el saldo.';
    case 'entrega': return 'El negocio pagó. Tato le entrega el video final.';
    case 'entregado': return `Entregado el ${fecha(p.entregado || p.actualizado)}.`;
    case 'rechazado': return 'No aceptaste este pedido.';
    case 'cancelado': return 'Tato canceló este pedido.';
    default: return '';
  }
}

const MB = 1024 * 1024;

/** Audio y video del influencer actuando el guion. `requerido`: los pidió Tato y van antes de aprobar. */
function bloqueActuacion(p, requerido) {
  const base = `/cuenta/pedido/${esc(p.id)}/actuacion`;
  const pide = p.guion?.pideActuacion || {};
  const tipos = requerido ? ['audio', 'video'].filter((t) => pide[t]) : ['audio', 'video'];
  const actual = (t) => {
    const a = p.actuaciones?.[t];
    if (!a) return '';
    return t === 'audio'
      ? `<p class="nota">Tu audio (${esc(fecha(a.subido, true))}):</p><audio controls preload="none" src="${base}/audio?v=${encodeURIComponent(a.subido)}"></audio>`
      : `<p class="nota">Tu video (${esc(fecha(a.subido, true))}): <a href="${base}/video?v=${encodeURIComponent(a.subido)}" target="_blank" rel="noopener">míralo</a></p>`;
  };
  const partes = {
    audio: `<div class="actuacion"><h4>Audio</h4>
  <p class="nota">Lee el guion en voz alta como lo dirías tú: con tus pausas, tu ritmo y tus palabras.</p>
  <div class="grabadora" data-grabadora data-url="${base}/audio" data-min="3" data-max="180" data-recargar>
    <p class="tiempo" data-tiempo>0:00</p><div class="nivel" aria-hidden="true"><i></i></div>
    <div class="acciones"><button type="button" class="btn linea chico" data-grabar>${p.actuaciones?.audio ? 'Grabar de nuevo' : 'Grabar audio'}</button><button type="button" class="btn chico" data-detener hidden>Terminar</button><button type="button" class="btn fucsia chico" data-enviar hidden>Enviar audio</button></div>
    <audio controls data-escuchar hidden></audio><p class="estado-subida" data-estado role="status"></p>
    <div data-alterno hidden><label class="btn linea chico">Subir un audio<input class="sr-only" type="file" accept="audio/*" data-subir="audio" data-url="${base}/audio" data-max="${25 * MB}" data-recargar></label></div>
  </div>${actual('audio')}</div>`,
    video: `<div class="actuacion" data-caja><h4>Video</h4>
  <p class="nota">Grábate actuando el guion con el celular, de frente y con buena luz. Hasta 95 MB: si pesa más, grábalo en 720p.</p>
  <label class="btn linea chico">${p.actuaciones?.video ? 'Cambiar video' : 'Grabar o elegir video'}<input class="sr-only" type="file" accept="video/*" data-subir="video" data-url="${base}/video" data-max="${95 * MB}" data-muy-grande="El video pesa más de 95 MB. Grábalo en 720p o más corto." data-recargar></label>
  <div class="progreso"><i></i></div><p class="estado-subida" data-estado role="status"></p>${actual('video')}</div>`,
  };
  if (requerido) {
    return `<div class="caja toca"><h3>Tato te pide que actúes el guion</h3><p>Graba ${tipos.map((t) => (t === 'audio' ? 'un audio' : 'un video')).join(' y ')} actuándolo como lo harías tú. Así el video con IA suena y se mueve como tú.</p>${tipos.map((t) => partes[t]).join('')}</div>`;
  }
  return `<details class="caja"><summary>¿Quieres ayudar con tu voz o tus gestos? (opcional)</summary><p class="nota">Si subes un audio o un video actuando el guion, el video con IA se parece más a ti.</p>${partes.audio}${partes.video}</details>`;
}

const nombreNegocio = (p) => p.negocio.nombreComercial || p.negocio.razonSocial || `RUC ${p.negocio.ruc}`;

function tarjeta(p, c) {
  const toca = turno(p) === 'influencer';
  const parte = c ? `Tu parte: ${soles(c.parteInfluencer)}` : 'Precio por cotizar';
  return `<li><a class="ped${toca ? ' toca' : ''}" href="/cuenta/pedido/${esc(p.id)}/">
  <span class="chip${toca ? ' toca' : p.estado === 'entregado' ? ' ok' : ''}">${esc(toca ? 'Te toca' : ESTADOS[p.estado])}</span>
  <b>${esc(nombreNegocio(p))}</b>
  <span>${esc(situacion(p))}</span>
  <span class="meta">${esc(p.id)} · ${esc(p.paquete.nombre)} · ${esc(parte)}</span>
</a></li>`;
}

function estadoPago(p, c) {
  if (!p.pagos?.saldo) return ACTIVOS.includes(p.estado) ? 'Cuando el negocio pague el saldo' : '—';
  if (p.pagos.saldo.metodo === 'mercadopago') return `Te llegó a tu Mercado Pago el ${fecha(p.pagos.saldo.fecha)}`;
  return p.pagoInfluencer ? `Te pagamos el ${fecha(p.pagoInfluencer.fecha)} (operación ${p.pagoInfluencer.operacion})` : 'Por pagarte';
}

async function paginaInicio(env, cuenta, { aviso, error }) {
  const [pedidos, aj, publicaciones] = await Promise.all([
    listarPedidos(env, (k) => k.metadata?.influencer === cuenta.id, 300), ajustes(env), listarPublicaciones(env, cuenta.id),
  ]);
  const metodo = metodoSaldo(env, cuenta);
  const conCuentas = pedidos.map((p) => ({ p, c: cuentasDe(p, { metodo, tasaMP: aj.tasaMP }) }));
  const toca = conCuentas.filter(({ p }) => turno(p) === 'influencer');
  const curso = conCuentas.filter(({ p }) => ACTIVOS.includes(p.estado) && turno(p) !== 'influencer');
  const fin = conCuentas.filter(({ p }) => !ACTIVOS.includes(p.estado)).slice(0, 20);
  const cobrados = conCuentas.filter(({ p, c }) => p.pagos?.saldo && c);
  const pagados = cobrados.flatMap(({ p, c }) => p.pagoInfluencer
    ? [{ fecha: p.pagoInfluencer.fecha, monto: p.pagoInfluencer.monto }]
    : p.pagos.saldo.metodo === 'mercadopago' ? [{ fecha: p.pagos.saldo.fecha, monto: c.parteInfluencer }] : []);
  const porCobrar = cobrados.filter(({ p }) => p.pagos.saldo.metodo === 'manual' && !p.pagoInfluencer).reduce((s, { c }) => s + c.parteInfluencer, 0);
  const hoy = new Date();
  const mesPE = (f) => {
    const instante = Date.parse(f);
    return Number.isFinite(instante) ? new Date(instante - 5 * 3600000).toISOString().slice(0, 7) : '';
  };
  const fechaLocal = new Date(hoy.getTime() - 5 * 3600000);
  const meses = Array.from({ length: 6 }, (_, i) => {
    const fechaMes = new Date(Date.UTC(fechaLocal.getUTCFullYear(), fechaLocal.getUTCMonth() - 5 + i, 15));
    const mes = fechaMes.toISOString().slice(0, 7);
    const monto = pagados.filter((p) => mesPE(p.fecha) === mes).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    return { nombre: fechaMes.toLocaleDateString('es-PE', { month: 'short', timeZone: 'UTC' }), monto };
  });
  const tope = Math.max(1, ...meses.map((m) => m.monto));
  const serie = meses.map((m) => `<li><span>${soles(m.monto)}</span><div class="barra" style="--nivel:${Math.min(100, m.monto / tope * 100)}%"></div><b>${esc(m.nombre)}</b></li>`).join('');
  const alcance = METRICAS.map(([k, nombre]) => {
    const cifras = publicaciones.map((p) => p.metricas[k]).filter((n) => n != null);
    return `<div><b>${cifras.length ? new Intl.NumberFormat('es-PE').format(cifras.reduce((s, n) => s + n, 0)) : '—'}</b><span>${esc(nombre)}</span></div>`;
  }).join('');
  const lista = (items, vacio) => (items.length ? `<ul class="lista">${items.map(({ p, c }) => tarjeta(p, c)).join('')}</ul>` : `<p class="vacio">${vacio}</p>`);
  const pausado = cuenta.aceptaPedidos === false;
  const identidad = identidadDe(cuenta);
  const whatsappOk = telefonoConfirmado(cuenta);
  const telefono = cuenta.whatsapp || '';

  let mp;
  if (!mpListo(env)) {
    mp = '<p>Pronto vas a poder conectar tu Mercado Pago para cobrar tu parte al instante. Mientras tanto, Tato te paga por Yape o transferencia cuando el negocio paga el saldo.</p>';
  } else if (cuenta.mp?.accessToken) {
    mp = `<p>Conectada${cuenta.mp.nombre ? `: <b>${esc(cuenta.mp.nombre)}</b>` : ''}${cuenta.mp.nickname ? ` (${esc(cuenta.mp.nickname)})` : ''}, desde el ${esc(fecha(cuenta.mp.conectada))}.</p>
<p class="nota">Cuando un negocio paga el saldo, Mercado Pago descuenta su comisión, le pasa a Tato su parte y lo demás queda en tu cuenta.</p>
<form method="post" action="/cuenta/mercadopago/quitar" class="acciones"><button class="btn linea" type="submit">Quitar la conexión</button></form>`;
  } else {
    mp = `<p>Conecta tu cuenta de Mercado Pago para cobrar tu parte apenas el negocio paga el saldo. Mercado Pago divide el pago solo: tu parte queda en tu cuenta y la de Tato en la suya.</p>
<p class="nota">Sin conexión, Tato te paga por Yape o transferencia.</p>
<form method="post" action="/cuenta/mercadopago" class="acciones"><button class="btn fucsia" type="submit">Conectar mi Mercado Pago</button></form>`;
  }

  const filasPagos = cobrados.slice(0, 30).map(({ p, c }) => `<tr><td><a href="/cuenta/pedido/${esc(p.id)}/">${esc(nombreNegocio(p))}</a><br><span class="nota">${esc(p.id)}</span></td><td class="n">${soles(c.parteInfluencer)}</td><td>${esc(estadoPago(p, c))}</td></tr>`).join('');

  return pagina({
    titulo: 'Tu cuenta',
    cuenta,
    ancho: true,
    aviso,
    error,
    cuerpo: `<div class="estudio">
<nav class="estudio-nav" aria-label="Intranet de creadores"><strong>TATO / CREADORES</strong>
<a href="#resumen">Resumen</a><a href="#pedidos">Pedidos</a><a href="#ganancias">Ganancias</a><a href="#publicaciones">Publicaciones</a><a href="#perfil">Mi perfil</a></nav>
<div class="estudio-cuerpo">
<section id="resumen" class="estudio-hero"><p class="mono">INTRANET DE CREADORES</p>
<h1>Hola, <span>${esc(cuenta.nombre.split(' ')[0])}</span></h1>
<p>${identidad.estado === 'en-revision' ? 'Estamos revisando tus fotos y tu voz.' : pausado ? 'Tus pedidos están en pausa.' : 'Tu espacio para gestionar pedidos, ingresos y publicaciones.'}</p>
${cuenta.alta ? `<div class="acciones"><a class="btn fucsia chico" href="/influencers/perfil/${esc(cuenta.id)}/">Ver mi perfil público ↗</a></div>` : ''}
</section>
<div class="estudio-kpi">
  <div><span>Recibido este mes</span><b>${soles(meses.at(-1).monto)}</b></div>
  <div><span>Por cobrar</span><b>${soles(porCobrar)}</b></div>
  <div><span>Pedidos en curso</span><b>${toca.length + curso.length}</b></div>
  <div><span>Publicaciones registradas</span><b>${publicaciones.length}</b></div>
</div>
<section id="pedidos" class="estudio-seccion"><h2>Pedidos</h2><div class="estudio-doble"><div><h3>Te toca revisar <span class="chip toca">${toca.length}</span></h3>
${lista(toca, 'Nada por ahora. Cuando un negocio te envíe una solicitud o Tato te mande un guion o un video, aparece aquí.')}
</div><div><h3>En curso <span class="chip">${curso.length}</span></h3>
${lista(curso, 'No tienes pedidos en curso.')}
</div></div>
${fin.length ? `<h3>Historial reciente</h3>${lista(fin, '')}` : ''}
</section>
<section id="ganancias" class="estudio-seccion"><h2>Ganancias</h2>
<div class="caja"><h3>Pagos recibidos · últimos 6 meses</h3><ol class="grafico-pagos">${serie}</ol></div>
${filasPagos ? `<div class="caja tabla-scroll"><table class="pagos"><thead><tr><th>Pedido</th><th class="n">Tu parte</th><th>Estado</th></tr></thead><tbody>${filasPagos}</tbody></table></div>` : '<p class="vacio">Los pagos aparecen aquí cuando un negocio paga el saldo.</p>'}
<details class="caja"><summary>Medio de cobro</summary>${mp}</details>
</section>
<section id="publicaciones" class="estudio-seccion"><h2>Publicaciones y rendimiento</h2>
<p class="sub">Registra los enlaces desde un pedido entregado. Las cifras se suman con las métricas que se ingresaron en cada publicación.</p>
<div class="estudio-kpi">${alcance}</div>
${filasPublicaciones(publicaciones.slice(0, 30))}
</section>
<section id="perfil" class="estudio-seccion"><h2>Mi perfil y seguridad</h2>
<div class="estudio-doble">
<div class="caja"><p>${cuenta.alta ? 'Registro de fotos y voz completo.' : identidad.estado === 'aprobada' ? 'Aprobada: Tato ya tiene tus fotos y tu voz para tu hoja de personaje y tu voz con IA.' : 'En revisión: Tato está viendo tus fotos y tu voz.'}</p>
<div class="acciones"><a class="btn linea" href="/cuenta/identidad/">Ver mis fotos y mi voz</a></div></div>
<div class="caja"><h3>WhatsApp ${telefono ? `· ••• ${esc(telefono.slice(-3))}` : ''}</h3><p>${whatsappOk ? 'Número verificado.' : 'Número pendiente de verificación.'}</p>
${whatsappOk ? '' : '<a class="btn linea chico" href="/cuenta/telefono/">Verificar mi número</a>'}</div>
</div>
${cuenta.alta ? `<details class="caja"><summary>Editar mi ficha pública</summary>
<form method="post" action="/cuenta/perfil/">
<div class="publicacion-campos"><label>Nombre público<input type="text" name="nombre" value="${esc(cuenta.nombre)}" maxlength="80" required></label>
<label>Ciudad o región<input type="text" name="region" value="${esc(cuenta.alta.perfil.region)}" maxlength="80" required></label></div>
<label>Red principal<input type="text" name="redes" value="${esc(cuenta.alta.perfil.redes)}" maxlength="200" required></label>
<label>Qué contenido haces<textarea name="contenido" maxlength="500" required>${esc(cuenta.alta.perfil.contenido)}</textarea></label>
<div class="acciones"><button class="btn fucsia chico" type="submit">Guardar perfil</button></div></form></details>` : ''}
<div class="caja">
  <p>Tu ID de acceso <code style="overflow-wrap:anywhere">${esc(cuenta.id)}</code></p>
  <form method="post" action="/cuenta/pausa"><input type="hidden" name="pausa" value="${pausado ? 'no' : 'si'}">
    <p>${pausado ? 'Tus pedidos están en pausa.' : '¿Te vas de viaje o necesitas un descanso? Pausa tus pedidos y nadie podrá enviarte solicitudes nuevas. Los que ya están en curso siguen.'}</p>
    <div class="acciones"><button class="btn ${pausado ? 'fucsia' : 'linea'}" type="submit">${pausado ? 'Volver a recibir solicitudes' : 'Pausar mis pedidos'}</button><a class="btn linea" href="/cuenta/clave">Cambiar contraseña</a></div>
  </form>
</div></section></div></div>`,
  });
}

function filasCuentas(c, p) {
  const filas = [
    ['Precio del video', soles(c.precio)],
    ...(c.adelanto > 0 ? [['Producción: créditos de IA y edición (adelanto, para Tato)', `− ${soles(c.adelanto)}`], ['Saldo', soles(c.saldo)]] : []),
    ...(c.comisionMP > 0 ? [[`Comisión de Mercado Pago${c.real ? '' : ` (aprox. ${c.tasaMP} %)`}`, `− ${soles(c.comisionMP)}`], ['Queda', soles(c.neto)]] : []),
    [`Parte de Tato (${p.dinero.porcentajeTato} %)`, `− ${soles(c.parteTato)}`],
  ];
  return `<table class="plata">${filas.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}<tr class="tuyo"><td>Tu parte (${100 - p.dinero.porcentajeTato} %)</td><td>${soles(c.parteInfluencer)}</td></tr></table>`;
}

function paginaPedido(env, cuenta, p, aj, { aviso, error, publicaciones = [] }) {
  const metodo = metodoSaldo(env, cuenta);
  const c = cuentasDe(p, { metodo, tasaMP: aj.tasaMP });
  const n = p.negocio;
  const idx = (estado) => (estado === 'entrega' ? 5 : PASOS.findIndex(([k]) => k === estado));
  const actual = idx(p.estado);
  const pasos = ACTIVOS.includes(p.estado) || p.estado === 'entregado'
    ? `<ol class="pasos" aria-label="Pasos del pedido">${PASOS.map(([, nombre], i) => `<li class="${i < actual || p.estado === 'entregado' ? 'hecho' : i === actual ? 'ahora' : ''}"${i === actual && p.estado !== 'entregado' ? ' aria-current="step"' : ''}>${esc(nombre)}</li>`).join('')}</ol>`
    : '';
  const toca = turno(p) === 'influencer';
  const accion = `/cuenta/pedido/${esc(p.id)}/`;

  let bloque = `<div class="caja${toca ? ' toca' : ''}"><h3>${esc(situacion(p))}</h3>`;
  if (p.estado === 'solicitud' && p.dinero.precio != null) {
    bloque += `<p>Si aceptas, el negocio paga ${c.adelanto > 0 ? 'el adelanto y ' : ''}Tato escribe el guion. Antes de producir, apruebas el guion; antes de entregar, apruebas el video.</p>
<form method="post" action="${accion}" class="acciones"><input type="hidden" name="accion" value="aceptar"><button class="btn fucsia" type="submit">Acepto el pedido</button></form>
<details style="margin-top:14px"><summary>No acepto este pedido</summary>
<form method="post" action="${accion}"><input type="hidden" name="accion" value="rechazar">
<label for="motivo">¿Por qué? (opcional, solo lo ve Tato)</label><textarea id="motivo" name="comentario" maxlength="1000"></textarea>
<div class="acciones"><button class="btn linea" type="submit">No acepto</button></div></form></details>`;
  }
  for (const que of ['guion', 'video']) {
    const item = p[que];
    if (!item?.enviado || (p.estado !== que && item.estado !== 'aprobado')) continue;
    const titulo = que === 'guion' ? `Guion${item.version > 1 ? ` (versión ${item.version})` : ''}` : `Video${item.version > 1 ? ` (versión ${item.version})` : ''}`;
    const contenido = que === 'guion'
      ? `<div class="guion">${esc(item.texto)}</div>`
      : `<p><a class="btn linea" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Ver el video</a></p><p class="nota">Se abre en otra pestaña. Es una vista previa solo para ti: no la compartas.</p>`;
    if (p.estado === que && item.estado === 'pendiente') {
      const pedidas = que === 'guion' && Object.values(p.guion.pideActuacion || {}).some(Boolean);
      const falta = que === 'guion' ? actuacionesQueFaltan(p) : [];
      bloque += `<h3 style="margin-top:16px">${titulo}</h3>${contenido}
${item.comentarioAnterior ? `<p class="nota">Lo que pediste antes: ${esc(item.comentarioAnterior)}</p>` : ''}
${pedidas ? bloqueActuacion(p, true) : ''}
<form method="post" action="${accion}" class="acciones"><input type="hidden" name="accion" value="aprobar-${que}"><button class="btn fucsia" type="submit"${falta.length ? ' disabled' : ''}>Apruebo el ${que}</button></form>
${falta.length ? `<p class="nota">Para aprobar, primero sube tu ${esc(falta.join(' y tu '))}.</p>` : ''}
<details style="margin-top:14px"><summary>${que === 'guion' ? 'Proponer cambios' : 'Pedir cambios'}</summary>
<form method="post" action="${accion}"><input type="hidden" name="accion" value="cambios-${que}">
<label for="cambios-${que}">${que === 'guion' ? '¿Qué cambiarías o agregarías? Tato lo ajusta y te lo vuelve a mandar.' : '¿Qué cambiarías?'}</label><textarea id="cambios-${que}" name="comentario" required minlength="3" maxlength="1000"></textarea>
<div class="acciones"><button class="btn linea" type="submit">Mandar a Tato</button></div></form></details>`;
    } else {
      bloque += `<details style="margin-top:12px"><summary>${titulo}${item.estado === 'aprobado' ? ' · aprobado' : item.estado === 'cambios' ? ' · pediste cambios' : ''}</summary>${contenido}${item.comentario && item.estado === 'cambios' ? `<p class="nota">Lo que pediste: ${esc(item.comentario)}</p>` : ''}</details>`;
    }
  }
  if (p.motivo && ['rechazado', 'cancelado'].includes(p.estado)) bloque += `<p class="nota">Motivo: ${esc(p.motivo)}</p>`;
  bloque += '</div>';
  const pendienteConActuacion = p.estado === 'guion' && p.guion?.estado === 'pendiente' && Object.values(p.guion.pideActuacion || {}).some(Boolean);
  if (['guion', 'video'].includes(p.estado) && p.guion?.enviado && !pendienteConActuacion) bloque += bloqueActuacion(p, false);

  const alertas = p.alertas?.length
    ? `<p class="aviso ojo">Ojo: lo que quiere promocionar menciona ${esc(p.alertas.join(', '))}. Revísalo antes de aceptar.</p>`
    : '';
  const sunat = [n.sunat.estado, n.sunat.condicion].filter(Boolean).map((x) => x.toLowerCase()).join(' y ');
  let plata;
  if (!c) plata = '<p>El precio todavía no está definido: Tato lo cotiza con el negocio.</p>';
  else {
    const nota = c.real
      ? estadoPago(p, c)
      : c.metodo === 'mercadopago'
        ? 'El saldo se cobra con tu Mercado Pago: tu parte te llega ahí cuando el negocio paga.'
        : 'Tato te paga por Yape o transferencia cuando el negocio paga el saldo.';
    plata = `${filasCuentas(c, p)}<p class="nota">${esc(nota)}</p>`;
  }

  return pagina({
    titulo: `Pedido ${p.id}`,
    cuenta,
    aviso,
    error,
    cuerpo: `<a class="volver" href="/cuenta/">← Tus pedidos</a>
<h1>${esc(nombreNegocio(p))}</h1>
<p class="sub mono">${esc(p.id)} · ${esc(p.paquete.nombre)} · ${esc(ESTADOS[p.estado])}</p>
${pasos}
${alertas}
${bloque}
<h2>Qué quiere el negocio</h2>
<div class="caja"><dl class="datos">
  <dt>Promocionar</dt><dd>${esc(p.brief.promociona)}</dd>
  ${p.brief.detalle ? `<dt>Detalles</dt><dd>${multilinea(p.brief.detalle)}</dd>` : ''}
  ${p.brief.fecha ? `<dt>Para cuándo</dt><dd>${esc(fechaDia(p.brief.fecha))}</dd>` : ''}
  <dt>Paquete</dt><dd>${esc(p.paquete.nombre)}</dd>
  <dt>Entrega</dt><dd>${esc(p.paquete.entrega)}</dd>
  <dt>Uso del video</dt><dd>${esc(p.paquete.uso)}</dd>
</dl></div>
<h2>El negocio</h2>
<div class="caja"><dl class="datos">
  ${n.razonSocial ? `<dt>Razón social</dt><dd>${esc(n.razonSocial)}</dd>` : ''}
  ${n.nombreComercial ? `<dt>Nombre comercial</dt><dd>${esc(n.nombreComercial)}</dd>` : ''}
  <dt>RUC</dt><dd class="mono">${esc(n.ruc)}</dd>
  ${n.rubro ? `<dt>Rubro</dt><dd>${esc(RUBROS[n.rubro] || n.rubro)}</dd>` : ''}
  ${sunat ? `<dt>En SUNAT</dt><dd>${esc(sunat)}${n.sunat.actividad ? ` · ${esc(n.sunat.actividad)}` : ''}</dd>` : ''}
  <dt>Verificación</dt><dd>Verificado por Tato Studio${n.verificado ? ` el ${esc(fecha(n.verificado))}` : ''}</dd>
</dl><p class="nota">Tato habla con el negocio por ti: sus datos de contacto no se comparten.</p></div>
<h2>Las cuentas</h2>
<div class="caja">${plata}</div>
${p.estado === 'entregado' ? `<section id="publicaciones"><h2>Publicaciones del pedido</h2>
${filasPublicaciones(publicaciones, `/cuenta/pedido/${p.id}/publicaciones`)}
<div class="caja"><h3>Registrar un video publicado</h3>${formPublicacion(`/cuenta/pedido/${p.id}/publicaciones`)}</div></section>` : ''}
<details class="caja"><summary>Historial del pedido</summary><ol>${(p.historial || []).map((h) => `<li>${esc(fecha(h.fecha, true))} · ${esc(h.quien === 'negocio' ? 'El negocio' : h.quien)}: ${esc(h.que)}</li>`).join('')}</ol></details>`,
  });
}

// ---------- Rutas ----------

/** /cuenta, /cuenta/entrar, /cuenta/salir, /cuenta/clave, /cuenta/pausa, /cuenta/pedido/<id>, /cuenta/mercadopago[/quitar] */
export async function handleCuenta(request, env, url, path) {
  const post = request.method === 'POST';
  if (post && !mismoOrigen(request)) return ir('/cuenta/?e=origen');
  const aviso = MENSAJES[url.searchParams.get('m')] || '';
  const error = MENSAJES[url.searchParams.get('e')] || '';

  if (path === '/cuenta/entrar' && post) return entrar(request, env);
  if (path === '/cuenta/salir' && post) return ir('/cuenta/', await cerrarSesion(env, request));

  const sesion = await leerSesion(env, request);
  const cuenta = sesion ? await leerCuenta(env, sesion.id) : null;
  if (!cuenta || cuenta.activa === false) {
    if (path !== '/cuenta') return ir(`/cuenta/?e=${sesion ? 'pausada' : 'sesion'}`, sesion ? await cerrarSesion(env, request) : undefined);
    return respuesta(paginaEntrar(error));
  }

  if (path === '/cuenta/clave') {
    if (!post) return respuesta(paginaClave(cuenta, { obligatoria: cuenta.cambiarClave, error }));
    const form = await request.formData();
    const actual = String(form.get('actual') || '');
    const nueva = String(form.get('nueva') || '');
    if (!formatoClave(nueva)) return respuesta(paginaClave(cuenta, { obligatoria: cuenta.cambiarClave, error: 'Escribe tu contraseña nueva.' }), 400);
    if ((await contar(env, `clave:${cuenta.id}`, 900)) > 8) return respuesta(paginaClave(cuenta, { obligatoria: cuenta.cambiarClave, error: MENSAJES.espera }), 429);
    if (!(await claveCorrecta(actual, cuenta.clave))) return respuesta(paginaClave(cuenta, { obligatoria: cuenta.cambiarClave, error: MENSAJES['clave-mal'] }), 400);
    if (await claveCorrecta(nueva, cuenta.clave)) return respuesta(paginaClave(cuenta, { obligatoria: cuenta.cambiarClave, error: 'La contraseña nueva tiene que ser distinta de la actual.' }), 400);
    cuenta.clave = await cifrarClave(nueva);
    cuenta.cambiarClave = false;
    cuenta.claveCambiada = new Date().toISOString();
    await guardarCuenta(env, cuenta);
    await cerrarSesionesDe(env, cuenta.id, sesion.token);
    return ir('/cuenta/?m=clave-ok');
  }
  if (cuenta.cambiarClave) return post ? ir('/cuenta/clave') : respuesta(paginaClave(cuenta, { obligatoria: true, error }));

  if (path === '/cuenta/telefono') {
    const numero = cuenta.whatsapp || '';
    const estado = configVerificacion(env).estado;
    const confirmado = telefonoConfirmado(cuenta);
    let mensaje = '', desafio = '';
    if (post && !confirmado && estado === 'activa') {
      const form = await request.formData();
      desafio = form.get('desafio');
      mensaje = await comprobarCodigo(env, { numero, titular: `cuenta:${cuenta.id}`, desafio, codigo: form.get('codigo') });
      if (!mensaje) {
        const actual = await leerCuenta(env, cuenta.id);
        if (!actual || actual.activa === false || actual.whatsapp !== numero) return ir('/cuenta/telefono/');
        actual.whatsappVerificado = { numero, fecha: new Date().toISOString() };
        await guardarCuenta(env, actual);
        return ir('/cuenta/?m=telefono-ok#perfil');
      }
    }
    const bloque = confirmado ? '<p class="aviso">Tu WhatsApp está verificado.</p>'
      : estado === 'activa' && /^9\d{8}$/.test(numero) ? bloqueCodigoCuenta(numero, desafio)
        : '<p class="aviso ojo">El envío de códigos por WhatsApp aún no está disponible para tu cuenta.</p>';
    return respuesta(pagina({ titulo: 'Verificar WhatsApp', cuenta, error: mensaje, cuerpo: `<a class="volver" href="/cuenta/#perfil">← Mi perfil</a><h1>Verifica tu WhatsApp</h1>${bloque}` }), mensaje ? 400 : 200);
  }
  if (path === '/cuenta/perfil' && post && cuenta.alta) {
    const f = await request.formData();
    const nombre = texto(f.get('nombre'), 80).replace(/\s+/g, ' ');
    const region = texto(f.get('region'), 80).replace(/\s+/g, ' ');
    const redes = texto(f.get('redes'), 200).replace(/\s+/g, ' ');
    const contenido = texto(f.get('contenido'), 500);
    if (!nombre || !region || !redes || !contenido) return ir('/cuenta/?e=perfil-incompleto#perfil');
    cuenta.nombre = nombre;
    cuenta.alta.perfil = { region, redes, contenido };
    await guardarCuenta(env, cuenta);
    return ir('/cuenta/?m=perfil-ok#perfil');
  }

  // Antes de recibir pedidos, el influencer sube sus fotos y graba su voz (worker/identidad.js).
  if (path === '/cuenta/identidad' || path.startsWith('/cuenta/identidad/')) return handleIdentidad(request, env, url, path, cuenta, { aviso, error });
  if (path === '/cuenta' && !post && SUBIDAS_ABIERTAS.includes(identidadDe(cuenta).estado)) return ir('/cuenta/identidad/');

  const act = path.match(/^\/cuenta\/pedido\/(P-[A-Z2-9]{6})\/actuacion\/(audio|video)$/);
  if (act) {
    const p = await leerPedido(env, act[1]);
    if (!p || p.influencer.id !== cuenta.id) return post ? json({ error: 'No encontramos ese pedido.' }, 404) : new Response('No encontrado', { status: 404 });
    if (!post) return servirArchivo(env, request, p.actuaciones?.[act[2]]?.clave);
    const r = await subirActuacion(env, request, p, act[2], Math.round(Number(url.searchParams.get('segundos') || 0)));
    return r.error ? json({ error: r.error }, r.status || 400) : json({ ok: true });
  }

  if (path === '/cuenta' && !post) return respuesta(await paginaInicio(env, cuenta, { aviso, error }));

  if (path === '/cuenta/pausa' && post) {
    const form = await request.formData();
    cuenta.aceptaPedidos = form.get('pausa') !== 'si';
    await guardarCuenta(env, cuenta);
    return ir(`/cuenta/?m=${cuenta.aceptaPedidos ? 'pausa-off' : 'pausa-on'}`);
  }

  if (path === '/cuenta/mercadopago' && post) {
    if (!mpListo(env)) return ir('/cuenta/?m=mp-no');
    const state = aleatorio(24);
    await env.PEDIDOS_KV.put(`mpestado:${state}`, cuenta.id, { expirationTtl: 600 });
    return new Response(null, { status: 303, headers: { Location: urlConexion(env, state), 'Cache-Control': 'no-store' } });
  }
  if (path === '/cuenta/mercadopago/quitar' && post) {
    delete cuenta.mp;
    cuenta.mpHistorial = [...(cuenta.mpHistorial || []).slice(-9), { fecha: new Date().toISOString(), que: 'Quitó la conexión' }];
    await guardarCuenta(env, cuenta);
    return ir('/cuenta/?m=mp-quitado');
  }

  const m = path.match(/^\/cuenta\/pedido\/(P-[A-Z2-9]{6})$/);
  const publicacion = path.match(/^\/cuenta\/pedido\/(P-[A-Z2-9]{6})\/publicaciones$/);
  if (publicacion && post) {
    const p = await leerPedido(env, publicacion[1]);
    if (!p || p.influencer.id !== cuenta.id) return new Response('No encontramos ese pedido.', { status: 404 });
    const fallo = await guardarPublicacion(env, p, await request.formData(), 'creador');
    if (fallo) return respuesta(paginaPedido(env, cuenta, p, await ajustes(env), {
      error: fallo, publicaciones: await listarPublicaciones(env, cuenta.id, p.id),
    }), 400);
    return ir(`/cuenta/pedido/${p.id}/?m=publicacion-ok#publicaciones`);
  }
  if (m) {
    const p = await leerPedido(env, m[1]);
    if (!p || p.influencer.id !== cuenta.id) return respuesta(pagina({ titulo: 'No encontrado', cuenta, cuerpo: '<h1>No encontramos ese pedido</h1><p><a class="volver" href="/cuenta/">← Tus pedidos</a></p>' }), 404);
    if (post) {
      const form = await request.formData();
      const accion = String(form.get('accion') || '');
      const r = await accionInfluencer(env, p, accion, { comentario: form.get('comentario') });
      if (r.error) return respuesta(paginaPedido(env, cuenta, p, await ajustes(env), { error: r.error }), 400);
      const clave = { aceptar: 'aceptado', rechazar: 'rechazado' }[accion] || accion.split('-').reverse().join('-').replace('aprobar', 'ok');
      return ir(`/cuenta/pedido/${p.id}/?m=${clave}`);
    }
    const publicaciones = p.estado === 'entregado' ? await listarPublicaciones(env, cuenta.id, p.id) : [];
    return respuesta(paginaPedido(env, cuenta, p, await ajustes(env), { aviso, error, publicaciones }));
  }
  return respuesta(pagina({ titulo: 'No encontrado', cuenta, cuerpo: '<h1>Esta página no existe</h1><p><a class="volver" href="/cuenta/">← Tu cuenta</a></p>' }), 404);
}

async function entrar(request, env) {
  const form = await request.formData();
  const id = String(form.get('id') || '').trim().toLowerCase().replace(/^@/, '');
  const clave = String(form.get('clave') || '');
  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
  if (!idValido(id) || !formatoClave(clave)) return ir('/cuenta/?e=clave');
  if ((await usos(env, `entrar:${id}`)) >= 5 || (await contar(env, `entrar-ip:${ip}`, 3600)) > 30) return ir('/cuenta/?e=espera');
  const cuenta = await leerCuenta(env, id);
  if (!cuenta || !(await claveCorrecta(clave, cuenta.clave))) {
    await contar(env, `entrar:${id}`, 900);
    return ir('/cuenta/?e=clave');
  }
  if (cuenta.activa === false) return ir('/cuenta/?e=pausada');
  await borrarConteo(env, `entrar:${id}`);
  cuenta.ultimoIngreso = new Date().toISOString();
  await guardarCuenta(env, cuenta);
  return ir('/cuenta/', await crearSesion(env, request, id));
}

/** GET /api/mp/conectado?code=&state=: vuelve de Mercado Pago con el permiso del influencer. */
export async function handleMpConectado(request, env, url) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const id = state.length > 10 && state.length < 100 ? await env.PEDIDOS_KV.get(`mpestado:${state}`) : null;
  if (!id || !code) return ir('/cuenta/?m=mp-error');
  await env.PEDIDOS_KV.delete(`mpestado:${state}`);
  const sesion = await leerSesion(env, request);
  if (sesion && sesion.id !== id) return ir('/cuenta/?m=mp-error');
  const cuenta = await leerCuenta(env, id);
  if (!cuenta) return ir('/cuenta/?m=mp-error');
  try {
    const mp = await canjearCodigo(env, code);
    const yo = await fetch(`${(env.MP_API || 'https://api.mercadopago.com').replace(/\/+$/, '')}/users/me`, { headers: { Authorization: `Bearer ${mp.accessToken}` } })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    cuenta.mp = { ...mp, nombre: [yo.first_name, yo.last_name].filter(Boolean).join(' '), nickname: yo.nickname || '' };
    cuenta.mpHistorial = [...(cuenta.mpHistorial || []).slice(-9), { fecha: new Date().toISOString(), que: `Conectó la cuenta ${mp.userId}${yo.nickname ? ` (${yo.nickname})` : ''}` }];
    await guardarCuenta(env, cuenta);
    return ir('/cuenta/?m=mp-ok');
  } catch (e) {
    console.error('Mercado Pago: no se pudo conectar la cuenta de', id, e);
    return ir('/cuenta/?m=mp-error');
  }
}
