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
  leerCuenta, guardarCuenta, leerPedido, listarPedidos, accionInfluencer, cuentasDe, metodoSaldo, ajustes,
  ESTADOS, PASOS, ACTIVOS, turno, soles, idValido,
} from './pedidos.js';
import { mpListo, urlConexion, canjearCodigo } from './mercadopago.js';

const WHATSAPP_TATO = '51961662512'; // el mismo de src/lib/site.ts
const RUBROS = Object.fromEntries(reglas.rubros.map((r) => [r.id, r.nombre]));

const MENSAJES = {
  clave: 'El ID o la contraseña no coinciden.',
  espera: 'Probaste muchas veces. Espera 15 minutos o pídele a Tato una contraseña nueva.',
  pausada: 'Tu cuenta está pausada. Escríbele a Tato.',
  sesion: 'Tu sesión se cerró. Vuelve a entrar.',
  origen: 'No pudimos confirmar que el envío venga de tato.pe. Recarga la página.',
  'clave-ok': 'Listo: tu contraseña nueva quedó guardada.',
  'clave-mal': 'La contraseña actual no es correcta.',
  aceptado: 'Aceptaste el pedido.',
  rechazado: 'Listo: no aceptaste el pedido.',
  'guion-ok': 'Aprobaste el guion. Tato empieza a producir.',
  'guion-cambios': 'Le mandamos tus cambios a Tato.',
  'video-ok': 'Aprobaste el video.',
  'video-cambios': 'Le mandamos tus cambios a Tato.',
  'pausa-on': 'Pausaste tus pedidos: los negocios no pueden enviarte solicitudes nuevas.',
  'pausa-off': 'Listo: vuelves a recibir solicitudes.',
  'mp-ok': 'Conectaste tu Mercado Pago.',
  'mp-quitado': 'Quitaste la conexión con tu Mercado Pago.',
  'mp-error': 'No se pudo conectar tu Mercado Pago. Inténtalo otra vez en unos minutos.',
  'mp-no': 'La conexión con Mercado Pago todavía no está disponible.',
};

// ---------- HTML ----------

const fecha = (s, conHora = false) =>
  s ? new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric', ...(conHora ? { hour: 'numeric', minute: '2-digit' } : {}) }) : '';
