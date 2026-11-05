// Identidad del influencer (/cuenta/identidad/): antes de recibir pedidos sube 4 fotos (cuerpo y rostro, de frente
// y de perfil) para su hoja de personaje, y graba con su micrófono un cuento de un minuto para clonar su voz.
// Son datos biométricos (datos sensibles, Ley 29733): se piden con autorización expresa, se guardan privados en R2,
// Tato los revisa y el influencer puede borrarlos cuando quiera.

import { esc, json } from './ui.js';
import { contar } from './seguridad.js';
import { leerCuenta, guardarCuenta, identidadDe, SUBIDAS_ABIERTAS } from './pedidos.js';
import { guardarArchivo, borrarArchivo, servirArchivo } from './medios.js';
import { cuentoAlAzar } from './cuentos.js';
import { WHATSAPP_TATO, MENSAJES, fecha, pagina, respuesta, ir } from './portal.js';

export const FOTOS = [
  ['cuerpo-frente', 'Cuerpo completo de frente', 'De pies a cabeza, de pie y derecho, con los brazos sueltos a los costados.'],
  ['cuerpo-perfil', 'Cuerpo completo de perfil', 'De pies a cabeza, de costado, con los brazos sueltos.'],
  ['rostro-frente', 'Rostro de frente', 'De los hombros para arriba, mirando a la cámara, con la cara relajada.'],
  ['rostro-perfil', 'Rostro de perfil', 'De los hombros para arriba, de costado, con la oreja a la vista.'],
];
export const NOMBRES = { ...Object.fromEntries(FOTOS.map(([k, n]) => [k, n])), voz: 'Tu voz' };
export const ITEMS = [...FOTOS.map(([k]) => k), 'voz'];

/** Lo que el influencer autoriza. Si cambia el texto, cambia también la versión (queda guardada con cada autorización). */
export const CONSENTIMIENTO = {
  version: '2026-11-05',
  puntos: [
    ['mayor', 'Tengo 18 años o más, y la persona de las fotos y de la voz soy yo.'],
    ['autorizo', 'Autorizo a Tato Studio a usar estas fotos y esta grabación solo para crear mi hoja de personaje y mi voz con IA, y solo en los videos que yo apruebe dentro de mi convenio.'],
    ['borrar', 'Sé que son datos biométricos (datos sensibles) y que puedo borrarlos cuando quiera desde esta cuenta. Al borrarlos, Tato Studio también borra la hoja de personaje y la voz creadas con ellos.'],
  ],
};

const minSegundos = (env) => Number(env.VOZ_MIN_SEGUNDOS || 45);
const ahora = () => new Date().toISOString();

/** Lo que falta (o hay que rehacer) antes de mandar la identidad a revisión. */
export function faltantes(id) {
  return ITEMS.filter((k) => {
    const item = k === 'voz' ? id.voz : id.fotos[k];
    if (!item) return true;
    return id.estado === 'rehacer' && id.rehacer.includes(k) && !(item.subido > (id.revisada || ''));
  });
}

function anotar(id, que) {
  id.historial = [...(id.historial || []).slice(-29), { fecha: ahora(), que }];
}

/** Lee la cuenta de nuevo justo antes de guardar, para no pisar otra subida que terminó al mismo tiempo. */
async function actualizar(env, idCuenta, cambio) {
  const cuenta = await leerCuenta(env, idCuenta);
  const id = identidadDe(cuenta);
  const r = await cambio(id, cuenta);
  cuenta.identidad = id;
  await guardarCuenta(env, cuenta);
  return r;
}

const claveCaptura = (cuenta, item) => `captura:${cuenta.id}:${item}`;
const CAPTURAS = [...ITEMS, 'cuento'];

async function identidadConCapturas(env, cuenta) {
  const id = identidadDe(cuenta);
  if (!cuenta.alta || !SUBIDAS_ABIERTAS.includes(id.estado)) return id;
  const capturas = await Promise.all(CAPTURAS.map((k) => env.PEDIDOS_KV.get(claveCaptura(cuenta, k), 'json')));
  for (const [index, k] of CAPTURAS.entries()) {
    const valor = capturas[index];
    if (!valor) continue;
    if (k === 'voz' || k === 'cuento') id[k] = valor;
    else id.fotos[k] = valor;
  }
  return id;
}

