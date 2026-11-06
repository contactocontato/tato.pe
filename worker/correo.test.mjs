// Pruebas de los correos (códigos y avisos), el portal de negocios y el resumen del panel. Correr con: npm test
// Usan KV en memoria y un servicio de correo falso: no mandan nada real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCodigoCorreo, configCorreo, correoValido } from './correo.js';
import { eventosPedido } from './avisos.js';
import { handleAltaInfluencer } from './alta-influencer.js';
import { handleCuenta } from './cuenta.js';
import { handleRegistro, handleDecidir } from './negocios.js';
import { handleNegocio } from './portal-negocio.js';
import { handlePedidoNuevo, guardarPedido, leerPedido, accionInfluencer } from './pedidos.js';
import { handlePanelResumen, handlePanelFichaNegocio, handlePanelFichaCreador, handlePanelVista } from './panel-resumen.js';
import { claveDelNavegador, cifrarClave } from './seguridad.js';
import { idDeAlta } from '../src/lib/id-alta.js';
import planes from '../src/data/planes-influencer.json' with { type: 'json' };

class KVFalso {
  constructor() { this.m = new Map(); }
  async get(k, tipo) { const e = this.m.get(k); if (!e) return null; return tipo === 'json' ? JSON.parse(e.v) : e.v; }
  async put(k, v, op = {}) { this.m.set(k, { v, metadata: op.metadata }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.m].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })), list_complete: true };
  }
}

const B = 'https://tato.pe';
const jsonRes = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const CATALOGO = [{ id: 'rosa-perez', nombre: 'Rosa Pérez', usuario: 'rosaperez', fin: null, paquetes: [{ nombre: 'Un video', precio: 500, entrega: '5 días', uso: '6 meses' }] }];

// Servicio de correo falso (misma forma que la API de Resend)
const CORREOS = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin === 'https://correo.prueba' && url.pathname === '/emails') {
    const b = JSON.parse(init.body);
    if (init.headers?.Authorization !== 'Bearer re_prueba') return jsonRes({ message: 'no autorizado' }, 401);
    CORREOS.push({ para: b.to[0], asunto: b.subject, texto: b.text, de: b.from });
    return jsonRes({ id: `correo-${CORREOS.length}` });
  }
  return new Response('no encontrado', { status: 404 });
};
const ultimo = (para) => CORREOS.filter((c) => c.para === para).at(-1);
const codigoDe = (para) => ultimo(para)?.texto.match(/Tu código: (\d{6})/)?.[1];

function entorno({ correo = true } = {}) {
  const env = {
    PEDIDOS_KV: new KVFalso(),
    NEGOCIOS_KV: new KVFalso(),
    ASSETS: { fetch: async () => jsonRes({ influencers: CATALOGO }) },
    MEDIOS: {},
  };
  if (correo) Object.assign(env, { RESEND_API_KEY: 're_prueba', CORREO_REMITENTE: 'Tato Studio <avisos@tato.pe>', CORREO_API: 'https://correo.prueba', CORREO_TATO: 'tato@tato.pe' });
  return env;
}

const cookieDe = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];
const valor = (htmlTexto, nombre) => htmlTexto.match(new RegExp(`name="${nombre}" value="([^"]*)"`))?.[1];
const post = (ruta, body, { json = true, cookie, ip = '1.1.1.1' } = {}) => new Request(B + ruta, {
  method: 'POST',
  headers: { Origin: B, 'CF-Connecting-IP': ip, 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
  body: json ? JSON.stringify(body) : new URLSearchParams(body),
});
const get = (ruta, cookie) => new Request(B + ruta, { headers: cookie ? { Cookie: cookie } : {} });
const enCuenta = (req) => { const url = new URL(req.url); return handleCuenta(req, envActual, url, url.pathname.replace(/\/+$/, '') || '/'); };
const enNegocio = (req) => { const url = new URL(req.url); return handleNegocio(req, envActual, url, url.pathname.replace(/\/+$/, '') || '/'); };
let envActual;

/** Un RUC válido (dígito verificador) a partir de los 10 primeros números. */
function ruc(base) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const resto = 11 - (pesos.reduce((s, p, i) => s + p * Number(base[i]), 0) % 11);
  return base + (resto === 10 ? 0 : resto === 11 ? 1 : resto);
}

