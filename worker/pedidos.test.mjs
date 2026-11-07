// Pruebas de las cuentas de influencer, los pedidos y los pagos. Correr con: npm test
// Usan KV en memoria, un catálogo falso y un Mercado Pago falso: no cobran ni consultan nada real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuentas, cuentasDe, accionTato, leerPedido, guardarAjustes, handlePedidoNuevo, handleEstadoInfluencer, handleWebhook, renovarConexiones, limpiarActuaciones, recibePedidos } from './pedidos.js';
import { handleCuenta, handleMpConectado } from './cuenta.js';
import { handlePanelInfluencerAccion, handlePanelPedidos, handlePanelInfluencers, handlePanelArchivo } from './panel-pedidos.js';
import { claveDelNavegador, cifrarClave, claveCorrecta, formatoClave } from './seguridad.js';
import { handleAltaInfluencer } from './alta-influencer.js';
import { handleCreadores, handlePerfilCreador } from './perfiles-creadores.js';
import { idDeAlta } from '../src/lib/id-alta.js';
import planes from '../src/data/planes-influencer.json' with { type: 'json' };
import { enviarCodigo } from './verificacion.js';
import { listarPublicaciones } from './publicaciones.js';

class KVFalso {
  constructor() { this.m = new Map(); }
  async get(k, tipo) { const e = this.m.get(k); if (!e) return null; return tipo === 'json' ? JSON.parse(e.v) : e.v; }
  async put(k, v, op = {}) { this.m.set(k, { v, metadata: op.metadata }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.m].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })), list_complete: true };
  }
}

class R2Falso {
  constructor() { this.m = new Map(); }
  async put(k, body, op = {}) {
    const buf = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
    this.m.set(k, { buf, tipo: op.httpMetadata?.contentType });
    return { key: k, size: buf.byteLength };
  }
  async head(k) { const e = this.m.get(k); return e ? { size: e.buf.byteLength, httpMetadata: { contentType: e.tipo } } : null; }
  async get(k, op = {}) {
    const e = this.m.get(k);
    if (!e) return null;
    const ini = op.range?.offset || 0;
    const buf = op.range ? e.buf.slice(ini, ini + op.range.length) : e.buf;
    return { body: new Response(buf).body, size: buf.byteLength, httpMetadata: { contentType: e.tipo } };
  }
  async delete(k) { this.m.delete(k); }
}

const B = 'https://tato.pe';
const RUC = '20601030013';
const CODIGO = 'TS-ABCDE';
const CATALOGO = [
  { id: 'rosa-perez', nombre: 'Rosa Pérez', usuario: 'rosaperez', fin: null, paquetes: [{ nombre: 'Un video', precio: 500, entrega: '5 días', uso: '6 meses' }, { nombre: 'Especial', precio: null, entrega: 'a convenir', uso: '6 meses' }] },
  { id: 'luis-ramos', nombre: 'Luis Ramos', usuario: 'luisramos', fin: null, paquetes: [{ nombre: 'Un video', precio: 300, entrega: '5 días', uso: '6 meses' }] },
  { id: 'vencido', nombre: 'Vencido', usuario: 'vencido', fin: Date.now() - 1000, paquetes: [{ nombre: 'Un video', precio: 300, entrega: '5 días', uso: '6 meses' }] },
];

// Mercado Pago falso
const MP = { pagos: {}, preferencias: [], tokens: [] };
const OTP_SID = 'VE' + '3'.repeat(32);
let enviosOTP = 0;
const jsonRes = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const auth = init.headers?.Authorization || '';
  const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body ? JSON.parse(init.body) : null;
  if (url.origin === 'https://challenges.cloudflare.com') return jsonRes({
    success: body.response === 'captcha-valido', action: 'creadores-whatsapp', hostname: 'tato.pe',
  });
  if (url.origin === 'https://verify.twilio.com') {
    if (url.pathname.endsWith('/Verifications') && body.To === '+51900000000' && body.Channel === 'whatsapp') {
      enviosOTP++;
      return jsonRes({ sid: OTP_SID, status: 'pending' }, 201);
    }
    if (url.pathname.endsWith('/VerificationCheck') && body.VerificationSid === OTP_SID) {
      return jsonRes({ status: body.Code === '123456' ? 'approved' : 'pending', to: '+51900000000' });
    }
  }
  if (url.origin === 'https://mp.prueba') {
    if (url.pathname === '/oauth/token') { MP.tokens.push(body); return jsonRes({ access_token: `APP_USR-influencer-${MP.tokens.length}`, refresh_token: 'TG-refresh', user_id: 777, expires_in: 15552000 }); }
    if (url.pathname === '/checkout/preferences') { MP.preferencias.push({ auth, body }); return jsonRes({ id: `pref-${MP.preferencias.length}`, init_point: `https://www.mercadopago.com.pe/checkout?pref=${MP.preferencias.length}` }); }
    if (url.pathname.startsWith('/v1/payments/')) { const p = MP.pagos[url.pathname.split('/').pop()]; return p && p.token === auth ? jsonRes(p) : jsonRes({ message: 'not found' }, 404); }
    if (url.pathname === '/users/me') return jsonRes({ first_name: 'Rosa', last_name: 'Pérez', nickname: 'ROSAP' });
  }
  if (url.origin === 'https://api.anthropic.com') {
    const cuento = `El cóndor curioso\n${'Había una vez un cóndor que quería contar las nubes del valle. '.repeat(13).trim()}`;
    return jsonRes({ content: [{ type: 'text', text: cuento }] });
  }
  return new Response('no encontrado', { status: 404 });
};