// ---------- Página ----------

const ICONOS = {
  'cuerpo-frente': '<circle cx="24" cy="9" r="6"/><path d="M24 15v24M24 22l-10 13M24 22l10 13M24 39l-7 21M24 39l7 21"/>',
  'cuerpo-perfil': '<circle cx="24" cy="9" r="6"/><path d="M29.5 8l3 2.5-3 1M24 15v24M24 22l2 15M24 39l-3 21M24 39l4 21"/>',
  'rostro-frente': '<ellipse cx="24" cy="31" rx="13" ry="17"/><circle cx="19" cy="28" r="1.5"/><circle cx="29" cy="28" r="1.5"/><path d="M24 30v6M19.5 41q4.5 3 9 0"/>',
  'rostro-perfil': '<path d="M27 14c-8 0-13 6-13 15 0 8 4 14 10 16l1 5h9v-7c3-1 4-3 4-6v-3l3-2-3-5c-1-8-5-13-11-13z"/><circle cx="31" cy="28" r="1.5"/><path d="M20 30q-3 2 0 5"/>',
};
const icono = (k) => `<svg viewBox="0 0 48 64" aria-hidden="true">${ICONOS[k]}</svg>`;

function paginaIdentidad(env, cuenta, id, { aviso, error }) {
  const abierta = SUBIDAS_ABIERTAS.includes(id.estado);
  const falta = faltantes(id);
  const rehacer = id.estado === 'rehacer' ? id.rehacer : [];
  const v = (x) => encodeURIComponent(x?.subido || '');

  const estados = {
    incompleta: '<p class="aviso ojo">Antes de recibir pedidos, sube tus 4 fotos y graba tu voz. Te toma unos 10 minutos.</p>',
    rehacer: `<p class="aviso ojo">Tato te pide que rehagas: ${esc(id.rehacer.map((k) => NOMBRES[k].toLowerCase()).join(', '))}.${id.nota ? ` ${esc(id.nota)}` : ''}</p>`,
    'en-revision': '<p class="aviso">Tato está revisando tus fotos y tu voz. Cuando las apruebe, empiezas a recibir solicitudes.</p>',
    aprobada: cuenta.alta
      ? '<p class="aviso">Completaste tu registro de fotos y voz. Puedes ver tu perfil y gestionar tus pedidos desde tu cuenta.</p>'
      : `<p class="aviso">Tu identidad está aprobada${id.revisada ? ` desde el ${esc(fecha(id.revisada))}` : ''}. Si necesitas cambiar algo, <a href="https://wa.me/${WHATSAPP_TATO}?text=${encodeURIComponent('Hola Tato, quiero cambiar mis fotos o mi voz.')}" target="_blank" rel="noopener">escríbele a Tato</a>.</p>`,
    borrada: '<p class="aviso ojo">Borraste tus fotos y tu voz. Para volver a recibir pedidos, súbelas de nuevo.</p>',
  };

  const tarjetas = FOTOS.map(([k, nombre, consejo]) => {
    const f = id.fotos[k];
    const clase = rehacer.includes(k) && !(f?.subido > (id.revisada || '')) ? ' rehacer' : f ? ' hecha' : '';
    return `<div class="foto${clase}" data-caja="${k}"${f ? ' data-hecho="1"' : ''}>
  ${f ? `<img class="vista" data-vista="/cuenta/identidad/archivo/${k}" src="/cuenta/identidad/archivo/${k}?v=${v(f)}" alt="Tu foto: ${esc(nombre.toLowerCase())}">` : `${icono(k)}<img class="vista" data-vista="/cuenta/identidad/archivo/${k}" alt="Tu foto: ${esc(nombre.toLowerCase())}" hidden>`}
  <h3>${esc(nombre)}</h3>
  <p>${esc(consejo)}</p>
  ${abierta ? `<label class="btn linea chico">${f ? 'Cambiar foto' : 'Subir foto'}<input class="sr-only" type="file" accept="image/*" data-subir="foto" data-url="/cuenta/identidad/foto/${k}" data-max="${8 * 1024 * 1024}"></label>
  <div class="progreso"><i></i></div>` : ''}
  <p class="estado-subida" data-estado role="status"></p>
</div>`;
  }).join('');

  const c = id.cuento;
  const voz = abierta
    ? `<div class="caja" id="voz">
  <p>Lee este cuento en voz alta, con calma, como si se lo contaras a alguien. Al final, di tu código.</p>
  <div class="cuento"${c ? '' : ' data-sin-cuento hidden'}>
    <h3 data-cuento-titulo>${esc(c?.titulo || '')}</h3>
    <p data-cuento-texto>${esc(c?.texto || '')}</p>
    <p class="codigo-voz">Al terminar, di: «Mi código es <b data-cuento-codigo>${esc(c?.codigoEnLetras || '')}</b>».</p>
  </div>
  <div class="acciones"><button type="button" class="btn linea chico" data-otro-cuento="/cuenta/identidad/cuento">${c ? 'Quiero otro cuento' : 'Dame mi cuento'}</button></div>
  <p class="aviso err" data-cuento-error hidden></p>
  <ul class="consejos"><li>Busca un lugar silencioso: sin música, tele ni ventilador.</li><li>Pon el celular o el micrófono a un palmo de tu boca.</li><li>Habla con tu voz de siempre. Si te equivocas, sigue: no pasa nada.</li></ul>
  <div class="grabadora${id.voz ? ' hecha' : ''}" data-grabadora data-caja="voz" data-url="/cuenta/identidad/voz" data-min="${minSegundos(env)}" data-max="180"${id.voz ? ' data-hecho="1"' : ''}>
    <p class="tiempo" data-tiempo aria-live="off">0:00</p>
    <div class="nivel" aria-hidden="true"><i></i></div>
    <div class="acciones">
      <button type="button" class="btn fucsia" data-grabar${c ? '' : ' data-sin-cuento hidden'}>${id.voz ? 'Grabar de nuevo' : 'Grabar'}</button>
      <button type="button" class="btn" data-detener hidden>Terminar</button>
      <button type="button" class="btn fucsia" data-enviar hidden>Enviar mi voz</button>
    </div>
    <audio controls data-escuchar hidden></audio>
    <p class="estado-subida" data-estado role="status"></p>
    <div data-alterno hidden><label class="btn linea chico">Subir un audio grabado<input class="sr-only" type="file" accept="audio/*" data-subir="audio" data-url="/cuenta/identidad/voz" data-max="${25 * 1024 * 1024}" data-recargar></label></div>
  </div>
  ${id.voz ? `<p class="nota">Tu grabación actual (${esc(String(id.voz.segundos || '?'))} s, ${esc(fecha(id.voz.subido))}):</p><audio controls preload="none" src="/cuenta/identidad/archivo/voz?v=${v(id.voz)}"></audio>` : ''}
</div>`
    : `<div class="caja">${id.voz ? `<p>Tu grabación (${esc(String(id.voz.segundos || '?'))} s, ${esc(fecha(id.voz.subido))}):</p><audio controls preload="none" src="/cuenta/identidad/archivo/voz?v=${v(id.voz)}"></audio>` : '<p>Sin grabación.</p>'}</div>`;

  const casillas = CONSENTIMIENTO.puntos.map(([k, t]) => `<label class="check"><input type="checkbox" name="${k}" value="1" required><span>${esc(t)}</span></label>`).join('');
  const autorizacion = abierta
    ? `<form class="caja" method="post" action="/cuenta/identidad/enviar">
  <ul class="faltan" data-faltan${falta.length ? '' : ' hidden'}>${falta.map((k) => `<li data-falta="${k}">Falta: ${esc(NOMBRES[k].toLowerCase())}</li>`).join('')}</ul>
  <p class="nota" data-todo-listo${falta.length ? ' hidden' : ''}>Todo listo. Lee y marca para enviar.</p>
  ${cuenta.alta ? '<p>Al terminar, tu nombre público, red, región y descripción aparecerán en el catálogo.</p>' : casillas}
  <div class="acciones"><button class="btn fucsia" type="submit">${cuenta.alta ? 'Completar registro y publicar perfil' : 'Enviar a Tato'}</button></div>
</form>`
    : id.consentimiento
      ? `<div class="caja"><p class="nota">Autorizaste el ${esc(fecha(id.consentimiento.fecha, true))} (versión ${esc(id.consentimiento.version)}).</p></div>`
      : '';

  const hayDatos = Object.keys(id.fotos).length || id.voz;
  const borrar = hayDatos
    ? `<details class="caja"><summary>Borrar mis fotos y mi voz</summary>
  <p>Se borran tus 4 fotos y tu grabación de este sistema, y Tato borra la hoja de personaje y la voz creadas con ellas. Mientras no las vuelvas a subir, no recibes solicitudes nuevas. Si tienes pedidos en curso, Tato te escribe para resolverlos.</p>
  <form method="post" action="/cuenta/identidad/borrar"><label class="check"><input type="checkbox" name="confirmo" value="1" required><span>Sí, quiero borrar mis fotos y mi voz.</span></label>
  <div class="acciones"><button class="btn linea" type="submit">Borrar ahora</button></div></form></details>`
    : '';

  return pagina({
    titulo: 'Tu identidad',
    cuenta,
    aviso,
    error,
    cuerpo: `${['aprobada', 'en-revision'].includes(id.estado) ? '<a class="volver" href="/cuenta/">← Tu cuenta</a>' : ''}
<h1>Tu <span class="fx">identidad</span></h1>
${cuenta.alta && abierta ? `<p class="nota">Tu ID de acceso <code style="overflow-wrap:anywhere">${esc(cuenta.id)}</code></p>` : ''}
<p class="sub">Con esto Tato arma tu hoja de personaje y tu voz con IA. Solo se usan en los videos que tú apruebes, y puedes borrarlas cuando quieras.</p>
${cuenta.alta && abierta && !id.consentimiento ? `<h2>Autoriza antes de subir tus archivos</h2>
<form class="caja" method="post" action="/cuenta/identidad/autorizar">${casillas}
<div class="acciones"><button class="btn fucsia" type="submit">Autorizar y continuar</button></div></form>` : `
${estados[id.estado] || ''}
<h2>1. Tus fotos</h2>
${abierta ? '<ul class="consejos"><li>Con buena luz de frente y un fondo liso.</li><li>Sin lentes de sol, gorra ni filtros; el pelo como lo llevas siempre.</li><li>Ropa ajustada de un solo color para las de cuerpo completo. Pide a alguien que te tome esas dos.</li></ul>' : ''}
<div class="fotos">${tarjetas}</div>
<h2 id="voz-t">2. Tu voz</h2>
${voz}
<h2>3. ${cuenta.alta && abierta ? 'Publica tu perfil' : 'Tu autorización'}</h2>
${autorizacion}
${borrar}`}`,
  });
}