test('correo: sin proveedor o sin remitente no se activa, y los correos se validan', () => {
  assert.equal(configCorreo({}).listo, false);
  assert.equal(configCorreo({ RESEND_API_KEY: 'x' }).listo, false);
  assert.equal(configCorreo({ RESEND_API_KEY: 'x', CORREO_REMITENTE: 'Tato <a@tato.pe>' }).listo, true);
  assert.equal(correoValido(' Ana.Diaz@Gmail.COM '), 'ana.diaz@gmail.com');
  assert.equal(correoValido('ana@gmail'), '');
  assert.equal(correoValido('ana@@gmail.com'), '');
});

test('creador: registro con correo verificado, entra con su correo y recupera su contraseña', async () => {
  envActual = entorno();
  const env = envActual;
  const token = crypto.randomUUID();
  const id = await idDeAlta(token);
  const correo = 'rosa@correo.pe';
  const datos = {
    token, nombre: 'Rosa', region: 'Ica', redes: '@rosa', contenido: 'Cocina iqueña.', whatsapp: '987654321',
    mayor: true, autoriza: true, convenio: true, version: planes.version, correo: 'Rosa@Correo.pe',
    clave: await claveDelNavegador(id, 'una-clave-larga'), claveCorreo: await claveDelNavegador(correo, 'una-clave-larga'),
  };
  const alta = (cambios = {}) => handleAltaInfluencer(post('/api/influencers/alta', { ...datos, ...cambios }), env);

  assert.equal((await alta()).status, 400, 'sin código no se crea la cuenta');
  const pedido = await handleCodigoCorreo(post('/api/correo/codigo', { correo: datos.correo, proposito: 'alta-creador', token }), env);
  assert.equal(pedido.status, 200);
  const { desafio, enviadoA } = await pedido.json();
  assert.equal(enviadoA, 'ro•••@correo.pe');
  const codigo = codigoDe(correo);
  assert.match(codigo, /^\d{6}$/);
  assert.equal((await handleCodigoCorreo(post('/api/correo/codigo', { correo, proposito: 'alta-creador', token }), env)).status, 429, 'un código por minuto');
  assert.equal((await alta({ desafioCorreo: desafio, codigoCorreo: codigo === '000000' ? '111111' : '000000' })).status, 400);
  const creada = await alta({ desafioCorreo: desafio, codigoCorreo: codigo });
  assert.equal(creada.status, 201);
  const c = JSON.parse(env.PEDIDOS_KV.m.get(`influencer:${id}`).v);
  assert.equal(c.correo, correo);
  assert.ok(c.correoVerificado && c.claveCorreo);
  assert.equal(await env.PEDIDOS_KV.get(`correo-creador:${correo}`), id);
  assert.equal((await handleCodigoCorreo(post('/api/correo/codigo', { correo, proposito: 'alta-creador', token: crypto.randomUUID() }, { ip: '2.2.2.2' }), env)).status, 409, 'el correo ya tiene cuenta');

  // Entrar con el correo (y con el ID)
  const entrar = (usuario, clave) => enCuenta(post('/cuenta/entrar', { id: usuario, clave }, { json: false }));
  assert.match((await entrar(correo, await claveDelNavegador(correo, 'otra-clave'))).headers.get('Location'), /e=clave/);
  assert.match((await entrar(correo, await claveDelNavegador(id, 'una-clave-larga'))).headers.get('Location'), /e=clave/, 'con el correo vale solo el cálculo con el correo');
  const conCorreo = await entrar('ROSA@correo.pe', await claveDelNavegador(correo, 'una-clave-larga'));
  assert.equal(conCorreo.headers.get('Location'), '/cuenta/');
  assert.ok(cookieDe(conCorreo));
  assert.equal((await entrar(id, await claveDelNavegador(id, 'una-clave-larga'))).headers.get('Location'), '/cuenta/');

  // Recuperar la contraseña con un código
  const antes = CORREOS.length;
  const paso1 = await (await enCuenta(post('/cuenta/recuperar/', { paso: 'correo', correo: 'nadie@correo.pe' }, { json: false, ip: '3.3.3.3' }))).text();
  assert.match(paso1, /Si <b>na•••@correo.pe<\/b> tiene una cuenta/);
  assert.equal(CORREOS.length, antes, 'a un correo sin cuenta no se le manda nada');
  // Pasó el minuto de espera desde el último código (el KV falso no vence solo)
  for (const k of [...env.PEDIDOS_KV.m.keys()].filter((x) => x.startsWith('limite:correo-pausa:'))) env.PEDIDOS_KV.m.delete(k);
  const r1 = await (await enCuenta(post('/cuenta/recuperar/', { paso: 'correo', correo }, { json: false, ip: '3.3.3.3' }))).text();
  const d1 = valor(r1, 'desafio');
  const r2 = await (await enCuenta(post('/cuenta/recuperar/', { paso: 'codigo', correo, desafio: d1, codigo: codigoDe(correo) }, { json: false }))).text();
  const tokenRec = valor(r2, 'token');
  assert.ok(tokenRec);
  assert.match(r2, new RegExp(`data-id="${id}" data-correo="${correo}"`));
  const r3 = await enCuenta(post('/cuenta/recuperar/', {
    paso: 'clave', token: tokenRec,
    nueva: await claveDelNavegador(id, 'clave-nueva-123'), nuevaCorreo: await claveDelNavegador(correo, 'clave-nueva-123'),
  }, { json: false }));
  assert.equal(r3.headers.get('Location'), '/cuenta/?m=recuperada');
  assert.ok(cookieDe(r3));
  assert.equal((await entrar(correo, await claveDelNavegador(correo, 'clave-nueva-123'))).headers.get('Location'), '/cuenta/');
  assert.match((await entrar(correo, await claveDelNavegador(correo, 'una-clave-larga'))).headers.get('Location'), /e=clave/);
  assert.equal((await enCuenta(post('/cuenta/recuperar/', { paso: 'clave', token: tokenRec, nueva: 'x'.repeat(43), nuevaCorreo: 'x'.repeat(43) }, { json: false }))).status, 400, 'el enlace sirve una vez');

  assert.ok(CORREOS.every((x) => !x.texto.includes('una-clave-larga')), 'ningún correo lleva la contraseña');
});

