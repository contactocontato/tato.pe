// Panel del negocio en tato.pe/negocio/: entra con su usuario y su contraseña (worker/cuenta-negocio.js),
// que elige después de registrar su negocio. Ve sus pedidos, lo que le toca pagar y en qué va cada video,
// completa el perfil de su marca y pide videos con la orden de servicio (worker/orden.js).
//
//   /negocio/                inicio (o la página para entrar)
//   /negocio/entrar          POST: usuario y contraseña; o un código al correo; o RUC + DNI + WhatsApp
//   /negocio/acceso/?t=      crear el usuario y la contraseña, o cambiar la contraseña
//   /negocio/clave           POST: pide cambiar la contraseña (ya dentro)
//   /negocio/salir           POST: cierra la sesión
//   /negocio/pedido/<id>/    un pedido
//   /negocio/pedir/<id>/     la orden de servicio para un influencer
//   /negocio/perfil/         el perfil de la marca
//
// La sesión es otra cookie (tato_negocio, ver worker/seguridad.js); en ella va el usuario.
// Al abrir el inicio, el código y el RUC de su negocio verificado quedan en el navegador (localStorage
// «tato-negocio», el mismo que usa el registro).

import { esc } from './ui.js';
import { crearSesionNegocio, leerSesionNegocio, cerrarSesionNegocio, mismoOrigen, contar } from './seguridad.js';
import { configCorreo, correoValido, correoOculto, pedirCodigo, comprobarCodigoCorreo } from './correo.js';
import { negociosDeCorreo, confirmarCorreoNegocios, negocioPorContacto, migrarIndiceCorreos, guardarNegocio } from './negocios.js';
import { handleAcceso, entrarConClave, cuentaDeRuc, tokenAcceso, leerCuentaNegocio, negociosDeCuenta } from './cuenta-negocio.js';
import { servirArchivo } from './medios.js';
import { handleOrden, duracion, paqueteCompleto } from './orden.js';
import { verStorytelling, CSS_STORY } from './storytelling.js';
import { leerPedido, listarPedidos, cuentas, soles, ESTADOS, PASOS, ACTIVOS, influencerPublicado } from './pedidos.js';
import { listarPublicaciones, METRICAS } from './publicaciones.js';
import { WHATSAPP_TATO, fecha, fechaDia, multilinea, pagina, respuesta, ir } from './portal.js';

const ETIQUETA = { verde: 'Verificado', amarillo: 'En revisión', rojo: 'No entra', pausado: 'En pausa' };
const nombreDe = (n) => n.sunat?.razonSocial || n.negocio?.nombreComercial || `RUC ${n.ruc}`;
const perfilDe = (p) => (/^creador-[0-9a-f]{32}$/.test(p.influencer.id) ? `/influencers/perfil/${p.influencer.id}/` : `/influencers/${p.influencer.id}/`);
const wa = (texto) => `https://wa.me/${WHATSAPP_TATO}?text=${encodeURIComponent(texto)}`;

const MENSAJES = {
  bienvenida: 'Listo: ya tienes tu acceso. Desde ahora entras con tu usuario y tu contraseña.',
  clave: 'Guardamos tu contraseña nueva.',
  sesion: 'Tu sesión se cerró. Vuelve a entrar.',
  origen: 'No pudimos confirmar que el envío venga de tato.pe. Recarga la página.',
  salir: 'Cerraste tu sesión.',
};

/** Las fotos de la orden de servicio (negocio y escenario), con la ruta que sirve cada archivo. */
export function fotosOrden(p, url) {
  const f = p.brief?.fotos;
  if (!f || !(f.negocio?.length || f.escenario?.length)) return '';
  const fila = (lista, titulo) => (lista?.length ? `<p class="nota">${titulo}</p><div class="fotos-fila" style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px">${lista.map((c) => `<a href="${esc(url(c))}" target="_blank" rel="noopener"><img src="${esc(url(c))}" alt="${esc(titulo)}" loading="lazy" style="width:110px;height:110px;object-fit:cover;border-radius:12px;border:1px solid #ddd;background:#fff"></a>`).join('')}</div>` : '');
  return `<h2>Fotos de la orden</h2><div class="caja">${fila(f.negocio, 'Negocio o producto')}${fila(f.escenario, 'Escenario')}</div>`;
}

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
  ${n.semaforo !== 'rojo' ? `<p><a href="/negocio/perfil/?ruc=${esc(n.ruc)}">Perfil de tu marca (${avancePerfil(n.perfil).join(' de ')})</a></p>` : ''}