// ---------- Rutas ----------

/** /cuenta/identidad[/cuento|/foto/<k>|/voz|/archivo/<k>|/enviar|/borrar]. La sesión ya está revisada. */
export async function handleIdentidad(request, env, url, path, cuenta, mensajes) {
  const post = request.method === 'POST';
  const id = await identidadConCapturas(env, cuenta);
  const abierta = SUBIDAS_ABIERTAS.includes(id.estado);
  const cerrada = { error: 'Tu identidad está en revisión o aprobada. Si necesitas cambiar algo, escríbele a Tato.' };

  if (path === '/cuenta/identidad' && !post) return respuesta(paginaIdentidad(env, cuenta, id, mensajes));

  const consentimiento = () => ({
    version: CONSENTIMIENTO.version,
    fecha: ahora(),
    ip: request.headers.get('CF-Connecting-IP') || '',
    textos: CONSENTIMIENTO.puntos.map(([, t]) => t),
  });
  if (path === '/cuenta/identidad/autorizar' && post && cuenta.alta && abierta) {
    if (id.consentimiento) return ir('/cuenta/identidad/');
    const form = await request.formData();
    if (CONSENTIMIENTO.puntos.some(([k]) => form.get(k) !== '1')) {
      return respuesta(paginaIdentidad(env, cuenta, id, { error: 'Confirma las tres casillas para continuar.' }), 400);
    }
    await actualizar(env, cuenta.id, (i) => { i.consentimiento = consentimiento(); });
    return ir('/cuenta/identidad/');
  }
  if (cuenta.alta && abierta && !id.consentimiento) {
    return json({ error: 'Primero autoriza el uso de tus fotos y tu voz.' }, 403);
  }

  if (path === '/cuenta/identidad/cuento' && !post) {
    if (!abierta) return json(cerrada, 409);
    if ((await contar(env, `cuento:${cuenta.id}:${ahora().slice(0, 10)}`, 86400)) > 20) return json({ error: 'Pediste muchos cuentos hoy. Graba con el que tienes.' }, 429);
    const cuento = await cuentoAlAzar(env);
    if (cuenta.alta) await env.PEDIDOS_KV.put(claveCaptura(cuenta, 'cuento'), JSON.stringify(cuento));
    else await actualizar(env, cuenta.id, (i) => { i.cuento = cuento; });
    return json(cuento);
  }

  const foto = path.match(/^\/cuenta\/identidad\/foto\/([a-z-]+)$/);
  if (foto && post) {
    const k = foto[1];
    if (!NOMBRES[k] || k === 'voz') return json({ error: 'Foto no válida.' }, 404);
    if (!abierta) return json(cerrada, 409);
    const r = await guardarArchivo(env, request, 'foto', `identidad/${cuenta.id}/${k}`);
    if (r.error) return json({ error: r.error }, r.status);
    if (cuenta.alta) {
      await guardarCaptura(env, cuenta, k, { clave: r.clave, tamano: r.tamano, subido: ahora() }, id.fotos[k]?.clave);
      return json({ ok: true });
    }
    const anterior = await actualizar(env, cuenta.id, (i) => {
      const viejo = i.fotos[k]?.clave;
      i.fotos = { ...i.fotos, [k]: { clave: r.clave, tamano: r.tamano, subido: ahora() } };
      if (i.estado === 'borrada') i.estado = 'incompleta';
      anotar(i, `Subió la foto: ${NOMBRES[k].toLowerCase()}.`);
      return viejo;
    });
    await borrarArchivo(env, anterior);
    return json({ ok: true });
  }

  if (path === '/cuenta/identidad/voz' && post) {
    if (!abierta) return json(cerrada, 409);
    if (!id.cuento) return json({ error: 'Primero pide tu cuento para leer.' }, 400);
    const segundos = Math.round(Number(url.searchParams.get('segundos') || 0));
    if (cuenta.alta && !Number.isFinite(segundos)) return json({ error: 'No pudimos leer la duración de la grabación.' }, 400);
    if ((segundos || cuenta.alta) && segundos < minSegundos(env)) return json({ error: `La grabación dura ${segundos} s y tiene que durar al menos ${minSegundos(env)} s. Lee el cuento completo.` }, 400);
    if (segundos > 300) return json({ error: 'La grabación dura más de 5 minutos. Graba solo el cuento.' }, 400);
    const r = await guardarArchivo(env, request, 'audio', `identidad/${cuenta.id}/voz`);
    if (r.error) return json({ error: r.error }, r.status);
    if (cuenta.alta) {
      await guardarCaptura(env, cuenta, 'voz', { clave: r.clave, tipo: r.tipo, tamano: r.tamano, segundos, subido: ahora(), cuento: id.cuento }, id.voz?.clave);
      return json({ ok: true });
    }
    const anterior = await actualizar(env, cuenta.id, (i) => {
      const viejo = i.voz?.clave;
      i.voz = { clave: r.clave, tipo: r.tipo, tamano: r.tamano, segundos: segundos || null, subido: ahora(), cuento: i.cuento };
      if (i.estado === 'borrada') i.estado = 'incompleta';
      anotar(i, `Grabó su voz (${segundos || '?'} s, código ${i.cuento?.codigo || '?'}).`);
      return viejo;
    });
    await borrarArchivo(env, anterior);
    return json({ ok: true });
  }

  const archivo = path.match(/^\/cuenta\/identidad\/archivo\/([a-z-]+)$/);
  if (archivo && !post) {
    const k = archivo[1];
    return servirArchivo(env, request, k === 'voz' ? id.voz?.clave : id.fotos[k]?.clave);
  }

  if (path === '/cuenta/identidad/enviar' && post) {
    const form = await request.formData();
    if (!abierta) return ir('/cuenta/identidad/');
    const falta = faltantes(id);
    const sinMarcar = cuenta.alta ? [] : CONSENTIMIENTO.puntos.filter(([k]) => form.get(k) !== '1');
    if (falta.length || sinMarcar.length) {
      const motivo = falta.length ? `Falta: ${falta.map((k) => NOMBRES[k].toLowerCase()).join(', ')}.` : 'Para enviar, marca las tres casillas de la autorización.';
      return respuesta(paginaIdentidad(env, cuenta, id, { error: motivo }), 400);
    }
    if (cuenta.alta) {
      await actualizar(env, cuenta.id, (i) => {
        Object.assign(i, { fotos: id.fotos, voz: id.voz, cuento: id.cuento, estado: 'aprobada', enviada: ahora(), rehacer: [], nota: '' });
        anotar(i, 'Completó los requisitos de registro automático.');
      });
      return ir('/cuenta/?m=alta-lista');
    }
    await actualizar(env, cuenta.id, (i) => {
      i.consentimiento = consentimiento();
      i.estado = 'en-revision';
      i.enviada = ahora();
      anotar(i, 'Mandó su identidad a revisión y dio su autorización.');
    });
    return ir('/cuenta/identidad/?m=identidad-enviada');
  }

  if (path === '/cuenta/identidad/borrar' && post) {
    const form = await request.formData();
    if (form.get('confirmo') !== '1') return respuesta(paginaIdentidad(env, cuenta, id, { error: 'Marca la casilla para confirmar que quieres borrarlas.' }), 400);
    const claves = await actualizar(env, cuenta.id, (i) => {
      const c = [...Object.values(id.fotos).map((f) => f.clave), id.voz?.clave].filter(Boolean);
      i.fotos = {};
      i.voz = null;
      i.cuento = null;
      i.consentimiento = null;
      i.rehacer = [];
      i.estado = 'borrada';
      i.derivadosPorBorrar = true;
      i.borrada = ahora();
      anotar(i, 'Borró sus fotos y su voz.');
      return c;
    });
    if (cuenta.alta) await Promise.all(CAPTURAS.map((k) => env.PEDIDOS_KV.delete(claveCaptura(cuenta, k))));
    for (const c of claves) await borrarArchivo(env, c);
    return ir('/cuenta/identidad/?m=identidad-borrada');
  }

  return respuesta(pagina({ titulo: 'No encontrado', cuenta, cuerpo: '<h1>Esta página no existe</h1><p><a class="volver" href="/cuenta/identidad/">← Tu identidad</a></p>' }), 404);
}

