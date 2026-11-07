// Piezas compartidas de la cuenta del influencer (/cuenta/): la página con los colores de la marca,
// los mensajes cortos que se muestran después de cada acción y las respuestas HTML.

import { esc } from './ui.js';
import { SCRIPT_CLAVE } from './seguridad.js';
import { SCRIPT_MEDIOS } from './medios.js';

export const WHATSAPP_TATO = '51961662512'; // el mismo de src/lib/site.ts

export const MENSAJES = {
  clave: 'El correo o ID y la contraseña no coinciden.',
  espera: 'Probaste muchas veces. Espera 15 minutos o cambia tu contraseña con «¿Olvidaste tu contraseña?».',
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
  'identidad-enviada': 'Listo: le mandamos tus fotos y tu voz a Tato. Te avisa cuando las revise.',
  'alta-lista': 'Listo: mandaste tu registro. Tato revisa tus fotos, tu voz y tu ficha; cuando lo apruebe, tu perfil sale en el catálogo y te avisamos.',
  'correo-ok': 'Tu correo quedó verificado. Ya puedes entrar con él.',
  'correo-enviado': 'Te mandamos un código. Revisa tu correo (y la carpeta de spam).',
  'recuperada': 'Listo: tu contraseña nueva quedó guardada. Ya estás dentro.',
  codigo: 'El código no coincide o venció. Pide uno nuevo.',
  'telefono-ok': 'Tu número de WhatsApp quedó verificado.',
  'publicacion-ok': 'Se actualizó el registro de publicaciones.',
  'perfil-ok': 'Tu ficha pública quedó actualizada.',
  'perfil-incompleto': 'Completa los cuatro campos antes de guardar tu ficha.',
  'identidad-borrada': 'Borramos tus fotos y tu voz. Tato también borra tu hoja de personaje y tu voz clonada.',
};

export const fecha = (s, conHora = false) =>
  s ? new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric', ...(conHora ? { hour: 'numeric', minute: '2-digit' } : {}) }) : '';