function entorno({ conMP = true } = {}) {
  const env = {
    PEDIDOS_KV: new KVFalso(),
    NEGOCIOS_KV: new KVFalso(),
    ASSETS: { fetch: async () => jsonRes({ influencers: CATALOGO }) },
    MEDIOS: new R2Falso(),
  };
  if (conMP) Object.assign(env, { MP_CLIENT_ID: '123', MP_CLIENT_SECRET: 'secreto', MP_ACCESS_TOKEN: 'APP_USR-tato', MP_API: 'https://mp.prueba', MP_AUTH: 'https://auth.mp.prueba' });
  env.NEGOCIOS_KV.put(`codigo:${CODIGO}`, RUC);
  env.NEGOCIOS_KV.put(`negocio:${RUC}`, JSON.stringify({
    ruc: RUC, codigo: CODIGO, semaforo: 'verde', creado: '2026-11-01T10:00:00Z',
    sunat: { razonSocial: 'CEVICHERIA DE PRUEBA S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', actividad: 'RESTAURANTES' },
    negocio: { nombreComercial: 'La Prueba', rubro: 'restaurante' },
    contacto: { nombre: 'Ana Díaz', dni: '45678912', whatsapp: '987111222' },
  }));
  return env;
}

const cookieDe = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];
async function cuenta(env, ruta, { form, cookie, origin = B } = {}) {
  const url = new URL(B + ruta);
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const init = { method: form ? 'POST' : 'GET', headers };
  if (form) { headers.Origin = origin; headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(form); }
  return handleCuenta(new Request(url, init), env, url, url.pathname.replace(/\/+$/, '') || '/');
}
async function panel(env, handler, ruta, form) {
  const url = new URL(B + ruta);
  const req = form
    ? new Request(url, { method: 'POST', headers: { Origin: B, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
    : new Request(url);
  return handler(req, env, url);
}
async function pedir(env, cambios = {}, ip = '1.1.1.1') {
  const res = await handlePedidoNuevo(new Request(`${B}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: B, 'CF-Connecting-IP': ip },
    body: JSON.stringify({ codigo: CODIGO, ruc: RUC, influencer: 'rosa-perez', paquete: 'Un video', promociona: 'El ceviche mixto de los domingos', detalle: 'Precio S/ 35', fecha: '2026-11-20', ...cambios }),
  }), env);
  return { status: res.status, r: await res.json() };
}
async function webhook(env, pedido, parte, pagoId, headers = {}) {
  const url = new URL(`${B}/api/mp/webhook?pedido=${pedido}&parte=${parte}&data.id=${pagoId}&type=payment`);
  return handleWebhook(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ type: 'payment', data: { id: pagoId } }) }), env, url);
}

/** Marca la identidad como aprobada sin pasar por las subidas (las pruebas de identidad hacen el camino completo). */
async function identidadAprobada(env, id) {
  const c = JSON.parse(env.PEDIDOS_KV.m.get(`influencer:${id}`).v);
  c.identidad = { estado: 'aprobada', fotos: {}, voz: null, rehacer: [], historial: [] };
  await env.PEDIDOS_KV.put(`influencer:${id}`, JSON.stringify(c), { metadata: { nombre: c.nombre, activa: true, mp: Boolean(c.mp?.accessToken) } });
}

/** Crea la cuenta desde el panel, entra con la clave temporal, pone una nueva y (por defecto) aprueba su identidad. Devuelve la cookie. */
async function cuentaLista(env, id = 'rosa-perez', clave = 'una-clave-larga', { conIdentidad = true } = {}) {
  const temporal = await claveDelNavegador(id, 'Temporal2345');
  const res = await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id, accion: 'crear', whatsapp: '912345678', porcentaje: '40', paq_0: 'Un video', prod_0: '80', paq_1: 'Especial', prod_1: '100', clave: temporal });
  assert.equal(res.status, 303, 'crear cuenta');
  const entrar = await cuenta(env, '/cuenta/entrar', { form: { id, clave: temporal } });
  const cookie = cookieDe(entrar);
  assert.match(cookie, /^tato_cuenta=/);
  const cambio = await cuenta(env, '/cuenta/clave', { cookie, form: { actual: temporal, nueva: await claveDelNavegador(id, clave) } });
  assert.match(cambio.headers.get('Location'), /m=clave-ok/);
  if (conIdentidad) await identidadAprobada(env, id);
  return cookie;
}

async function subir(env, ruta, cookie, bytes, tipo) {
  const url = new URL(B + ruta);
  const req = new Request(url, { method: 'POST', headers: { Cookie: cookie, Origin: B, 'Content-Type': tipo, 'Content-Length': String(bytes.length) }, body: bytes });
  const res = await handleCuenta(req, env, url, url.pathname.replace(/\/+$/, ''));
  return { status: res.status, r: await res.json() };
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const AUDIO = new Uint8Array(2048).fill(7);

test('reparto: producción aparte, comisión de Mercado Pago y 60/40', () => {
  const conMP = cuentas({ precio: 500, produccion: 80, porcentajeTato: 40 }, { conMP: true, tasaMP: 5.2982 });
  assert.deepEqual(
    [conMP.adelanto, conMP.saldo, conMP.comisionMP, conMP.neto, conMP.parteTato, conMP.parteInfluencer],
    [80, 420, 22.25, 397.75, 159.1, 238.65],
  );
  const aMano = cuentas({ precio: 500, produccion: 80, porcentajeTato: 40 });
  assert.deepEqual([aMano.comisionMP, aMano.parteTato, aMano.parteInfluencer], [0, 168, 252]);
  assert.equal(cuentas({ precio: null, produccion: 80, porcentajeTato: 40 }), null);
  const caro = cuentas({ precio: 50, produccion: 80, porcentajeTato: 40 });
  assert.deepEqual([caro.adelanto, caro.saldo], [50, 0]);
});

test('contraseñas: se cifran en dos pasos y solo coincide la correcta', async () => {
  const navegador = await claveDelNavegador('rosa-perez', 'mi clave secreta');
  assert.ok(formatoClave(navegador));
  assert.equal(navegador, await claveDelNavegador(' Rosa-Perez ', 'mi clave secreta'), 'el ID no distingue mayúsculas ni espacios');
  const guardada = await cifrarClave(navegador);
  assert.ok(!JSON.stringify(guardada).includes('mi clave'));
  assert.ok(await claveCorrecta(navegador, guardada));
  assert.ok(!(await claveCorrecta(await claveDelNavegador('rosa-perez', 'otra clave'), guardada)));
  assert.ok(!(await claveCorrecta(await claveDelNavegador('luis-ramos', 'mi clave secreta'), guardada)), 'la sal del navegador depende del ID');
  assert.ok(!(await claveCorrecta('corta', guardada)));
});

test('entrar: clave temporal obliga a cambiarla, y 5 errores bloquean 15 minutos', async () => {
  const env = entorno();
  const temporal = await claveDelNavegador('rosa-perez', 'Temporal2345');
  await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id: 'rosa-perez', accion: 'crear', whatsapp: '912345678', porcentaje: '40', paq_0: 'Un video', prod_0: '80', clave: temporal });
  const cookie = cookieDe(await cuenta(env, '/cuenta/entrar', { form: { id: 'rosa-perez', clave: temporal } }));
  const inicio = await (await cuenta(env, '/cuenta', { cookie })).text();
  assert.match(inicio, /Crea tu contraseña/);
  const otraPagina = await cuenta(env, '/cuenta/pedido/P-AAAAAA', { cookie });
  assert.match(await otraPagina.text(), /Crea tu contraseña/, 'no deja ver nada antes de cambiarla');

  const mala = await claveDelNavegador('rosa-perez', 'no es');
  for (let i = 0; i < 5; i++) assert.match((await cuenta(env, '/cuenta/entrar', { form: { id: 'rosa-perez', clave: mala } })).headers.get('Location'), /e=clave/);
  const bloqueada = await cuenta(env, '/cuenta/entrar', { form: { id: 'rosa-perez', clave: temporal } });
  assert.match(bloqueada.headers.get('Location'), /e=espera/, 'ni la correcta entra durante el bloqueo');
  assert.match((await cuenta(env, '/cuenta/entrar', { form: { id: 'no-existe', clave: mala } })).headers.get('Location'), /e=clave/, 'no dice si el ID existe');
});

test('pedido completo con Mercado Pago: adelanto para Tato y saldo dividido 60/40', async () => {
  const env = entorno();
  await guardarAjustes(env, { porcentajeTato: 40, tasaMP: 5.2982, produccion: 0 });
  const cookie = await cuentaLista(env);

  // El influencer conecta su Mercado Pago
  const ir = await cuenta(env, '/cuenta/mercadopago', { cookie, form: {} });
  const auth = new URL(ir.headers.get('Location'));
  assert.equal(auth.origin, 'https://auth.mp.prueba');
  assert.equal(auth.searchParams.get('client_id'), '123');
  const vuelta = new URL(`${B}/api/mp/conectado?code=TG-codigo&state=${auth.searchParams.get('state')}`);
  const conectado = await handleMpConectado(new Request(vuelta, { headers: { Cookie: cookie } }), env, vuelta);
  assert.match(conectado.headers.get('Location'), /m=mp-ok/);
  const repetido = await handleMpConectado(new Request(vuelta), env, vuelta);
  assert.match(repetido.headers.get('Location'), /m=mp-error/, 'cada inicio de conexión sirve una sola vez');

  // El negocio pide
  const { status, r } = await pedir(env);
  assert.equal(status, 200);
  assert.match(r.numero, /^P-[A-Z2-9]{6}$/);
  let p = await leerPedido(env, r.numero);
  assert.deepEqual(p.dinero, { precio: 500, produccion: 80, porcentajeTato: 40 });
  assert.equal(p.negocio.contacto.whatsapp, '987111222');
  assert.match(await (await cuenta(env, '/cuenta', { cookie })).text(), /Te toca/);
  const vista = await (await cuenta(env, `/cuenta/pedido/${p.id}`, { cookie })).text();
  assert.ok(!vista.includes('987111222') && !vista.includes('45678912'), 'el influencer no ve el WhatsApp ni el DNI del negocio');
  assert.match(vista, /S\/ 238\.65/);

  // Acepta: se crea el link del adelanto con la cuenta de Tato
  assert.match((await cuenta(env, `/cuenta/pedido/${p.id}`, { cookie, form: { accion: 'aceptar' } })).headers.get('Location'), /m=aceptado/);
  p = await leerPedido(env, p.id);
  assert.equal(p.estado, 'adelanto');
  const prefAdelanto = MP.preferencias.at(-1);
  assert.equal(prefAdelanto.auth, 'Bearer APP_USR-tato');
  assert.equal(prefAdelanto.body.items[0].unit_price, 80);
  assert.equal(prefAdelanto.body.marketplace_fee, undefined);
  assert.equal(prefAdelanto.body.external_reference, `${p.id}:adelanto`);

  // Mercado Pago avisa el pago del adelanto
  MP.pagos['1001'] = { id: 1001, token: 'Bearer APP_USR-tato', status: 'approved', currency_id: 'PEN', transaction_amount: 80, external_reference: `${p.id}:adelanto`, date_approved: new Date().toISOString(), fee_details: [{ type: 'mercadopago_fee', amount: 4.24 }] };
  assert.equal(await (await webhook(env, p.id, 'adelanto', '1001')).text(), 'ok');
  assert.equal((await leerPedido(env, p.id)).estado, 'guion');
  assert.equal(await (await webhook(env, p.id, 'adelanto', '1001')).text(), 'ok', 'el mismo aviso dos veces no cambia nada');

  // Guion: cambios y aprobación
  assert.ok((await accionTato(env, await leerPedido(env, p.id), 'guion', { texto: 'ESCENA 1. Rosa entra a la cevichería y prueba el mixto.' })).ok);
  await cuenta(env, `/cuenta/pedido/${p.id}`, { cookie, form: { accion: 'cambios-guion', comentario: 'Que diga el precio al final' } });
  assert.equal((await leerPedido(env, p.id)).guion.estado, 'cambios');
  await accionTato(env, await leerPedido(env, p.id), 'guion', { texto: 'ESCENA 1. Rosa prueba el mixto. Al final: solo S/ 35.' });
  await cuenta(env, `/cuenta/pedido/${p.id}`, { cookie, form: { accion: 'aprobar-guion' } });
  assert.equal((await leerPedido(env, p.id)).estado, 'video');

  // Video aprobado: se crea el link del saldo con la cuenta del influencer y la parte de Tato
  assert.ok((await accionTato(env, await leerPedido(env, p.id), 'video', { link: 'https://drive.google.com/file/d/abc/view' })).ok);
  await cuenta(env, `/cuenta/pedido/${p.id}`, { cookie, form: { accion: 'aprobar-video' } });
  p = await leerPedido(env, p.id);
  assert.equal(p.estado, 'saldo');
  const prefSaldo = MP.preferencias.at(-1);
  assert.equal(prefSaldo.auth, 'Bearer APP_USR-influencer-1');
  assert.equal(prefSaldo.body.items[0].unit_price, 420);
  assert.equal(prefSaldo.body.marketplace_fee, 159.1);

  // El negocio paga el saldo: Mercado Pago descuenta su comisión y la parte de Tato
  MP.pagos['2002'] = { id: 2002, token: 'Bearer APP_USR-influencer-1', status: 'approved', currency_id: 'PEN', transaction_amount: 420, external_reference: `${p.id}:saldo`, date_approved: new Date().toISOString(), fee_details: [{ type: 'mercadopago_fee', amount: 22.25 }, { type: 'application_fee', amount: 159.1 }] };
  await webhook(env, p.id, 'saldo', '2002');
  p = await leerPedido(env, p.id);
  assert.equal(p.estado, 'entrega');
  const c = cuentasDe(p, { metodo: 'mercadopago', tasaMP: 5.2982 });
  assert.deepEqual([c.real, c.comisionMP, c.parteTato, c.parteInfluencer], [true, 22.25, 159.1, 238.65]);

  assert.ok((await accionTato(env, p, 'entregar')).ok);
  const inicio = await (await cuenta(env, '/cuenta', { cookie })).text();
  assert.match(inicio, /Recibido este mes<\/span><b>S\/ 238\.65/);
  assert.match(inicio, /Te llegó a tu Mercado Pago/);
});

test('pedido a mano (sin Mercado Pago): Tato registra los pagos y le paga al influencer', async () => {
  const env = entorno({ conMP: false });
  const cookie = await cuentaLista(env);
  const { r } = await pedir(env);
  await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aceptar' } });
  let p = await leerPedido(env, r.numero);
  assert.equal(p.estado, 'adelanto');
  assert.deepEqual(p.links, {}, 'sin Mercado Pago no hay links');
  assert.match((await accionTato(env, p, 'pagado', { parte: 'adelanto', operacion: '' })).error, /operación/);
  assert.ok((await accionTato(env, p, 'pagado', { parte: 'adelanto', monto: '80', operacion: 'YAPE-123' })).ok);
  await accionTato(env, await leerPedido(env, r.numero), 'guion', { texto: 'Un guion de prueba con más de veinte letras.' });
  await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aprobar-guion' } });
  await accionTato(env, await leerPedido(env, r.numero), 'video', { link: 'https://wetransfer.com/x' });
  await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aprobar-video' } });
  p = await leerPedido(env, r.numero);
  assert.equal(p.estado, 'saldo');
  assert.ok((await accionTato(env, p, 'pagado', { parte: 'saldo', monto: '420', operacion: 'TRANSF-9' })).ok);
  p = await leerPedido(env, r.numero);
  assert.deepEqual([p.pagos.saldo.parteTato, cuentasDe(p, { metodo: 'manual' }).parteInfluencer], [168, 252]);
  assert.match(await (await cuenta(env, '/cuenta', { cookie })).text(), /Por cobrar<\/span><b>S\/ 252\.00/);
  const ruta = `/cuenta/pedido/${p.id}/publicaciones`;
  const publicacion = { accion: 'guardar', url: 'https://www.instagram.com/reel/abc123/?igsh=tracking', cuenta: '@marca-prueba', fecha: '2026-11-05', vistas: '1234', meGusta: '42' };
  assert.equal((await cuenta(env, ruta, { cookie, form: publicacion })).status, 400, 'un pedido por entregar aún no admite publicaciones');
  await accionTato(env, p, 'entregar');
  assert.ok((await accionTato(env, await leerPedido(env, r.numero), 'pago-influencer', { operacion: 'YAPE-777' })).ok);
  p = await leerPedido(env, r.numero);
  assert.equal(p.pagoInfluencer.monto, 252);
  const otro = await cuentaLista(env, 'luis-ramos');
  assert.equal((await cuenta(env, ruta, { cookie: otro, form: publicacion })).status, 404);
  assert.equal((await cuenta(env, ruta, { cookie, form: { ...publicacion, url: 'https://instagram.com.ejemplo.com/reel/abc123' } })).status, 400);
  assert.equal((await cuenta(env, ruta, { cookie, form: publicacion })).status, 303);
  assert.equal((await cuenta(env, ruta, { cookie, form: { ...publicacion, vistas: '1345' } })).status, 303);
  const publicaciones = await listarPublicaciones(env, 'rosa-perez', p.id);
  assert.equal(publicaciones.length, 1, 'actualizar conserva un solo registro por URL');
  assert.equal(publicaciones[0].url, 'https://instagram.com/reel/abc123');
  assert.deepEqual(publicaciones[0].metricas, { vistas: 1345, meGusta: 42, comentarios: null, compartidos: null });
  const inicio = await (await cuenta(env, '/cuenta', { cookie })).text();
  assert.match(inicio, /Te pagamos el .* \(operación YAPE-777\)/);
  assert.match(inicio, /@marca-prueba/);
  assert.doesNotMatch(await (await cuenta(env, '/cuenta', { cookie: otro })).text(), /@marca-prueba/);
});

test('solicitudes: código y RUC, negocio verificado, pausa, convenio vencido y límites', async () => {
  const env = entorno();
  const cookie = await cuentaLista(env);
  assert.equal((await pedir(env, { ruc: '20100070970' })).status, 403, 'el código es de otro RUC');
  assert.equal((await pedir(env, { codigo: 'TS-ZZZZZ' })).status, 403);
  assert.equal((await pedir(env, { influencer: 'vencido' })).status, 404, 'convenio vencido');
  assert.equal((await pedir(env, { influencer: 'luis-ramos' })).status, 409, 'sin cuenta no recibe pedidos');
  assert.equal((await pedir(env, { paquete: 'Otro' })).status, 400);
  assert.equal((await pedir(env, { promociona: 'corto' })).status, 400);
  assert.equal((await pedir(env, { sitio: 'bot' })).r.numero, null, 'campo trampa');

  await cuenta(env, '/cuenta/pausa', { cookie, form: { pausa: 'si' } });
  assert.deepEqual(await (await handleEstadoInfluencer(env, 'rosa-perez')).json(), { recibe: false });
  assert.equal((await pedir(env)).status, 409);
  await cuenta(env, '/cuenta/pausa', { cookie, form: { pausa: 'no' } });
  assert.deepEqual(await (await handleEstadoInfluencer(env, 'rosa-perez')).json(), { recibe: true });

  const especial = await pedir(env, { paquete: 'Especial', promociona: 'Nuestro local nuevo en Huaraz' });
  const pe = await leerPedido(env, especial.r.numero);
  assert.equal(pe.dinero.precio, null);
  assert.match((await cuenta(env, `/cuenta/pedido/${pe.id}`, { cookie, form: { accion: 'aceptar' } })).status === 400 ? 'error' : '', /error/, 'a cotizar: no se acepta sin precio');
  assert.ok((await accionTato(env, pe, 'precio', { precio: '900', produccion: '150' })).ok);
  assert.equal((await cuenta(env, `/cuenta/pedido/${pe.id}`, { cookie, form: { accion: 'aceptar' } })).status, 303);

  const neg = JSON.parse(env.NEGOCIOS_KV.m.get(`negocio:${RUC}`).v);
  neg.semaforo = 'pausado';
  await env.NEGOCIOS_KV.put(`negocio:${RUC}`, JSON.stringify(neg));
  assert.equal((await pedir(env)).status, 403, 'un negocio en pausa no puede pedir');
  neg.semaforo = 'verde';
  await env.NEGOCIOS_KV.put(`negocio:${RUC}`, JSON.stringify(neg));

  const apuestas = await pedir(env, { promociona: 'Nuestra casa de apuestas deportivas' }, '1.1.1.2');
  assert.match((await leerPedido(env, apuestas.r.numero)).alertas.join(), /apuestas/i, 'se avisa al influencer y a Tato');
  for (let i = 0; i < 3; i++) await pedir(env, {}, '1.1.1.3');
  assert.equal((await pedir(env, {}, '1.1.1.4')).status, 429, 'máximo 5 pedidos en curso por negocio');
});

test('seguridad: otro influencer, otra web, paso equivocado y avisos falsos de pago', async () => {
  const env = entorno();
  env.MP_WEBHOOK_SECRET = 'clave-webhook';
  const cookieRosa = await cuentaLista(env);
  const cookieLuis = await cuentaLista(env, 'luis-ramos', 'otra-clave-larga');
  const { r } = await pedir(env);

  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie: cookieLuis })).status, 404);
  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie: cookieLuis, form: { accion: 'aceptar' } })).status, 404);
  assert.match((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie: cookieRosa, form: { accion: 'aceptar' }, origin: 'https://otra-web.com' })).headers.get('Location'), /e=origen/);
  assert.equal((await leerPedido(env, r.numero)).estado, 'solicitud');
  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie: cookieRosa, form: { accion: 'aprobar-video' } })).status, 400);
  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}`)).status, 303, 'sin sesión vuelve a entrar');

  await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie: cookieRosa, form: { accion: 'aceptar' } });
  // Firma inválida
  MP.pagos['3003'] = { id: 3003, token: 'Bearer APP_USR-tato', status: 'approved', currency_id: 'PEN', transaction_amount: 80, external_reference: `${r.numero}:adelanto`, fee_details: [] };
  assert.equal((await webhook(env, r.numero, 'adelanto', '3003', { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req-1' })).status, 401);
  // Pago de otro pedido
  MP.pagos['3004'] = { ...MP.pagos['3003'], id: 3004, external_reference: 'P-OTROXX:adelanto' };
  assert.equal(await (await webhook(env, r.numero, 'adelanto', '3004')).text(), 'ignorado');
  // Pago por menos
  MP.pagos['3005'] = { ...MP.pagos['3003'], id: 3005, transaction_amount: 10 };
  assert.equal(await (await webhook(env, r.numero, 'adelanto', '3005')).text(), 'ignorado');
  assert.equal((await leerPedido(env, r.numero)).estado, 'adelanto');
  // Firma válida
  const ts = String(Date.now());
  const plantilla = `id:3003;request-id:req-2;ts:${ts};`;
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode('clave-webhook'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v1 = [...new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(plantilla)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await (await webhook(env, r.numero, 'adelanto', '3003', { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-2' })).text(), 'ok');
  assert.equal((await leerPedido(env, r.numero)).estado, 'guion');
  // Un segundo pago del adelanto queda anotado para devolverlo
  MP.pagos['3006'] = { ...MP.pagos['3003'], id: 3006 };
  await webhook(env, r.numero, 'adelanto', '3006');
  assert.match((await leerPedido(env, r.numero)).historial.at(-1).que, /otro pago del adelanto/);
});

test('panel: pedidos e influencers se ven y Tato no puede saltarse pasos', async () => {
  const env = entorno();
  await cuentaLista(env);
  const { r } = await pedir(env);
  const html = await (await panel(env, handlePanelPedidos, '/panel/pedidos/?ver=influencer')).text();
  assert.match(html, new RegExp(r.numero));
  assert.match(html, /WhatsApp a Rosa Pérez/);
  const inf = await (await panel(env, handlePanelInfluencers, '/panel/influencers/')).text();
  assert.match(inf, /Luis Ramos/);
  assert.match(inf, /Sin cuenta/);
  const p = await leerPedido(env, r.numero);
  assert.match((await accionTato(env, p, 'entregar')).error, /falta el pago/);
  assert.match((await accionTato(env, p, 'guion', { texto: 'x'.repeat(30) })).error, /no está esperando/);
  assert.match((await accionTato(env, p, 'video', { link: 'http://inseguro.com' })).error, /no está esperando/);
});

test('panel: la política de referrer deja que el navegador mande Origin en los formularios', async () => {
  // Con «no-referrer», Chrome manda «Origin: null» en los POST y el panel rechazaba sus propios botones.
  const env = entorno();
  const res = await panel(env, handlePanelPedidos, '/panel/pedidos/');
  assert.notEqual(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal((await cuenta(env, '/cuenta')).headers.get('Referrer-Policy'), 'same-origin');
});

test('identidad: fotos, cuento con código, voz, autorización, revisión de Tato y recién ahí recibe pedidos', async () => {
  const env = entorno();
  const cookie = await cuentaLista(env, 'rosa-perez', 'una-clave-larga', { conIdentidad: false });
  assert.match((await cuenta(env, '/cuenta', { cookie })).headers.get('Location'), /\/cuenta\/identidad\//, 'sin identidad, la cuenta lleva a completarla');
  assert.equal((await pedir(env)).status, 409, 'todavía no recibe pedidos');

  assert.equal((await subir(env, '/cuenta/identidad/foto/rostro-frente', cookie, new Uint8Array([1, 2, 3, 4]), 'image/jpeg')).status, 415, 'solo JPEG de verdad');
  assert.equal((await subir(env, '/cuenta/identidad/foto/otra-cosa', cookie, JPEG, 'image/jpeg')).status, 404);
  for (const k of ['cuerpo-frente', 'cuerpo-perfil', 'rostro-frente', 'rostro-perfil']) assert.equal((await subir(env, `/cuenta/identidad/foto/${k}`, cookie, JPEG, 'image/jpeg')).status, 200);
  assert.equal(env.MEDIOS.m.size, 4);
  assert.equal((await subir(env, '/cuenta/identidad/foto/rostro-frente', cookie, JPEG, 'image/jpeg')).status, 200);
  assert.equal(env.MEDIOS.m.size, 4, 'al cambiar una foto se borra la anterior');

  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=60', cookie, AUDIO, 'audio/webm')).status, 400, 'primero pide su cuento');
  const cuento = await (await cuenta(env, '/cuenta/identidad/cuento', { cookie })).json();
  assert.equal(cuento.porIA, false, 'sin clave de IA, usa los cuentos propios');
  assert.match(cuento.codigoEnLetras, /^\p{L}+, \p{L}+, \p{L}+$/u);
  env.ANTHROPIC_API_KEY = 'prueba';
  const conIA = await (await cuenta(env, '/cuenta/identidad/cuento', { cookie })).json();
  assert.equal(conIA.porIA, true);
  assert.equal(conIA.titulo, 'El cóndor curioso');
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=12', cookie, AUDIO, 'audio/webm')).status, 400, 'menos de 45 s');
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=63', cookie, AUDIO, 'text/html')).status, 415);
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=63', cookie, AUDIO, 'audio/webm')).status, 200);

  const sinMarcar = await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: { mayor: '1' } });
  assert.equal(sinMarcar.status, 400);
  const enviada = await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: { mayor: '1', autorizo: '1', borrar: '1' } });
  assert.match(enviada.headers.get('Location'), /m=identidad-enviada/);
  let c = JSON.parse(env.PEDIDOS_KV.m.get('influencer:rosa-perez').v);
  assert.equal(c.identidad.estado, 'en-revision');
  assert.equal(c.identidad.voz.cuento.codigo, conIA.codigo, 'la voz queda con el cuento y el código que leyó');
  assert.equal(c.identidad.consentimiento.textos.length, 3);
  assert.equal((await subir(env, '/cuenta/identidad/foto/rostro-frente', cookie, JPEG, 'image/jpeg')).status, 409, 'en revisión no se cambia nada');
  assert.ok(!recibePedidos(c));

  // Tato escucha la voz y pide que la grabe de nuevo
  const archivo = new URL(`${B}/panel/archivo?clave=${encodeURIComponent(c.identidad.voz.clave)}`);
  const voz = await handlePanelArchivo(new Request(archivo, { headers: { Range: 'bytes=0-99' } }), env, archivo);
  assert.equal(voz.status, 206);
  assert.equal((await voz.arrayBuffer()).byteLength, 100);
  const mala = new URL(`${B}/panel/archivo?clave=${encodeURIComponent('../otra/cosa')}`);
  assert.equal((await handlePanelArchivo(new Request(mala), env, mala)).status, 404);
  await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id: 'rosa-perez', accion: 'identidad-rehacer', rehacer_voz: '1', nota: 'Se escucha un ventilador' });
  const pagina = await (await cuenta(env, '/cuenta/identidad', { cookie })).text();
  assert.match(pagina, /Tato te pide que rehagas: tu voz\. Se escucha un ventilador/);
  assert.equal((await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: { mayor: '1', autorizo: '1', borrar: '1' } })).status, 400, 'falta rehacer la voz');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=58', cookie, AUDIO, 'audio/mp4')).status, 200);
  await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: { mayor: '1', autorizo: '1', borrar: '1' } });
  await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id: 'rosa-perez', accion: 'identidad-aprobar' });
  c = JSON.parse(env.PEDIDOS_KV.m.get('influencer:rosa-perez').v);
  assert.equal(c.identidad.estado, 'aprobada');
  assert.equal((await pedir(env)).status, 200, 'con la identidad aprobada ya recibe pedidos');
  const foto = await cuenta(env, '/cuenta/identidad/archivo/rostro-frente', { cookie });
  assert.equal(foto.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(foto.headers.get('Cache-Control'), 'private, no-store');

  // Borra todo: se van los archivos, deja de recibir pedidos y Tato ve que tiene que borrar lo que creó
  await cuenta(env, '/cuenta/identidad/borrar', { cookie, form: { confirmo: '1' } });
  c = JSON.parse(env.PEDIDOS_KV.m.get('influencer:rosa-perez').v);
  assert.equal(env.MEDIOS.m.size, 0);
  assert.equal(c.identidad.estado, 'borrada');
  assert.equal(c.identidad.consentimiento, null);
  assert.ok(!recibePedidos(c));
  assert.match(await (await panel(env, handlePanelInfluencers, '/panel/influencers/')).text(), /borra su hoja de personaje y su voz clonada/);
  await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id: 'rosa-perez', accion: 'identidad-derivados' });
  assert.equal(JSON.parse(env.PEDIDOS_KV.m.get('influencer:rosa-perez').v).identidad.derivadosPorBorrar, false);
});