async function guardarCaptura(env, cuenta, item, dato, anterior) {
  try {
    await env.PEDIDOS_KV.put(claveCaptura(cuenta, item), JSON.stringify(dato));
  } catch (error) {
    await borrarArchivo(env, dato.clave);
    throw error;
  }
  await borrarArchivo(env, anterior);
}

/** Panel: aprobar la identidad, pedir que rehaga algo o confirmar que se borraron la hoja y la voz clonada. */
export async function decidirIdentidad(env, idCuenta, accion, { rehacer = [], nota = '' } = {}) {
  return actualizar(env, idCuenta, (i) => {
    if (accion === 'aprobar') {
      if (i.estado !== 'en-revision') return { error: 'La identidad no está esperando revisión.' };
      i.estado = 'aprobada';
      i.revisada = ahora();
      i.nota = nota;
      i.rehacer = [];
      anotar(i, `Tato aprobó la identidad.${nota ? ` ${nota}` : ''}`);
      return { mensaje: 'Identidad aprobada: ya puede recibir solicitudes.' };
    }
    if (accion === 'rehacer') {
      const items = rehacer.filter((k) => ITEMS.includes(k));
      if (!['en-revision', 'aprobada'].includes(i.estado)) return { error: 'La identidad no está en revisión ni aprobada.' };
      if (!items.length) return { error: 'Marca qué tiene que rehacer.' };
      i.estado = 'rehacer';
      i.revisada = ahora();
      i.rehacer = items;
      i.nota = nota;
      anotar(i, `Tato pidió rehacer: ${items.map((k) => NOMBRES[k].toLowerCase()).join(', ')}.${nota ? ` ${nota}` : ''}`);
      return { mensaje: 'Le pediste que rehaga esas partes. Avísale por WhatsApp.' };
    }
    if (accion === 'derivados') {
      i.derivadosPorBorrar = false;
      anotar(i, 'Tato borró la hoja de personaje y la voz clonada.');
      return { mensaje: 'Anotado: borraste su hoja de personaje y su voz clonada.' };
    }
    return { error: 'Acción no válida.' };
  });
}