export const fechaDia = (s) => (s ? new Date(`${s}T12:00:00-05:00`).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const multilinea = (s) => esc(s).replace(/\n/g, '<br>');

/**
 * La página de la cuenta. `vista` (solo desde el panel de Tato) muestra la página tal como la ve la persona,
 * con un aviso arriba y todo lo de abajo sin poder usarse (inert).
 */
export function pagina({ titulo, cuerpo, cuenta = null, aviso = '', error = '', ancho = false, vista = null, salir = '/cuenta/salir', inicio = '/cuenta/' }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)} · Tato Studio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#E9E4DD;--card:#F4F1EC;--line:#D3CCC1;--ink:#141414;--soft:#5B5B57;--fucsia:#E2037E;--fucsia-press:#C4036D;--fucsia-tinta:#B50265;--ok:#17602F;--ok-bg:#E3F1E6;--wait:#7A5600;--wait-bg:#FBF0CF;--sans:"Archivo","Helvetica Neue",Arial,sans-serif;--mono:"DM Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
[hidden]{display:none !important}
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
input[type=text],input[type=password],input[type=url],input[type=email],input[type=tel],input[type=date],input[type=number],input:not([type]),select,textarea{width:100%;min-height:48px;padding:10px 13px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font:inherit}
textarea{min-height:96px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:2px solid var(--fucsia);outline-offset:1px;border-color:transparent}
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
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.btn.chico{min-height:42px;padding:0 16px;font-size:15px}
label.btn:focus-within{outline:2px solid var(--fucsia);outline-offset:3px}
.fotos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.foto{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:grid;gap:8px;align-content:start}
.foto.hecha{border-color:var(--ok);box-shadow:inset 0 0 0 1px var(--ok)}
.foto.rehacer{border:2px solid var(--fucsia)}
.foto svg{width:48px;height:64px;fill:none;stroke:var(--soft);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.foto img.vista{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px;background:#DED8CF}
.foto h3{margin:0;font-size:1rem}
.foto p{margin:0;font-size:14px;color:var(--soft)}
.progreso{height:6px;background:#DED8CF;border-radius:99px;overflow:hidden}.progreso i{display:block;height:100%;width:0;background:var(--fucsia);transition:width .2s}
.estado-subida{font-size:14px;color:var(--ok);min-height:1.2em;margin:0}.estado-subida.err{color:#7A0A45}
.cuento{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:19px;line-height:1.65;margin-top:12px}
.cuento h3{font-size:1.15rem}
.codigo-voz{font:500 17px/1.4 var(--mono);background:var(--wait-bg);color:var(--wait);padding:10px 12px;border-radius:10px;margin:12px 0 0}
.consejos{font-size:15px;color:var(--soft);padding-left:20px;margin:10px 0}
.grabadora{display:grid;gap:10px;margin-top:12px}
.grabadora audio,.actuacion audio,.caja audio{width:100%;margin-top:6px}
.tiempo{font:500 30px/1 var(--mono);margin:0}
.nivel{height:10px;background:#DED8CF;border-radius:99px;overflow:hidden}.nivel i{display:block;height:100%;width:0;background:var(--ok);transition:width 80ms linear}
.check{display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-size:15px;font-weight:400}.check input{width:22px;height:22px;accent-color:var(--fucsia);flex:none;margin-top:1px}
.faltan{color:#7A0A45;font-size:15px;padding-left:20px}
.actuacion{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}.actuacion h4{margin:0 0 4px}
.ancho{max-width:1320px}
.estudio{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start}
.estudio-nav{position:sticky;top:76px;display:grid;gap:4px;padding:15px;background:var(--card);border:1px solid var(--line);border-radius:18px}
.estudio-nav strong{font:500 12px var(--mono);letter-spacing:.06em;padding:8px 9px;color:var(--soft)}
.estudio-nav a{padding:9px;border-radius:8px;text-decoration:none;font-weight:650;font-size:14px}.estudio-nav a:hover,.estudio-nav a:focus-visible{background:#E8D7E1}
.estudio-hero,.perfil-hero{background:radial-gradient(ellipse at 100% 0%,#531339 0,transparent 62%),#19171b;color:#fff;border-radius:22px;padding:clamp(22px,4vw,44px)}
.estudio-hero h1 span,.perfil-hero strong{color:#ff87c8}.estudio-hero .mono,.perfil-hero .mono{font-size:12px;letter-spacing:.13em;color:#efc7dc}
.estudio-hero p:last-child{margin-bottom:0}
.estudio-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
.estudio-kpi>div{padding:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;display:grid;gap:5px}
.estudio-kpi b{font-size:clamp(1.05rem,1.9vw,1.55rem);overflow-wrap:anywhere}.estudio-kpi span{font-size:13px;color:var(--soft)}
.estudio-seccion{scroll-margin-top:80px;margin-top:30px}.estudio-seccion>h2{font-size:1.65rem;margin:0 0 12px}.estudio-seccion>h3{margin-top:18px}
.estudio-doble,.publicacion-campos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.tabla-scroll{overflow-x:auto}
.grafico-pagos{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;list-style:none;padding:0;margin:16px 0 0}
.grafico-pagos li{display:grid;grid-template-rows:auto 65px auto;gap:4px;text-align:center;font:500 clamp(9px,1.15vw,13px)/1.2 var(--mono)}
.grafico-pagos .barra{position:relative;border-radius:8px;background:#e5dce3;overflow:hidden}
.grafico-pagos .barra::after{content:"";position:absolute;inset:auto 0 0;height:var(--nivel);background:var(--fucsia);border-radius:8px 8px 0 0}
.publicacion h3{margin:6px 0 0;overflow-wrap:anywhere}.publicacion .nota{margin:0 0 10px}
.metricas-publicacion{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0}
.metricas-publicacion div{padding:6px;border-top:1px solid var(--line)}.metricas-publicacion dt{font-size:12px;color:var(--soft)}.metricas-publicacion dd{margin:0;font-weight:800;overflow-wrap:anywhere}
.perfil-hero{margin-top:12px}.perfil-hero .presentacion{max-width:60ch;overflow-wrap:anywhere}.perfil-hero .sub{color:#efc7dc}
.perfil-paquetes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.perfil-paquetes .caja{margin:0;display:flex;flex-direction:column}.perfil-paquetes p{margin:5px 0}
.perfil-paquetes .precio{font-size:1.35rem;font-weight:800;color:var(--fucsia-tinta)}
.pedido-creador-cuerpo{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start}
.pedido-creador-cuerpo>.caja{margin-top:0}.pedido-creador-cuerpo select{appearance:auto}
.avance{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:16px}
.avance li{border-top:4px solid var(--line);padding-top:8px;display:grid;gap:2px;font-size:14px}.avance li span{color:var(--soft);font-size:13px}
.avance li.hecho{border-color:var(--ink)}.avance li.ahora{border-color:var(--fucsia)}.avance li.ahora b{color:var(--fucsia-tinta)}
.pendientes .aviso{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:space-between;align-items:center;margin:8px 0}
.negocio-ficha{display:grid;gap:6px;align-content:start}.negocio-ficha h3{margin:4px 0 0}.negocio-ficha .chip{justify-self:start}.negocio-ficha p{margin:0}
.codigo-negocio{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.codigo-negocio span{font-size:13px;color:var(--soft)}.codigo-negocio b{font-size:1.5rem;letter-spacing:.06em;color:var(--fucsia-tinta)}
.pago-pendiente{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.pago-pendiente p{margin:4px 0 0}
.hitos{margin:0;padding-left:20px;display:grid;gap:6px}
.estudio-hero .btn.linea{color:#fff;border-color:rgba(255,255,255,.55);background:transparent}.estudio-hero .btn.linea:hover{border-color:#fff}
.barra-avance{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:10px 0}.barra-avance i{display:block;height:100%;background:var(--fucsia);border-radius:99px}
.perfil-aviso{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:var(--fucsia)}.perfil-aviso>div{flex:1 1 320px}.perfil-aviso h2{margin:0 0 6px;font-size:1.25rem}.perfil-aviso p{margin:0}
.perfil-form h2{font-size:1.2rem;margin:22px 0 4px}.perfil-form h2:first-child{margin-top:0}
.perfil-form .dos{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.perfil-form fieldset{border:0;padding:0;margin:14px 0 4px}.perfil-form legend{font-weight:700;margin-bottom:8px}
.colores>div{display:flex;gap:10px;margin-bottom:8px}.colores input[type=color]{width:56px;height:44px;padding:2px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer}
.opciones{display:flex;flex-wrap:wrap;gap:8px 18px}.check{display:inline-flex;gap:8px;align-items:center;font-weight:400;margin:0}
.logo-form{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.logo-actual{width:110px;height:110px;border-radius:14px;border:1px dashed var(--line);display:grid;place-items:center;background:#fff;overflow:hidden;color:var(--soft);font-size:13px}.logo-actual img{max-width:100%;max-height:100%;object-fit:contain}
@media(max-width:600px){.perfil-form .dos{grid-template-columns:1fr}}
.vista-tato{position:sticky;top:0;z-index:9;background:var(--ink);color:#fff;padding:10px clamp(16px,4vw,32px);font:600 14px/1.4 var(--sans);display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between}
.vista-tato a{color:#fff}
@media(max-width:880px){.avance{grid-template-columns:1fr 1fr}}
@media(max-width:880px){.estudio{grid-template-columns:1fr;gap:14px}.estudio-nav{position:static;display:flex;flex-wrap:wrap;gap:2px}.estudio-nav strong{flex-basis:100%}}
@media(max-width:640px){.estudio-kpi,.metricas-publicacion{grid-template-columns:repeat(2,minmax(0,1fr))}.estudio-doble,.publicacion-campos,.pedido-creador-cuerpo,.perfil-paquetes{grid-template-columns:1fr}}
@media (max-width:520px){.tiles{grid-template-columns:1fr 1fr}.tiles div:last-child{grid-column:span 2}.pasos li{font-size:10px}dl.datos{grid-template-columns:1fr}dl.datos dt{margin-top:6px}}
</style></head><body>
${vista ? `<div class="vista-tato" role="note"><span>Vista de Tato: así ve ${esc(vista.quien)} su página. Aquí no se puede tocar nada.</span><a href="${esc(vista.volver)}">← Volver al panel</a></div>` : ''}
<div${vista ? ' inert' : ''}>
<header class="top"><a class="logo" href="${esc(inicio)}" aria-label="Tu cuenta en Tato Studio"><img src="/inicio/logo-tato-cabecera.webp" alt="Tato Studio" width="120" height="38"></a>
${cuenta ? `<div class="quien"><span>${esc(cuenta.nombre)}</span><form method="post" action="${esc(salir)}"><button type="submit">Salir</button></form></div>` : ''}</header>
<main${ancho ? ' class="ancho"' : cuenta ? '' : ' class="angosto"'}>
${aviso ? `<p class="aviso" role="status">${esc(aviso)}</p>` : ''}${error ? `<p class="aviso err" role="alert">${esc(error)}</p>` : ''}
${cuerpo}
</main>
</div>
${vista ? '' : `${SCRIPT_CLAVE}
${SCRIPT_MEDIOS}`}
</body></html>`;
}

export const respuesta = (htmlTexto, status = 200, extra = {}) =>
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
export const ir = (url, cookie) => new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