const fechaDia = (s) => (s ? new Date(`${s}T12:00:00-05:00`).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const multilinea = (s) => esc(s).replace(/\n/g, '<br>');

function pagina({ titulo, cuerpo, cuenta = null, aviso = '', error = '' }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)} · Tato Studio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#E9E4DD;--card:#F4F1EC;--line:#D3CCC1;--ink:#141414;--soft:#5B5B57;--fucsia:#E2037E;--fucsia-press:#C4036D;--fucsia-tinta:#B50265;--ok:#17602F;--ok-bg:#E3F1E6;--wait:#7A5600;--wait-bg:#FBF0CF;--sans:"Archivo","Helvetica Neue",Arial,sans-serif;--mono:"DM Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
:focus-visible{outline:2px solid var(--fucsia);outline-offset:3px}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px clamp(16px,4vw,32px);background:rgba(233,228,221,.94);border-bottom:1px solid var(--line)}
.top a.logo img{height:38px;width:auto;display:block}
.top .quien{display:flex;align-items:center;gap:12px;font:500 13px/1.2 var(--mono);color:var(--soft)}
.top button{background:none;border:0;padding:6px 0;font:500 13px/1.2 var(--mono);color:var(--ink);text-decoration:underline;cursor:pointer}
main{max-width:760px;margin:0 auto;padding:24px clamp(16px,4vw,32px) 72px}
main.angosto{max-width:480px}
h1{font-weight:900;font-stretch:112%;font-size:clamp(2.1rem,1.5rem+3vw,3.1rem);line-height:.95;letter-spacing:-.025em;margin:12px 0 8px;text-wrap:balance}
h2{font-weight:800;font-stretch:110%;font-size:1.3rem;letter-spacing:-.01em;margin:36px 0 12px}
h3{font-size:1.05rem;margin:0 0 8px}
.fx{color:var(--fucsia)}
.sub{color:var(--soft);margin:0;max-width:56ch}
.mono{font-family:var(--mono)}
.aviso{padding:12px 14px;border-radius:12px;margin:16px 0;background:var(--ok-bg);color:var(--ok);font-weight:600}
.aviso.err{background:#F3E1EA;color:#7A0A45}
.aviso.ojo{background:var(--wait-bg);color:var(--wait)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0 0}
.tiles div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.tiles b{display:block;font:500 clamp(1.15rem,1rem+1vw,1.5rem)/1.15 var(--mono)}
.tiles span{font-size:13px;color:var(--soft)}
.lista{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.ped{display:grid;gap:5px;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.ped:hover{border-color:var(--ink)}
.ped.toca{border-left:6px solid var(--fucsia)}
.ped b{font-size:1.05rem}
.ped .meta{font:400 13px/1.4 var(--mono);color:var(--soft)}
.chip{justify-self:start;font:500 12px/1 var(--mono);padding:5px 9px;border-radius:999px;background:#DED8CF;color:var(--ink)}
.chip.toca{background:var(--fucsia);color:#fff}
.chip.ok{background:var(--ok-bg);color:var(--ok)}
.vacio{color:var(--soft);background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:16px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;border:0;font:700 16px/1 var(--sans);cursor:pointer;text-decoration:none;background:var(--ink);color:#fff}
.btn.fucsia{background:var(--fucsia)}.btn.fucsia:hover{background:var(--fucsia-press)}
.btn.linea{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
.btn[disabled]{opacity:.6;cursor:wait}
form{margin:0}
label{display:block;font-weight:600;margin:14px 0 6px}
input[type=text],input[type=password],textarea{width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;background:#fff;font:inherit}
textarea{min-height:96px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--fucsia);outline-offset:1px;border-color:transparent}
.acciones{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center}
.caja{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:14px}
.caja.toca{border:2px solid var(--fucsia);background:#fff}
.caja > :first-child{margin-top:0}
.guion{white-space:pre-wrap;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:16px;margin:10px 0 0}
.pasos{list-style:none;padding:0;margin:22px 0 0;display:grid;grid-template-columns:repeat(6,1fr);gap:4px}
.pasos li{font:500 11px/1.2 var(--mono);color:var(--soft);padding-top:8px;border-top:4px solid var(--line)}
.pasos li.hecho{border-color:var(--ink);color:var(--ink)}
.pasos li.ahora{border-color:var(--fucsia);color:var(--fucsia-tinta);font-weight:700}
dl.datos{display:grid;grid-template-columns:minmax(110px,36%) 1fr;gap:6px 14px;margin:0}
dl.datos dt{color:var(--soft)}dl.datos dd{margin:0;overflow-wrap:anywhere}
table.plata{width:100%;border-collapse:collapse;font-size:15px}
table.plata td{padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}
table.plata td:last-child{text-align:right;font-family:var(--mono);white-space:nowrap;padding-left:12px}
table.plata tr.tuyo td{font-weight:700;font-size:17px;border-bottom:0}
table.pagos{width:100%;border-collapse:collapse;font-size:14px}
table.pagos th,table.pagos td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}
table.pagos td.n{text-align:right;font-family:var(--mono);white-space:nowrap}
.nota{font-size:14px;color:var(--soft);margin-top:8px}
details summary{cursor:pointer;font-weight:600}
details ol{padding-left:18px;font-size:14px;color:var(--soft)}
.volver{display:inline-block;margin-top:4px;font:500 14px/1.2 var(--mono);color:var(--soft)}
@media (max-width:520px){.tiles{grid-template-columns:1fr 1fr}.tiles div:last-child{grid-column:span 2}.pasos li{font-size:10px}dl.datos{grid-template-columns:1fr}dl.datos dt{margin-top:6px}}
</style></head><body>
<header class="top"><a class="logo" href="/cuenta/" aria-label="Tu cuenta en Tato Studio"><img src="/inicio/logo-tato-cabecera.webp" alt="Tato Studio" width="120" height="38"></a>
${cuenta ? `<div class="quien"><span>${esc(cuenta.nombre)}</span><form method="post" action="/cuenta/salir"><button type="submit">Salir</button></form></div>` : ''}</header>
<main${cuenta ? '' : ' class="angosto"'}>
${aviso ? `<p class="aviso" role="status">${esc(aviso)}</p>` : ''}${error ? `<p class="aviso err" role="alert">${esc(error)}</p>` : ''}
${cuerpo}
</main>
${SCRIPT_CLAVE}
</body></html>`;
}

const respuesta = (htmlTexto, status = 200, extra = {}) =>
  new Response(htmlTexto, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      ...extra,
    },
  });
const ir = (url, cookie) => new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });

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
  const [pedidos, aj] = await Promise.all([listarPedidos(env, (k) => k.metadata?.influencer === cuenta.id, 300), ajustes(env)]);
  const metodo = metodoSaldo(env, cuenta);
  const conCuentas = pedidos.map((p) => ({ p, c: cuentasDe(p, { metodo, tasaMP: aj.tasaMP }) }));
  const toca = conCuentas.filter(({ p }) => turno(p) === 'influencer');
  const curso = conCuentas.filter(({ p }) => ACTIVOS.includes(p.estado) && turno(p) !== 'influencer');
  const fin = conCuentas.filter(({ p }) => !ACTIVOS.includes(p.estado)).slice(0, 20);
  const cobrados = conCuentas.filter(({ p }) => p.pagos?.saldo);
  const mes = new Date().toISOString().slice(0, 7);
  const ganadoMes = cobrados.filter(({ p }) => String(p.pagos.saldo.fecha).slice(0, 7) === mes).reduce((s, { c }) => s + c.parteInfluencer, 0);
  const porCobrar = cobrados.filter(({ p }) => p.pagos.saldo.metodo === 'manual' && !p.pagoInfluencer).reduce((s, { c }) => s + c.parteInfluencer, 0);
  const lista = (items, vacio) => (items.length ? `<ul class="lista">${items.map(({ p, c }) => tarjeta(p, c)).join('')}</ul>` : `<p class="vacio">${vacio}</p>`);
  const pausado = cuenta.aceptaPedidos === false;

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
    aviso,
    error,
    cuerpo: `<h1>Hola, <span class="fx">${esc(cuenta.nombre.split(' ')[0])}</span></h1>
<p class="sub">${pausado ? 'Tus pedidos están en pausa: los negocios no pueden enviarte solicitudes nuevas.' : 'Estás recibiendo solicitudes de negocios verificados.'}</p>
<div class="tiles">
  <div><b>${toca.length}</b><span>Te toca revisar</span></div>
  <div><b>${soles(ganadoMes)}</b><span>Ganado este mes</span></div>
  <div><b>${soles(porCobrar)}</b><span>Por pagarte</span></div>
</div>
<h2>Te toca</h2>
${lista(toca, 'Nada por ahora. Cuando un negocio te envíe una solicitud o Tato te mande un guion o un video, aparece aquí.')}
<h2>En curso</h2>
${lista(curso, 'No tienes pedidos en curso.')}
${fin.length ? `<h2>Terminados</h2>${lista(fin, '')}` : ''}
<h2>Tus pagos</h2>
${filasPagos ? `<div class="caja"><table class="pagos"><thead><tr><th>Pedido</th><th class="n">Tu parte</th><th>Estado</th></tr></thead><tbody>${filasPagos}</tbody></table></div>` : '<p class="vacio">Aquí vas a ver lo que ganas con cada video.</p>'}
<h2>Mercado Pago</h2>
<div class="caja">${mp}</div>
<h2>Tu cuenta</h2>
<div class="caja">
  <form method="post" action="/cuenta/pausa"><input type="hidden" name="pausa" value="${pausado ? 'no' : 'si'}">
    <p>${pausado ? 'Tus pedidos están en pausa.' : '¿Te vas de viaje o necesitas un descanso? Pausa tus pedidos y nadie podrá enviarte solicitudes nuevas. Los que ya están en curso siguen.'}</p>
    <div class="acciones"><button class="btn ${pausado ? 'fucsia' : 'linea'}" type="submit">${pausado ? 'Volver a recibir solicitudes' : 'Pausar mis pedidos'}</button><a class="btn linea" href="/cuenta/clave">Cambiar contraseña</a></div>
  </form>
</div>`,
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

function paginaPedido(env, cuenta, p, aj, { aviso, error }) {
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
      bloque += `<h3 style="margin-top:16px">${titulo}</h3>${contenido}
${item.comentarioAnterior ? `<p class="nota">Lo que pediste antes: ${esc(item.comentarioAnterior)}</p>` : ''}
<form method="post" action="${accion}" class="acciones"><input type="hidden" name="accion" value="aprobar-${que}"><button class="btn fucsia" type="submit">Apruebo el ${que}</button></form>
<details style="margin-top:14px"><summary>Pedir cambios</summary>
<form method="post" action="${accion}"><input type="hidden" name="accion" value="cambios-${que}">
<label for="cambios-${que}">¿Qué cambiarías?</label><textarea id="cambios-${que}" name="comentario" required minlength="3" maxlength="1000"></textarea>
<div class="acciones"><button class="btn linea" type="submit">Mandar cambios a Tato</button></div></form></details>`;
    } else {
      bloque += `<details style="margin-top:12px"><summary>${titulo}${item.estado === 'aprobado' ? ' · aprobado' : item.estado === 'cambios' ? ' · pediste cambios' : ''}</summary>${contenido}${item.comentario && item.estado === 'cambios' ? `<p class="nota">Lo que pediste: ${esc(item.comentario)}</p>` : ''}</details>`;
    }
  }
  if (p.motivo && ['rechazado', 'cancelado'].includes(p.estado)) bloque += `<p class="nota">Motivo: ${esc(p.motivo)}</p>`;
  bloque += '</div>';

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
    return respuesta(paginaPedido(env, cuenta, p, await ajustes(env), { aviso, error }));
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