</div>`;
}

// ---------- Perfil de la marca ----------
// Lo completa el negocio en /negocio/perfil/ y Tato lo ve en la ficha del negocio. Vive en el registro
// del negocio (NEGOCIOS_KV, campo «perfil»); el logo, en R2 (MEDIOS, privado) bajo negocios/<ruc>/.

export const OBJETIVOS = [['ventas', 'Vender más'], ['visitas', 'Que vayan a mi local'], ['seguidores', 'Ganar seguidores'], ['lanzamiento', 'Lanzar un producto'], ['marca', 'Que conozcan mi marca']];
export const PRESUPUESTOS = [['menos-300', 'Menos de S/ 300'], ['300-800', 'S/ 300 a S/ 800'], ['800-2000', 'S/ 800 a S/ 2,000'], ['mas-2000', 'Más de S/ 2,000'], ['no-digo', 'Prefiero no decirlo']];
const LOGO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const PERFIL_MENSAJES = { perfil: 'Guardamos el perfil de tu marca.' };

/** Guarda el logo en R2 (privado). Devuelve { clave } o { error }. */
async function guardarLogo(env, ruc, archivo) {
  if (!env.MEDIOS) return { error: 'Todavía no podemos guardar logos. Mándaselo a Tato por WhatsApp.' };
  const ext = LOGO[archivo.type];
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const firma = (datos[0] === 0x89 && datos[1] === 0x50) || (datos[0] === 0xff && datos[1] === 0xd8) || (datos[8] === 0x57 && datos[9] === 0x45 && datos[10] === 0x42 && datos[11] === 0x50);
  if (!ext || !firma || datos.length > 3 * 1024 * 1024) return { error: 'Sube tu logo en PNG, JPG o WEBP de hasta 3 MB.' };
  const clave = `negocios/${ruc}/logo-${crypto.randomUUID()}.${ext}`;
  await env.MEDIOS.put(clave, datos, { httpMetadata: { contentType: archivo.type } });
  return { clave };
}

/** Cuánto del perfil está completo: [hechos, total]. */
export function avancePerfil(perfil = {}) {
  const p = perfil || {};
  const items = [p.logo, p.colores?.length || p.sinColores, p.instagram || p.tiktok || p.facebook || p.web, p.direccion, p.horario, p.estrella, p.publico, p.objetivos?.length, p.presupuesto];
  return [items.filter(Boolean).length, items.length];
}

const texto = (f, k, max) => String(f.get(k) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const enlace = (v) => {
  const t = String(v || '').trim().slice(0, 200);
  if (!t) return '';
  if (/^@?[A-Za-z0-9._]{2,40}$/.test(t)) return t.startsWith('@') ? t : `@${t}`;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : '';
  } catch {
    return '';
  }
};

/** Lee el formulario del perfil. Devuelve { perfil } o { error }. */
export function leerPerfil(f, anterior = {}) {
  const colores = ['color1', 'color2', 'color3'].map((k) => String(f.get(k) || '').toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const usarColores = f.get('sinColores') !== '1';
  const perfil = {
    ...anterior,
    colores: usarColores ? [...new Set(colores)] : [],
    sinColores: !usarColores,
    instagram: enlace(f.get('instagram')),
    tiktok: enlace(f.get('tiktok')),
    facebook: enlace(f.get('facebook')),
    web: enlace(f.get('web')),
    direccion: texto(f, 'direccion', 200),
    horario: texto(f, 'horario', 160),
    estrella: texto(f, 'estrella', 600),
    publico: texto(f, 'publico', 600),
    objetivos: OBJETIVOS.map(([k]) => k).filter((k) => f.getAll('objetivos').includes(k)),
    presupuesto: PRESUPUESTOS.some(([k]) => k === f.get('presupuesto')) ? String(f.get('presupuesto')) : '',
    actualizado: new Date().toISOString(),
  };
  for (const k of ['instagram', 'tiktok', 'facebook', 'web']) {
    if (String(f.get(k) || '').trim() && !perfil[k]) return { error: `Revisa el enlace de ${k === 'web' ? 'tu web' : k[0].toUpperCase() + k.slice(1)}: pon tu @usuario o el link completo.` };
  }
  return { perfil };
}

function paginaPerfil(sesion, negocios, n, { error = '', aviso = '', vista = null, medios = false } = {}) {
  const p = n.perfil || {};
  const [hechos, total] = avancePerfil(p);
  const colores = p.colores?.length ? p.colores : [];
  const color = (i) => `<input type="color" name="color${i + 1}" value="${esc(colores[i] || ['#e2037e', '#141414', '#ffffff'][i])}" aria-label="Color ${i + 1}">`;
  const elegir = negocios.length > 1
    ? `<p class="nota">Negocio: ${negocios.map((x) => (x.ruc === n.ruc ? `<b>${esc(nombreDe(x))}</b>` : `<a href="/negocio/perfil/?ruc=${esc(x.ruc)}">${esc(nombreDe(x))}</a>`)).join(' · ')}</p>`
    : '';
  return pagina({
    titulo: 'Perfil de tu marca',
    cuenta: { nombre: n.contacto?.nombre || sesion.usuario },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    error,
    aviso,
    vista,
    cuerpo: `<a class="volver" href="/negocio/">← Tu panel</a>