test('alta en línea: consentimiento, archivos privados, revisión de Tato, publicación y pedido con precio estándar', async () => {
  const env = entorno({ conMP: false });
  const token = crypto.randomUUID();
  const id = await idDeAlta(token);
  const datos = {
    token, clave: await claveDelNavegador(id, 'contraseña-de-prueba'),
    nombre: 'Creadora de prueba', region: 'Ica', redes: '@demo', contenido: 'Videos de gastronomía.',
    whatsapp: '900000000', mayor: true, autoriza: true, convenio: true, version: planes.version,
  };
  const alta = (cambios = {}) => handleAltaInfluencer(new Request(B + '/api/influencers/alta', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B },
    body: JSON.stringify({ ...datos, ...cambios }),
  }), env);
  assert.equal((await alta({ convenio: false })).status, 400);
  const creada = await alta();
  assert.equal(creada.status, 201);
  const cookie = cookieDe(creada);
  assert.ok(cookie);
  assert.equal((await creada.json()).id, id);
  assert.equal((await alta()).status, 200, 'reintentar conserva la cuenta');
  assert.equal((await alta({ clave: 'x'.repeat(43) })).status, 409, 'el mismo token no reemplaza la contraseña');
  const perfil = new URL(`${B}/influencers/perfil/${id}/`);
  assert.equal((await handlePerfilCreador(env, perfil, id)).status, 404);
  assert.equal((await subir(env, '/cuenta/identidad/foto/rostro-frente', cookie, JPEG, 'image/jpeg')).status, 403);
  assert.equal((await cuenta(env, '/cuenta/identidad/autorizar', { cookie, form: { mayor: '1', autorizo: '1', borrar: '1' } })).status, 303);
  const fotos = await Promise.all(['cuerpo-frente', 'cuerpo-perfil', 'rostro-frente', 'rostro-perfil']
    .map((k) => subir(env, `/cuenta/identidad/foto/${k}`, cookie, JPEG, 'image/jpeg')));
  assert.ok(fotos.every((r) => r.status === 200));
  await cuenta(env, '/cuenta/identidad/cuento', { cookie });
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=0', cookie, AUDIO, 'audio/webm')).status, 400);
  assert.equal((await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: {} })).status, 400);
  assert.equal((await subir(env, '/cuenta/identidad/voz?segundos=60', cookie, AUDIO, 'audio/webm')).status, 200);
  assert.equal((await cuenta(env, '/cuenta/identidad/enviar', { cookie, form: {} })).headers.get('Location'), '/cuenta/?m=alta-lista');
  assert.equal((await handlePerfilCreador(env, perfil, id)).status, 404, 'no sale en el catálogo hasta que Tato lo apruebe');
  assert.equal((await pedir(env, { influencer: id, paquete: 'Historia' })).status, 404);
  assert.equal((await panel(env, handlePanelInfluencerAccion, '/panel/influencers/accion', { id, accion: 'identidad-aprobar' })).status, 303);
  const pagina = await (await handlePerfilCreador(env, perfil, id)).text();
  assert.match(pagina, /Creadora de prueba/);
  assert.doesNotMatch(pagina, /900000000|identidad\/|captura:/);
  const lista = async () => (await (await handleCreadores(env, new URL(B + '/api/influencers/creadores'))).json()).perfiles;
  assert.deepEqual(await lista(), [{ id, nombre: datos.nombre, region: datos.region, desde: 299, contenido: datos.contenido, telefonoVerificado: false }]);
  const pedido = await pedir(env, { influencer: id, paquete: 'Historia' });
  assert.equal(pedido.status, 200);
  assert.deepEqual((await leerPedido(env, pedido.r.numero)).dinero, { precio: 499, produccion: 200, porcentajeTato: 40 });
  await cuenta(env, '/cuenta/identidad/borrar', { cookie, form: { confirmo: '1' } });
  assert.equal(env.MEDIOS.m.size, 0);
  assert.deepEqual(await lista(), []);
  assert.equal((await handlePerfilCreador(env, perfil, id)).status, 404);
});

