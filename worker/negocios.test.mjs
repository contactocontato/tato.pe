// Pruebas de la verificación de negocios. Correr con: npm test
// Usan un KV en memoria y un servicio de RUC falso: no consultan SUNAT ni gastan consultas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rucValido, normalizarSunat, clasificar, handleRegistro, handleDecidir, revisarRucs } from './negocios.js';

class KVFalso {
  constructor() { this.m = new Map(); }
  async get(k, tipo) { const e = this.m.get(k); if (!e) return null; return tipo === 'json' ? JSON.parse(e.v) : e.v; }
  async put(k, v, op = {}) { this.m.set(k, { v, metadata: op.metadata }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.m].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })), list_complete: true };
  }
}

// RUC de prueba con dígito de verificación válido
const RUC = { cevicheria: '20601030013', cervecera: '20100070970', noHabido: '10456789019', apuestas: '20666666667', noExiste: '20123456786', otroFormato: '20777777778' };
const SUNAT = {
  [RUC.cevicheria]: { razon_social: 'CEVICHERIA DE PRUEBA S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', actividad_economica: 'ACTIVIDADES DE RESTAURANTES Y DE SERVICIO MOVIL DE COMIDAS' },
  [RUC.cervecera]: { razonSocial: 'CERVECERA DE PRUEBA S.A.', estado: 'ACTIVO', condicion: 'HABIDO', actividadEconomica: 'ELABORACIÓN DE BEBIDAS MALTEADAS Y DE MALTA' },
  [RUC.noHabido]: { razon_social: 'QUISPE PEREZ JUAN', estado: 'ACTIVO', condicion: 'NO HABIDO', actividad_economica: 'VENTA AL POR MENOR DE ALIMENTOS' },
  [RUC.apuestas]: { razon_social: 'APUESTAS DE PRUEBA S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', actividad_economica: 'ACTIVIDADES DE JUEGOS DE AZAR Y APUESTAS' },
};
let consultas = 0;
globalThis.fetch = async (url) => {
  consultas++;
  const ruc = String(url).match(/\d{11}/)?.[0];
  if (ruc === RUC.otroFormato) return new Response('{"result":{"company":{"name":"X"}}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (!SUNAT[ruc]) return new Response('{"message":"not found"}', { status: 404 });
  return new Response(JSON.stringify(SUNAT[ruc]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const entorno = () => ({ NEGOCIOS_KV: new KVFalso(), RUC_API_TOKEN: 'prueba' });
const base = {
  rubro: 'restaurante', promociona: 'El menú de los domingos de mi cevichería', nombreComercial: 'La Prueba', redes: '',
  contactoNombre: 'Rosa Pérez', dni: '45678912', whatsapp: '987 111 222', correo: '',
  acepta: { real: true, etiquetas: true, uso: true, datos: true },
};
async function registrar(env, cambios = {}, ip = '1.1.1.1', origin = 'https://tato.pe') {
  const res = await handleRegistro(new Request('https://tato.pe/api/negocios/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip }, body: JSON.stringify({ ...base, ...cambios }),
  }), env);
  return { status: res.status, r: await res.json() };
}

test('RUC: 11 números, prefijo válido y dígito de verificación', () => {
  assert.ok(rucValido(RUC.cevicheria));
  assert.ok(rucValido(RUC.noHabido));
  assert.ok(!rucValido('20601030014'), 'dígito equivocado');
  assert.ok(!rucValido('30601030013'), 'prefijo que no existe');
  assert.ok(!rucValido('2060103001'), 'le falta un número');
});

test('SUNAT: entiende respuestas con camelCase, con guion bajo y dentro de data', () => {
  assert.equal(normalizarSunat({ razon_social: 'A', estado: 'activo', condicion: 'habido' }).estado, 'ACTIVO');
  assert.equal(normalizarSunat({ razonSocial: 'B', actividadEconomica: 'X' }).razonSocial, 'B');
  assert.equal(normalizarSunat({ data: { razon_social: 'C' } }).razonSocial, 'C');
  assert.equal(normalizarSunat({ actividades_economicas: [{ descripcion: 'UNO' }, 'DOS'] }).actividad, 'UNO / DOS');
});

test('reglas: qué queda en verde, en revisión o fuera', () => {
  const datos = (cambios = {}) => ({ ruc: RUC.cevicheria, negocio: { rubro: 'restaurante', promociona: 'Menú del día', nombreComercial: '' }, contacto: { dni: '45678912' }, ...cambios });
  const ok = (sunat) => ({ ok: true, sunat: { estado: 'ACTIVO', condicion: 'HABIDO', actividad: '', ...sunat } });
  assert.equal(clasificar(datos(), ok({})).semaforo, 'verde');
  assert.equal(clasificar(datos(), ok({ condicion: 'NO HABIDO' })).semaforo, 'rojo');
  assert.equal(clasificar(datos(), ok({ estado: 'BAJA DE OFICIO' })).semaforo, 'rojo');
  assert.equal(clasificar(datos(), ok({ actividad: 'Actividades de juegos de azar y apuestas' })).semaforo, 'rojo');
  assert.equal(clasificar(datos(), { ok: false, motivo: 'no_encontrado' }).semaforo, 'rojo');
  assert.equal(clasificar(datos(), { ok: false, motivo: 'sin_servicio' }).semaforo, 'amarillo');
  assert.equal(clasificar(datos(), ok({ actividad: 'ELABORACION DE BEBIDAS MALTEADAS' })).semaforo, 'amarillo');
  assert.equal(clasificar(datos({ negocio: { rubro: 'suplementos', promociona: 'Vitaminas', nombreComercial: '' } }), ok({})).semaforo, 'amarillo');
  const milagro = clasificar(datos({ negocio: { rubro: 'tienda', promociona: 'Té milagroso para bajar de peso rápido', nombreComercial: '' } }), ok({}));
  assert.equal(milagro.semaforo, 'amarillo');
  assert.match(milagro.motivos.join(' '), /productos milagro/);
  assert.equal(clasificar(datos({ negocio: { rubro: 'restaurante', promociona: 'Arma tu combo familiar', nombreComercial: '' } }), ok({})).semaforo, 'verde', '«arma tu combo» no es de armas');
  assert.equal(clasificar(datos({ ruc: RUC.noHabido, contacto: { dni: '45678912' } }), ok({})).semaforo, 'amarillo', 'RUC 10 con un DNI que no es el suyo');
  assert.equal(clasificar(datos({ ruc: RUC.noHabido, contacto: { dni: '45678901' } }), ok({})).semaforo, 'verde', 'RUC 10 con su propio DNI');
});

test('registro: verificado con código, y el código se mantiene al volver a registrarse', async () => {
  const env = entorno();
  const a = await registrar(env, { ruc: RUC.cevicheria });
  assert.equal(a.status, 200);
  assert.equal(a.r.semaforo, 'verde');
  assert.match(a.r.codigo, /^TS-[A-Z2-9]{5}$/);
  const b = await registrar(env, { ruc: RUC.cevicheria }, '1.1.1.2');
  assert.equal(b.r.codigo, a.r.codigo);
  assert.equal(await env.NEGOCIOS_KV.get(`codigo:${a.r.codigo}`), RUC.cevicheria);
});

test('registro: otra persona con el mismo RUC no pisa el registro', async () => {
  const env = entorno();
  const a = await registrar(env, { ruc: RUC.cevicheria });
  const b = await registrar(env, { ruc: RUC.cevicheria, dni: '11111111', contactoNombre: 'Otro' }, '1.1.1.3');
  assert.equal(b.r.semaforo, 'amarillo');
  assert.equal(b.r.codigo, null);
  const guardado = await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json');
  assert.equal(guardado.contacto.dni, '45678912');
  assert.equal(guardado.codigo, a.r.codigo);
  assert.equal(guardado.intentos.length, 1);
});

test('registro: no entra aunque escriba otro DNI', async () => {
  const env = entorno();
  await registrar(env, { ruc: RUC.apuestas, rubro: 'eventos', promociona: 'Eventos los fines de semana' });
  const b = await registrar(env, { ruc: RUC.apuestas, rubro: 'eventos', promociona: 'Eventos los fines de semana', dni: '11111111' }, '1.1.1.4');
  assert.equal(b.r.semaforo, 'rojo');
});

test('registro: RUC que no existe, datos mal escritos, otro origen y campo trampa', async () => {
  const env = entorno();
  assert.equal((await registrar(env, { ruc: RUC.noExiste })).r.semaforo, 'rojo');
  assert.equal((await registrar(env, { ruc: '20601030014' })).status, 400);
  assert.equal((await registrar(env, { ruc: RUC.cevicheria, whatsapp: '12345' })).status, 400);
  assert.equal((await registrar(env, { ruc: RUC.cevicheria, acepta: { real: true } })).status, 400);
  assert.equal((await registrar(env, { ruc: RUC.cevicheria }, '1.1.1.5', 'https://otra-web.com')).status, 403);
  const antes = env.NEGOCIOS_KV.m.size;
  assert.equal((await registrar(env, { ruc: RUC.cevicheria, sitio: 'spam' })).r.semaforo, 'amarillo');
  assert.equal(env.NEGOCIOS_KV.m.size, antes, 'el bot no deja nada guardado');
});

test('registro: sin token del servicio, todo pasa a revisión', async () => {
  const env = { NEGOCIOS_KV: new KVFalso() };
  const a = await registrar(env, { ruc: RUC.cevicheria });
  assert.equal(a.r.semaforo, 'amarillo');
});

test('registro: si el servicio cambia su formato, pasa a revisión en vez de rechazar', async () => {
  const env = entorno();
  const errores = console.error;
  console.error = () => {};
  const a = await registrar(env, { ruc: RUC.otroFormato });
  console.error = errores;
  assert.equal(a.r.semaforo, 'amarillo');
  const r = await env.NEGOCIOS_KV.get(`negocio:${RUC.otroFormato}`, 'json');
  assert.match(r.notas.join(' '), /formato que no reconozco/);
});

test('registro: máximo 8 por conexión al día, y la consulta de RUC se reutiliza', async () => {
  const env = entorno();
  consultas = 0;
  const codigos = [];
  for (let i = 0; i < 9; i++) codigos.push((await registrar(env, { ruc: RUC.cevicheria }, '9.9.9.9')).status);
  assert.deepEqual(codigos, [200, 200, 200, 200, 200, 200, 200, 200, 429]);
  assert.equal(consultas, 1, 'una sola consulta pagada por RUC al día');
});

async function decidir(env, ruc, decision, nota = '') {
  const form = new FormData();
  form.set('ruc', ruc); form.set('decision', decision); form.set('nota', nota);
  return handleDecidir(new Request('https://tato.pe/panel/negocios/decidir', { method: 'POST', headers: { Origin: 'https://tato.pe' }, body: form }), env, new URL('https://tato.pe/panel/negocios/decidir'));
}

test('panel: aprobar un registro en revisión le da su código', async () => {
  const env = entorno();
  await registrar(env, { ruc: RUC.cervecera, rubro: 'tienda', promociona: 'Nuestra cerveza artesanal' });
  const res = await decidir(env, RUC.cervecera, 'aprobar', 'Mandó su registro sanitario');
  assert.equal(res.status, 303);
  const r = await env.NEGOCIOS_KV.get(`negocio:${RUC.cervecera}`, 'json');
  assert.equal(r.semaforo, 'verde');
  assert.match(r.codigo, /^TS-/);
  assert.equal(r.decision.por, 'Tato');
  const otra = await registrar(env, { ruc: RUC.cervecera, rubro: 'tienda', promociona: 'Nuestra cerveza artesanal' }, '1.1.1.6');
  assert.equal(otra.r.semaforo, 'verde', 'si vuelve a registrarse, la aprobación de Tato se mantiene');
  assert.deepEqual(otra.r.motivos, []);
});

test('panel: si Tato lo rechaza o lo pausa, volver a registrarse no lo deshace', async () => {
  const env = entorno();
  const a = await registrar(env, { ruc: RUC.cevicheria });
  assert.equal(a.r.semaforo, 'verde');

  await decidir(env, RUC.cevicheria, 'rechazar', 'Promocionaba otra cosa');
  const b = await registrar(env, { ruc: RUC.cevicheria }, '1.1.1.7');
  assert.equal(b.r.semaforo, 'rojo');
  assert.equal(b.r.codigo, null);
  assert.equal((await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json')).semaforo, 'rojo');

  await decidir(env, RUC.cevicheria, 'pausar');
  const c = await registrar(env, { ruc: RUC.cevicheria, whatsapp: '987654321' }, '1.1.1.8');
  assert.equal(c.r.semaforo, 'amarillo');
  assert.match(c.r.mensaje, /en pausa/);
  const r = await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json');
  assert.equal(r.semaforo, 'pausado');
  assert.equal(r.contacto.whatsapp, '987654321', 'guarda su WhatsApp nuevo para que Tato le escriba');
});

test('registro: si cambia su WhatsApp, queda en el historial', async () => {
  const env = entorno();
  await registrar(env, { ruc: RUC.cevicheria });
  await registrar(env, { ruc: RUC.cevicheria, whatsapp: '987654321' }, '1.1.1.9');
  const r = await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json');
  assert.match(r.historial.at(-1).nota, /antes era 987111222/);
});

test('revisión diaria: si su RUC deja de estar habido, se pausa', async () => {
  const env = entorno();
  await registrar(env, { ruc: RUC.cevicheria });
  const r = await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json');
  r.sunat.consultado = '2020-01-01T00:00:00.000Z';
  await env.NEGOCIOS_KV.put(`negocio:${RUC.cevicheria}`, JSON.stringify(r), { metadata: { semaforo: 'verde' } });
  SUNAT[RUC.cevicheria] = { ...SUNAT[RUC.cevicheria], condicion: 'NO HABIDO' };
  const out = await revisarRucs(env);
  assert.deepEqual(out, { revisados: 1, pausados: 1 });
  assert.equal((await env.NEGOCIOS_KV.get(`negocio:${RUC.cevicheria}`, 'json')).semaforo, 'pausado');
});