<h1>Perfil de tu marca</h1>
<p class="sub">Con esto Tato y el influencer conocen tu negocio antes de escribir el guion, y no tienes que repetirlo en cada pedido. Llevas ${hechos} de ${total}.</p>
<div class="barra-avance" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${hechos}" aria-label="Perfil completo"><i style="width:${Math.round((hechos / total) * 100)}%"></i></div>
${elegir}
<form class="caja perfil-form" method="post" action="/negocio/perfil?ruc=${esc(n.ruc)}" enctype="multipart/form-data">
  <h2>Tu marca</h2>
  ${medios ? `<div class="logo-form">
    <div class="logo-actual">${p.logo ? `<img src="/negocio/logo?ruc=${esc(n.ruc)}&v=${esc(String(p.logo).slice(-12))}" alt="Logo de ${esc(nombreDe(n))}">` : '<span>Sin logo</span>'}</div>
    <div><label for="logo">${p.logo ? 'Cambiar tu logo' : 'Tu logo'}</label><input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp">
    <p class="nota">PNG, JPG o WEBP de hasta 3 MB. Mejor en PNG con fondo transparente.</p></div>
  </div>` : ''}
  <fieldset class="colores"><legend>Colores de tu marca</legend><div>${[0, 1, 2].map(color).join('')}</div>
  <label class="check"><input type="checkbox" name="sinColores" value="1"${p.sinColores ? ' checked' : ''}> Todavía no tengo colores definidos</label></fieldset>
  <div class="dos">
    <div><label for="instagram">Instagram</label><input id="instagram" name="instagram" type="text" autocapitalize="none" spellcheck="false" maxlength="200" placeholder="@tunegocio" value="${esc(p.instagram || '')}"></div>
    <div><label for="tiktok">TikTok</label><input id="tiktok" name="tiktok" type="text" autocapitalize="none" spellcheck="false" maxlength="200" placeholder="@tunegocio" value="${esc(p.tiktok || '')}"></div>
    <div><label for="facebook">Facebook</label><input id="facebook" name="facebook" type="text" autocapitalize="none" spellcheck="false" maxlength="200" placeholder="facebook.com/tunegocio" value="${esc(p.facebook || '')}"></div>
    <div><label for="web">Web</label><input id="web" name="web" type="text" autocapitalize="none" spellcheck="false" maxlength="200" placeholder="tunegocio.pe" value="${esc(p.web || '')}"></div>
  </div>
  <label for="direccion">Dirección de tu local</label><input id="direccion" name="direccion" type="text" maxlength="200" autocomplete="street-address" placeholder="Av. Luzuriaga 123, Huaraz" value="${esc(p.direccion || '')}">
  <label for="horario">Horario de atención</label><input id="horario" name="horario" type="text" maxlength="160" placeholder="Martes a domingo, de 11 a. m. a 5 p. m." value="${esc(p.horario || '')}">
  <label for="estrella">Tus productos o platos estrella</label><textarea id="estrella" name="estrella" maxlength="600" rows="3" placeholder="El ceviche mixto, la leche de tigre y el chicharrón de pescado.">${esc(p.estrella || '')}</textarea>
  <h2>Tu cliente y tu objetivo</h2>
  <label for="publico">¿A quién le vendes?</label><textarea id="publico" name="publico" maxlength="600" rows="3" placeholder="Familias de Huaraz que salen a almorzar el fin de semana y turistas que buscan comida de la zona.">${esc(p.publico || '')}</textarea>
  <fieldset><legend>¿Qué quieres lograr con tus videos?</legend><div class="opciones">${OBJETIVOS.map(([k, t]) => `<label class="check"><input type="checkbox" name="objetivos" value="${k}"${p.objetivos?.includes(k) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div></fieldset>
  <label for="presupuesto">¿Cuánto inviertes al mes en publicidad, más o menos?</label>
  <select id="presupuesto" name="presupuesto"><option value="">Elige una opción</option>${PRESUPUESTOS.map(([k, t]) => `<option value="${k}"${p.presupuesto === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
  <p class="nota">Es privado: solo lo ve Tato, para recomendarte el paquete que te conviene.</p>
  <div class="acciones"><button class="btn fucsia" type="submit">Guardar mi perfil</button></div>
</form>`,
  });
}

// ---------- Páginas ----------

function paginaEntrar({ paso = '', correo = '', desafio = '', error = '', aviso = '', listo = true, ruc = '', usuario = '', volver = '/negocio/' }) {
  const v = `<input type="hidden" name="volver" value="${esc(volver)}">`;
  let form;
  if (paso === 'codigo') {
    form = `<form class="caja" method="post" action="/negocio/entrar">
  <input type="hidden" name="paso" value="codigo"><input type="hidden" name="correo" value="${esc(correo)}"><input type="hidden" name="desafio" value="${esc(desafio)}">${v}
  <p>Si <b>${esc(correoOculto(correo))}</b> está registrado, le llegó un código de 6 números. Vence en 15 minutos.</p>
  <label for="codigo">Código</label>
  <input id="codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
  <div class="acciones"><button class="btn fucsia" type="submit">Entrar</button><a class="btn linea" href="/negocio/">Volver</a></div>
</form>`;
  } else {
    form = `<form class="caja" method="post" action="/negocio/entrar" data-clave data-prefijo="negocio-">
  <input type="hidden" name="paso" value="clave">${v}
  <label for="id">Tu usuario</label>
  <input id="id" name="id" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="30" value="${esc(usuario)}">
  <label for="clave">Tu contraseña</label>
  <input id="clave" type="password" autocomplete="current-password" required data-hash="clave"><input type="hidden" name="clave">
  <p class="aviso err" data-aviso-clave hidden></p>
  <div class="acciones"><button class="btn fucsia" type="submit">Entrar</button></div>
</form>
${listo ? `<details class="caja"${paso === 'correo' ? ' open' : ''}><summary><b>¿Olvidaste tu contraseña?</b> Entra con un código a tu correo</summary>
<form method="post" action="/negocio/entrar" style="margin-top:12px">
  <input type="hidden" name="paso" value="correo">${v}
  <label for="correo">El correo de tu negocio</label>
  <input id="correo" name="correo" type="email" autocomplete="email" required maxlength="160" value="${esc(correo)}">
  <p class="nota">Después cambias tu contraseña desde tu panel.</p>
  <div class="acciones"><button class="btn linea" type="submit">Mandarme el código</button></div>
</form></details>` : `<p class="nota">¿Olvidaste tu contraseña? <a href="${esc(wa('Hola Tato, olvidé la contraseña del panel de mi negocio.'))}" target="_blank" rel="noopener">Escríbele a Tato por WhatsApp</a> y te manda un enlace para crear otra.</p>`}
<details class="caja"${paso === 'ruc' ? ' open' : ''}><summary><b>¿Ya registraste tu negocio y no tienes usuario?</b> Créalo con tu RUC</summary>
<form method="post" action="/negocio/entrar" style="margin-top:12px">
  <input type="hidden" name="paso" value="ruc">${v}
  <p class="nota">Escribe los datos tal como los pusiste al registrarte. Después eliges tu usuario y tu contraseña.</p>
  <label for="ruc">RUC</label><input id="ruc" name="ruc" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" required value="${esc(ruc)}">
  <label for="dni">DNI de la persona de contacto</label><input id="dni" name="dni" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" required>
  <label for="whatsapp">WhatsApp que registraste</label><input id="whatsapp" name="whatsapp" type="tel" inputmode="tel" maxlength="15" required>
  <div class="acciones"><button class="btn linea" type="submit">Buscar mi negocio</button></div>
</form></details>`;
  }
  return pagina({
    titulo: 'Panel de tu negocio',
    error,
    aviso,
    inicio: '/negocio/',
    cuerpo: `<h1>El panel de tu <span class="fx">negocio</span></h1>
<p class="sub">Pide videos con influencers, aprueba tu storytelling, paga cada parte y mira en qué va cada video.</p>
${form}
<p class="nota">¿Todavía no registras tu negocio? <a href="/influencers/registro/">Regístralo con tu RUC</a> y crea tu usuario al terminar.</p>
<p class="nota">¿Eres creador? Tu cuenta está en <a href="/cuenta/">tato.pe/cuenta</a>.</p>`,
  });
}

/** Inicio del portal. `vista` la usa el panel de Tato para ver lo que ve el negocio. */
export async function paginaInicioNegocio(env, { usuario, negocios }, { aviso = '', error = '', vista = null } = {}) {
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
  const porCompletar = negocios.filter((n) => n.semaforo !== 'rojo').map((n) => [n, ...avancePerfil(n.perfil)]).find(([, h, t]) => h < t);
  const perfilCard = porCompletar
    ? `<section class="caja perfil-aviso"><div><h2>Completa el perfil de tu marca</h2><p>Llevas ${porCompletar[1]} de ${porCompletar[2]}. Con tu logo, tus colores, tus platos o productos estrella y a quién le vendes, Tato arma guiones que suenan a tu negocio.</p>
<div class="barra-avance" aria-hidden="true"><i style="width:${Math.round((porCompletar[1] / porCompletar[2]) * 100)}%"></i></div></div>
<a class="btn fucsia" href="/negocio/perfil/${negocios.length > 1 ? `?ruc=${esc(porCompletar[0].ruc)}` : ''}">${porCompletar[1] ? 'Seguir completando' : 'Completar mi perfil'}</a></section>`
    : '';
  const lista = (items, vacio) => (items.length ? `<ul class="lista">${items.map(tarjeta).join('')}</ul>` : `<p class="vacio">${vacio}</p>`);
  // Órdenes de servicio a medio armar (worker/orden.js)
  const borradores = vista ? [] : (await env.PEDIDOS_KV.list({ prefix: `orden:${usuario}:` })).keys.map((k) => k.name.split(':')[2]);
  const nombresInf = await Promise.all(borradores.map(async (id) => [id, (await influencerPublicado(env, id))?.nombre]));
  const enPreparacion = nombresInf.filter(([, nombre]) => nombre);
  return pagina({
    titulo: 'Tu panel',
    cuenta: { nombre: contacto || usuario },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    ancho: true,
    aviso,
    error,
    vista,
    cuerpo: `<section class="estudio-hero"><p class="mono">PANEL DE TU NEGOCIO</p>
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
${perfilCard}
${enPreparacion.length ? `<section class="estudio-seccion"><h2>Órdenes por terminar</h2><ul class="lista">${enPreparacion.map(([id, nombre]) => `<li><a class="ped toca" href="/negocio/pedir/${esc(id)}/"><span class="chip toca">Sin enviar</span><b>Video con ${esc(nombre)}</b><span>Sigue armando tu orden: tu idea, tus fotos y tu storytelling.</span></a></li>`).join('')}</ul></section>` : ''}
${toca.length ? `<section class="estudio-seccion"><h2>Te toca pagar</h2><ul class="lista">${toca.map((p) => `<li class="caja toca pago-pendiente"><div><b>${esc(p.id)} · Video con ${esc(p.influencer.nombre)}</b><p>${esc(situacionNegocio(p))}</p></div><div class="acciones">${botonPago(p)}<a class="btn linea chico" href="/negocio/pedido/${esc(p.id)}/">Ver el pedido</a></div></li>`).join('')}</ul></section>` : ''}
<section class="estudio-seccion"><h2>Pedidos en curso</h2>${lista(curso, verificado ? `No tienes ${toca.length ? 'otros ' : ''}pedidos en curso. Elige un influencer del catálogo para pedir un video.` : 'Cuando tu negocio esté verificado, pides videos desde el catálogo.')}</section>
${fin.length ? `<section class="estudio-seccion"><h2>Historial</h2>${lista(fin, '')}</section>` : ''}
<section class="estudio-seccion"><h2>${negocios.length === 1 ? 'Tu negocio' : 'Tus negocios'}</h2><div class="estudio-doble">${negocios.map(tarjetaNegocio).join('')}</div>
<p class="nota">Entras con tu usuario <b>${esc(usuario)}</b>. ¿Algún dato cambió? <a href="${esc(wa('Hola Tato, quiero actualizar los datos de mi negocio.'))}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>
${vista ? '' : '<form method="post" action="/negocio/clave"><button class="btn linea chico" type="submit">Cambiar mi contraseña</button></form>'}</section>
${recordar && !vista ? `<script>try{localStorage.setItem('tato-negocio',${JSON.stringify(JSON.stringify(recordar)).replace(/</g, '\\u003c')})}catch(e){}</script>` : ''}`,
  });
}

export async function paginaPedidoNegocio(env, sesion, p, { vista = null, aviso = '' } = {}) {
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
    aviso,
    cuenta: { nombre: p.negocio.contacto?.nombre || sesion.usuario },
    salir: '/negocio/salir',
    inicio: '/negocio/',
    vista,
    cuerpo: `<a class="volver" href="/negocio/">← Tu panel</a>
<h1>Video con ${esc(p.influencer.nombre)}</h1>
<p class="sub mono">${esc(p.id)} · ${esc(p.paquete.nombre)} · ${esc(ESTADOS[p.estado])}</p>
${pasos}
<div class="caja${pago ? ' toca' : ''}"><h3>${esc(situacionNegocio(p))}</h3>${pago ? `<div class="acciones">${botonPago(p)}</div>${pago.link ? '<p class="nota">Pagas con Mercado Pago, con los medios que te ofrezca al abrir el link. Cuando se confirma, el pedido avanza solo.</p>' : ''}` : ''}</div>
<h2>Lo que pediste</h2>
<div class="caja"><dl class="datos">
  <dt>Promocionar</dt><dd>${esc(p.brief.promociona)}</dd>
  ${p.brief.segundos ? `<dt>Duración</dt><dd>${esc(duracion({ segundos: p.brief.segundos, videos: p.brief.videos || 1 }))}</dd>` : ''}
  ${p.brief.detalle ? `<dt>${p.brief.tipo === 'guion' ? 'Tu guion' : p.brief.orden ? 'Tu idea' : 'Detalles'}</dt><dd>${multilinea(p.brief.detalle)}</dd>` : ''}
  ${p.brief.accion ? `<dt>Qué hace ${esc(p.influencer.nombre.split(' ')[0])}</dt><dd>${multilinea(p.brief.accion)}</dd>` : ''}
  ${p.brief.fecha ? `<dt>Para cuándo</dt><dd>${esc(fechaDia(p.brief.fecha))}</dd>` : ''}
  <dt>Influencer</dt><dd><a href="${esc(perfilDe(p))}">${esc(p.influencer.nombre)}</a></dd>
  <dt>Paquete</dt><dd>${esc(p.paquete.nombre)}</dd>
  <dt>Entrega</dt><dd>${esc(p.paquete.entrega)}</dd>
  <dt>Uso del video</dt><dd>${esc(p.paquete.uso)}</dd>
  <dt>Negocio</dt><dd>${esc(p.negocio.nombreComercial || p.negocio.razonSocial)} · RUC <span class="mono">${esc(p.negocio.ruc)}</span></dd>
</dl></div>
${p.brief.storytelling ? `<h2>Tu storytelling aprobado</h2><div class="caja"><style>${CSS_STORY}</style>${verStorytelling(p.brief.storytelling)}<p class="nota">El equipo creativo lo coordina contigo y escribe el guion final a partir de él.</p></div>` : ''}
${fotosOrden(p, (c) => `/negocio/archivo?clave=${encodeURIComponent(c)}`)}
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
  if (path === '/negocio/acceso') return handleAcceso(request, env, url);
  if (path === '/negocio/entrar') {
    if (!post) return ir('/negocio/');
    const f = await request.formData();
    const paso = String(f.get('paso') || '');
    const volver = /^\/negocio\/[A-Za-z0-9/_?=&.-]*$/.test(String(f.get('volver') || '')) ? String(f.get('volver')) : '/negocio/';
    const correo = correoValido(f.get('correo'));
    const desafio = String(f.get('desafio') || '');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    /** Ya probó que el negocio es suyo: entra a su cuenta, o crea su acceso si todavía no tiene. */
    const adentro = async (regs, nombre, correoOk) => {
      for (const n of regs) {
        const usuario = await cuentaDeRuc(env, n.ruc);
        if (usuario) return ir(volver, await crearSesionNegocio(env, request, usuario));
      }
      const t = await tokenAcceso(env, { modo: 'crear', rucs: regs.map((n) => n.ruc), nombre, correo: correoOk });
      return ir(`/negocio/acceso/?t=${t}&volver=${encodeURIComponent(volver)}`);
    };

    if (paso === 'clave') {
      const r = await entrarConClave(env, request, f.get('id'), String(f.get('clave') || ''));
      if (r.error) return respuesta(paginaEntrar({ listo, usuario: String(f.get('id') || ''), volver, error: r.error }), 400);
      return ir(volver, await crearSesionNegocio(env, request, r.usuario));
    }
    if (paso === 'codigo') {
      if (!listo) return ir('/negocio/');
      const r = await comprobarCodigoCorreo(env, { desafio, codigo: f.get('codigo'), correo, proposito: 'entrar-negocio', titular: `negocio:${correo}` });
      if (r.error) return respuesta(paginaEntrar({ paso: 'codigo', correo, desafio, volver, error: r.error }), 400);
      await confirmarCorreoNegocios(env, correo); // si lo escribió al registrarse y nunca lo confirmó, ya quedó confirmado
      const regs = await negociosDeCorreo(env, correo);
      if (!regs.length) return respuesta(paginaEntrar({ listo, volver, error: 'Ese correo no tiene un negocio registrado.' }), 404);
      return adentro(regs, regs[0].contacto?.nombre || '', correo);
    }
    if (paso === 'correo') {
      if (!listo) return ir('/negocio/');
      if (!correo) return respuesta(paginaEntrar({ paso: 'correo', listo, volver, error: 'Revisa tu correo: parece que le falta algo.' }), 400);
      await migrarIndiceCorreos(env); // una sola vez: los negocios registrados antes del panel
      const tiene = (await negociosDeCorreo(env, correo, { todos: true })).length > 0;
      const r = await pedirCodigo(env, request, { correo, proposito: 'entrar-negocio', titular: `negocio:${correo}`, enviar: tiene });
      if (r.error) return respuesta(paginaEntrar({ paso: 'correo', listo, correo, volver, error: r.error }), r.status || 400);
      return respuesta(paginaEntrar({ paso: 'codigo', correo, desafio: r.desafio, volver }));
    }
    if (paso === 'ruc') {
      const ruc = String(f.get('ruc') || '').replace(/\D/g, '');
      if ((await contar(env, `negocio-ruc-ip:${ip}`, 3600)) > 10 || (await contar(env, `negocio-ruc:${ruc}`, 3600)) > 5) {
        return respuesta(paginaEntrar({ paso: 'ruc', listo, ruc, volver, error: 'Probaste muchas veces. Vuelve a intentarlo en una hora o escríbenos por WhatsApp.' }), 429);
      }
      const n = await negocioPorContacto(env, { ruc, dni: f.get('dni'), whatsapp: f.get('whatsapp') });
      if (!n) return respuesta(paginaEntrar({ paso: 'ruc', listo, ruc, volver, error: 'Esos datos no coinciden con un negocio registrado. Revísalos o escríbenos por WhatsApp.' }), 404);
      const usuario = await cuentaDeRuc(env, n.ruc);
      if (usuario) return respuesta(paginaEntrar({ listo, usuario, volver, error: `Tu negocio ya tiene acceso con el usuario «${usuario}». Entra con él${listo ? ' o pide un código a tu correo si olvidaste la contraseña' : ''}.` }), 409);
      return adentro([n], n.contacto?.nombre || '', n.contacto?.correoVerificado ? n.contacto.correo : '');
    }
    return ir('/negocio/');
  }

  const sesion = await leerSesionNegocio(env, request);
  const cuentaNeg = sesion?.usuario ? await leerCuentaNegocio(env, sesion.usuario) : null;
  const negocios = await negociosDeCuenta(env, cuentaNeg);
  const volverAqui = `${path}/${url.search}`.replace(/\/\/$/, '/');

  if (!cuentaNeg || !negocios.length) {
    if (path !== '/negocio') return ir(`/negocio/?volver=${encodeURIComponent(volverAqui)}`, sesion ? await cerrarSesionNegocio(env, request) : undefined);
    const volver = /^\/negocio\/[A-Za-z0-9/_?=&.-]*$/.test(url.searchParams.get('volver') || '') ? url.searchParams.get('volver') : '/negocio/';
    return respuesta(paginaEntrar({ listo, volver, error: MENSAJES[url.searchParams.get('e')] || '', aviso: MENSAJES[url.searchParams.get('m')] || '' }), 200, sesion ? { 'Set-Cookie': await cerrarSesionNegocio(env, request) } : undefined);
  }
  sesion.cuenta = cuentaNeg;

  if (path === '/negocio/clave' && post) {
    const t = await tokenAcceso(env, { modo: 'cambiar', usuario: cuentaNeg.usuario });
    return ir(`/negocio/acceso/?t=${t}`);
  }

  if (path === '/negocio' && !post) {
    return respuesta(await paginaInicioNegocio(env, { usuario: cuentaNeg.usuario, negocios }, { aviso: MENSAJES[url.searchParams.get('m')] || PERFIL_MENSAJES[url.searchParams.get('m')] || '' }));
  }

  const pedir = path.match(/^\/negocio\/pedir\/([a-z0-9-]{2,80})$/);
  if (pedir) return handleOrden(request, env, url, { cuenta: cuentaNeg, negocios, influencerId: pedir[1] });
  if (path === '/negocio/archivo') {
    // Fotos que subió el negocio (logo y fotos de sus órdenes): solo las de sus propios RUC.
    const clave = String(url.searchParams.get('clave') || '');
    const ok = /^negocios\/\d{11}\/[A-Za-z0-9.-]+$/.test(clave) && negocios.some((n) => clave.startsWith(`negocios/${n.ruc}/`));
    return ok ? servirArchivo(env, request, clave) : new Response('No encontrado', { status: 404 });
  }

  if (path === '/negocio/perfil' || path === '/negocio/logo') {
    const n = negocios.find((x) => x.ruc === url.searchParams.get('ruc')) || negocios.find((x) => x.semaforo !== 'rojo') || negocios[0];
    if (path === '/negocio/logo') return n?.perfil?.logo ? servirArchivo(env, request, n.perfil.logo) : new Response('No encontrado', { status: 404 });
    if (!post) return respuesta(paginaPerfil(sesion, negocios, n, { medios: Boolean(env.MEDIOS), aviso: PERFIL_MENSAJES[url.searchParams.get('m')] || '' }));

    if (Number(request.headers.get('Content-Length') || 0) > 3.4 * 1024 * 1024) return respuesta(paginaPerfil(sesion, negocios, n, { medios: Boolean(env.MEDIOS), error: 'Tu logo pesa más de 3 MB. Prueba con uno más liviano.' }), 413);
    const f = await request.formData();
    const actual = await env.NEGOCIOS_KV.get(`negocio:${n.ruc}`, 'json');
    const r = leerPerfil(f, actual.perfil || {});
    const archivo = f.get('logo');
    if (!r.error && archivo && typeof archivo.arrayBuffer === 'function' && archivo.size > 0) {
      const logo = await guardarLogo(env, n.ruc, archivo);
      if (logo.error) r.error = logo.error;
      else {
        if (actual.perfil?.logo) await env.MEDIOS.delete(actual.perfil.logo);
        r.perfil.logo = logo.clave;
      }
    }
    if (r.error) return respuesta(paginaPerfil(sesion, negocios, { ...n, perfil: { ...(n.perfil || {}), ...Object.fromEntries(['direccion', 'horario', 'estrella', 'publico'].map((k) => [k, texto(f, k, 600)])) } }, { medios: Boolean(env.MEDIOS), error: r.error }), 400);
    actual.perfil = r.perfil;
    await guardarNegocio(env, actual);
    const [h, t] = avancePerfil(actual.perfil);
    return ir(h < t ? `/negocio/perfil/?ruc=${n.ruc}&m=perfil` : '/negocio/?m=perfil');
  }

  const m = path.match(/^\/negocio\/pedido\/(P-[A-Z2-9]{6})$/);
  if (m && !post) {
    if ((await contar(env, `negocio-ver:${sesion.token.slice(0, 16)}`, 60)) > 120) return new Response('Espera un momento.', { status: 429 });
    const p = await leerPedido(env, m[1]);
    if (!p || !negocios.some((n) => n.ruc === p.negocio.ruc)) {
      return respuesta(pagina({ titulo: 'No encontrado', cuenta: { nombre: sesion.usuario }, salir: '/negocio/salir', inicio: '/negocio/', cuerpo: '<h1>No encontramos ese pedido</h1><p><a class="volver" href="/negocio/">← Tu panel</a></p>' }), 404);
    }
    return respuesta(await paginaPedidoNegocio(env, sesion, p, { aviso: url.searchParams.get('m') === 'orden' ? `Listo: tu orden ${p.id} le llegó a ${p.influencer.nombre} y al equipo creativo. Te avisamos cuando la acepte.` : '' }));
  }
  return respuesta(pagina({ titulo: 'No encontrado', cuenta: { nombre: sesion.usuario }, salir: '/negocio/salir', inicio: '/negocio/', cuerpo: '<h1>Esta página no existe</h1><p><a class="volver" href="/negocio/">← Tu panel</a></p>' }), 404);
}