test('alta con WhatsApp: exige Turnstile, vincula el código al teléfono y lo consume al verificar', async () => {
  const env = Object.assign(entorno(), {
    VERIFICACION_WHATSAPP: '1', TWILIO_VERIFY_SERVICE_SID: 'VA' + '1'.repeat(32),
    TWILIO_VERIFY_KEY_SID: 'SK' + '2'.repeat(32), TWILIO_VERIFY_KEY_SECRET: 'test',
    TURNSTILE_SITE_KEY: 'publica', TURNSTILE_SECRET_KEY: 'privada',
  });
  const token = crypto.randomUUID();
  const id = await idDeAlta(token);
  const datos = {
    token, clave: await claveDelNavegador(id, 'contraseña-de-prueba'),
    nombre: 'Creadora OTP', region: 'Ica', redes: '@demo', contenido: 'Videos de gastronomía.',
    whatsapp: '900000000', mayor: true, autoriza: true, convenio: true, version: planes.version,
  };
  const req = (ruta, body) => new Request(B + ruta, { method: 'POST', headers: { Origin: B, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const alta = (d) => handleAltaInfluencer(req('/api/influencers/alta', { ...datos, ...d }), env);
  const enviar = (captcha) => enviarCodigo(req('/api/influencers/verificacion/enviar', { captcha, token, whatsapp: datos.whatsapp }), env);
  assert.equal((await alta()).status, 400);
  assert.equal((await enviar('captcha-invalido')).status, 400);
  assert.equal(enviosOTP, 0);
  const envio = await enviar('captcha-valido');
  assert.equal(envio.status, 200);
  assert.equal(enviosOTP, 1);
  const { desafio } = await envio.json();
  assert.equal((await enviar('captcha-valido')).status, 429);
  assert.equal((await alta({ desafio, codigo: '123456', whatsapp: '900000001' })).status, 400);
  assert.equal((await alta({ desafio, codigo: '111111' })).status, 400);
  assert.equal((await alta({ desafio, codigo: '123456' })).status, 201);
  assert.equal((await env.PEDIDOS_KV.get(`influencer:${id}`, 'json')).whatsappVerificado.numero, datos.whatsapp);
  assert.equal(await env.PEDIDOS_KV.get(`otp:${desafio}`), null);
});

test('actuación: si Tato la pide, el guion no se aprueba sin el audio, y se borra 30 días después de terminar', async () => {
  const env = entorno({ conMP: false });
  const cookie = await cuentaLista(env);
  const cookieLuis = await cuentaLista(env, 'luis-ramos', 'otra-clave-larga');
  const { r } = await pedir(env);
  await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aceptar' } });
  await accionTato(env, await leerPedido(env, r.numero), 'pagado', { parte: 'adelanto', monto: '80', operacion: 'YAPE-1' });
  assert.equal((await subir(env, `/cuenta/pedido/${r.numero}/actuacion/audio`, cookie, AUDIO, 'audio/webm')).status, 200, 'puede ayudar aunque no se lo pidan');
  await new Promise((res) => setTimeout(res, 5));
  await accionTato(env, await leerPedido(env, r.numero), 'guion', { texto: 'Un guion de prueba con más de veinte letras.', actuar_audio: '1' });
  const pagina = await (await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie })).text();
  assert.match(pagina, /Tato te pide que actúes el guion/);
  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aprobar-guion' } })).status, 400, 'el audio de antes era de otro guion');
  assert.equal((await subir(env, `/cuenta/pedido/${r.numero}/actuacion/audio`, cookieLuis, AUDIO, 'audio/webm')).status, 404, 'otro influencer no puede subir');
  assert.equal((await subir(env, `/cuenta/pedido/${r.numero}/actuacion/video`, cookie, AUDIO, 'audio/webm')).status, 415);
  assert.equal((await subir(env, `/cuenta/pedido/${r.numero}/actuacion/audio`, cookie, AUDIO, 'audio/webm')).status, 200);
  assert.equal(env.MEDIOS.m.size, 1, 'el audio anterior se borró');
  assert.match((await cuenta(env, `/cuenta/pedido/${r.numero}`, { cookie, form: { accion: 'aprobar-guion' } })).headers.get('Location'), /m=guion-ok/);
  assert.equal((await cuenta(env, `/cuenta/pedido/${r.numero}/actuacion/audio`, { cookie: cookieLuis })).status, 404);
  assert.match(await (await panel(env, handlePanelPedidos, '/panel/pedidos/?ver=todos')).text(), /<dt>Actuación<\/dt>/);

  await accionTato(env, await leerPedido(env, r.numero), 'cancelar', { motivo: 'prueba' });
  assert.deepEqual(await limpiarActuaciones(env), { limpiados: 0 }, 'todavía no pasan 30 días');
  const k = `pedido:${r.numero}`;
  const e = env.PEDIDOS_KV.m.get(k);
  e.metadata = { ...e.metadata, actualizado: '2026-01-01T00:00:00.000Z' };
  assert.deepEqual(await limpiarActuaciones(env), { limpiados: 1 });
  assert.equal(env.MEDIOS.m.size, 0);
});

test('cron: renueva las conexiones de Mercado Pago que vencen pronto', async () => {
  const env = entorno();
  const cookie = await cuentaLista(env);
  const ir = await cuenta(env, '/cuenta/mercadopago', { cookie, form: {} });
  const state = new URL(ir.headers.get('Location')).searchParams.get('state');
  const vuelta = new URL(`${B}/api/mp/conectado?code=TG-x&state=${state}`);
  await handleMpConectado(new Request(vuelta), env, vuelta);
  const c = JSON.parse(env.PEDIDOS_KV.m.get('influencer:rosa-perez').v);
  assert.deepEqual(await renovarConexiones(env), { renovadas: 0 }, 'todavía no vence');
  c.mp.vence = Date.now() + 5 * 86400000;
  await env.PEDIDOS_KV.put('influencer:rosa-perez', JSON.stringify(c), { metadata: { mp: true } });
  assert.deepEqual(await renovarConexiones(env), { renovadas: 1 });
  assert.equal(MP.tokens.at(-1).grant_type, 'refresh_token');
});