test('negocio: registro con correo verificado, portal con código, avisos y solo sus pedidos', async () => {
  envActual = entorno();
  const env = envActual;
  const RUC = ruc('2060103002');
  const correo = 'ana@negocio.pe';
  const token = crypto.randomUUID();
  const registro = {
    ruc: RUC, nombreComercial: 'Cevichería Ana', rubro: 'restaurante', promociona: 'El ceviche de los domingos en Ica',
    contactoNombre: 'Ana Díaz', dni: '45678912', whatsapp: '987111222', correo: 'Ana@Negocio.pe',
    acepta: { real: true, etiquetas: true, uso: true, datos: true }, token,
  };
  assert.equal((await handleRegistro(post('/api/negocios/registro', registro), env)).status, 400, 'sin código no entra');
  const { desafio } = await (await handleCodigoCorreo(post('/api/correo/codigo', { correo, proposito: 'registro-negocio', token }), env)).json();
  const res = await handleRegistro(post('/api/negocios/registro', { ...registro, desafioCorreo: desafio, codigoCorreo: codigoDe(correo) }), env);
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.portal, true);
  const n = await env.NEGOCIOS_KV.get(`negocio:${RUC}`, 'json');
  assert.equal(n.contacto.correo, correo);
  assert.ok(n.contacto.correoVerificado);
  assert.deepEqual(await env.NEGOCIOS_KV.get(`correo-negocio:${correo}`, 'json'), [RUC]);
  assert.equal((await handleRegistro(post('/api/negocios/registro', registro), env)).status, 200, 'reenviar el mismo formulario recuerda el correo confirmado');

  // Tato lo aprueba desde el panel: le llega su código por correo
  const decidir = new URL(B + '/panel/negocios/decidir');
  await handleDecidir(new Request(decidir, { method: 'POST', headers: { Origin: B, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ruc: RUC, decision: 'aprobar' }) }), env, decidir);
  const aprobado = await env.NEGOCIOS_KV.get(`negocio:${RUC}`, 'json');
  assert.equal(aprobado.semaforo, 'verde');
  assert.match(ultimo(correo).texto, new RegExp(aprobado.codigo));

  // Una creadora con correo verificado recibe la solicitud
  const cuenta = { id: 'rosa-perez', nombre: 'Rosa Pérez', whatsapp: '987000111', clave: await cifrarClave('x'.repeat(43)), activa: true, aceptaPedidos: true,
    porcentajeTato: 40, produccion: { 'Un video': 80 }, correo: 'rosa@creadora.pe', correoVerificado: '2026-11-01T00:00:00Z',
    identidad: { estado: 'aprobada', fotos: {}, historial: [] } };
  await env.PEDIDOS_KV.put('influencer:rosa-perez', JSON.stringify(cuenta));
  const nuevo = await (await handlePedidoNuevo(post('/api/pedidos', { codigo: aprobado.codigo, ruc: RUC, influencer: 'rosa-perez', paquete: 'Un video', promociona: 'El ceviche de los domingos' }), env)).json();
  assert.match(nuevo.numero, /^P-/);
  assert.match(ultimo('rosa@creadora.pe').asunto, /Nueva solicitud de Cevichería Ana/);
  assert.match(ultimo(correo).asunto, new RegExp(`Recibimos tu solicitud ${nuevo.numero}`));
  const p = await leerPedido(env, nuevo.numero);
  await accionInfluencer(env, p, 'aceptar');
  assert.match(ultimo(correo).asunto, /Rosa Pérez aceptó tu pedido/);
  assert.match(ultimo(correo).texto, /WhatsApp con el link/, 'sin Mercado Pago, el link llega por WhatsApp');
  const total = CORREOS.length;
  await guardarPedido(env, await leerPedido(env, nuevo.numero));
  assert.equal(CORREOS.length, total, 'guardar sin cambios no repite el aviso');

  // Un pedido de antes de los avisos no manda nada al guardarse
  const viejo = { ...(await leerPedido(env, nuevo.numero)), id: 'P-VIEJO2' };
  delete viejo.avisos;
  await guardarPedido(env, viejo);
  assert.equal(CORREOS.length, total);
  assert.deepEqual(Object.keys(viejo.avisos), ['creador', 'negocio']);

  // Otro negocio con su propio pedido
  await env.PEDIDOS_KV.put('pedido:P-OTRO22', JSON.stringify({ ...viejo, id: 'P-OTRO22', negocio: { ...viejo.negocio, ruc: '20100000001' } }), { metadata: { ruc: '20100000001', estado: 'solicitud', influencer: 'rosa-perez' } });

  // Portal: entra con un código al correo (pasó el minuto de espera desde el código del registro)
  for (const k of [...env.PEDIDOS_KV.m.keys()].filter((x) => x.startsWith('limite:correo-pausa:'))) env.PEDIDOS_KV.m.delete(k);
  const inicio = await (await enNegocio(get('/negocio/'))).text();
  assert.match(inicio, /Mandarme el código/);
  const paso = await (await enNegocio(post('/negocio/entrar', { paso: 'correo', correo }, { json: false, ip: '4.4.4.4' }))).text();
  const d = valor(paso, 'desafio');
  const malo = await enNegocio(post('/negocio/entrar', { paso: 'codigo', correo, desafio: d, codigo: '999999' === codigoDe(correo) ? '888888' : '999999' }, { json: false }));
  assert.equal(malo.status, 400);
  const dentro = await enNegocio(post('/negocio/entrar', { paso: 'codigo', correo, desafio: d, codigo: codigoDe(correo) }, { json: false }));
  assert.equal(dentro.headers.get('Location'), '/negocio/');
  const sesion = cookieDe(dentro);
  assert.match(sesion, /^tato_negocio=/);
  const portal = await (await enNegocio(get('/negocio/', sesion))).text();
  assert.match(portal, new RegExp(nuevo.numero));
  assert.match(portal, /Te toca pagar/);
  assert.match(portal, new RegExp(aprobado.codigo));
  assert.match(portal, /localStorage\.setItem\('tato-negocio'/);
  assert.doesNotMatch(portal, /P-OTRO22/);
  assert.equal((await enNegocio(get(`/negocio/pedido/${nuevo.numero}/`, sesion))).status, 200);
  assert.equal((await enNegocio(get('/negocio/pedido/P-OTRO22/', sesion))).status, 404);
  assert.equal((await enNegocio(get(`/negocio/pedido/${nuevo.numero}/`))).headers.get('Location'), '/negocio/?e=sesion');
  // Un correo sin negocio: no recibe nada y no puede entrar
  const antes = CORREOS.length;
  await enNegocio(post('/negocio/entrar', { paso: 'correo', correo: 'otro@negocio.pe' }, { json: false, ip: '5.5.5.5' }));
  assert.equal(CORREOS.length, antes);

  // Panel: resumen, fichas y vistas
  const panel = (fn, ruta) => { const url = new URL(B + ruta); return fn(new Request(url), env, url, url.pathname.replace(/\/+$/, '')); };
  const resumen = await (await panel(handlePanelResumen, '/panel/')).text();
  assert.match(resumen, /Te toca/);
  assert.match(resumen, /Cevichería Ana|CEVICHER/i);
  assert.match(resumen, /Rosa Pérez/);
  assert.match(resumen, /Correos: listos \(Resend\)/);
  const fichaN = await (await panel(handlePanelFichaNegocio, `/panel/negocio/?ruc=${RUC}`)).text();
  assert.match(fichaN, new RegExp(nuevo.numero));
  assert.match(fichaN, /verificado el/);
  const fichaC = await (await panel(handlePanelFichaCreador, '/panel/creador/?id=rosa-perez')).text();
  assert.match(fichaC, /rosa@creadora\.pe · verificado/);
  const vistaN = await (await panel(handlePanelVista, `/panel/vista/negocio/?ruc=${RUC}`)).text();
  assert.match(vistaN, /Vista de Tato/);
  assert.match(vistaN, /<div inert>/);
  assert.doesNotMatch(vistaN, /localStorage/);
  const vistaC = await (await panel(handlePanelVista, '/panel/vista/creador/?id=rosa-perez')).text();
  assert.match(vistaC, /Vista de Tato: así ve Rosa Pérez/);
});

test('avisos: cada paso tiene su mensaje y la clave no se repite', () => {
  const base = {
    id: 'P-ABCDEF', estado: 'solicitud', influencer: { id: 'x', nombre: 'Luz' }, negocio: { ruc: '1', nombreComercial: 'Pollería' },
    paquete: { nombre: 'Historia' }, brief: { promociona: 'El pollo a la brasa' }, dinero: { precio: 499, produccion: 200 }, pagos: {}, links: {},
  };
  assert.equal(eventosPedido({ ...base, dinero: { precio: null } }).creador, null, 'sin precio, primero cotiza Tato');
  assert.equal(eventosPedido(base).creador.clave, 'solicitud');
  const saldo = eventosPedido({ ...base, estado: 'saldo', links: { saldo: { link: 'https://mp/x' } } }).negocio;
  assert.equal(saldo.clave, 'saldo:https://mp/x');
  assert.match(saldo.parrafos[0], /S\/ 299\.00/);
  assert.equal(eventosPedido({ ...base, estado: 'guion', guion: { estado: 'pendiente', version: 2 } }).creador.clave, 'guion-2');
  assert.equal(eventosPedido({ ...base, estado: 'guion', guion: { estado: 'cambios', version: 2 } }).creador, null);
});
