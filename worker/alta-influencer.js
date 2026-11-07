import planes from '../src/data/planes-influencer.json' with { type: 'json' };
import { idDeAlta } from '../src/lib/id-alta.js';
import { json } from './ui.js';
import { cifrarClave, claveCorrecta, contar, crearSesion, formatoClave, mismoOrigen, usos } from './seguridad.js';
import { guardarCuenta, leerCuenta, idPorCorreo, ponerCorreo } from './pedidos.js';
import { comprobarCodigoCorreo, configCorreo, correoValido } from './correo.js';
import { comprobarCodigo, configVerificacion, telefonoPE } from './verificacion.js';

export async function handleAltaInfluencer(request, env) {
  if (request.method !== 'POST') return json({ error: 'Usa el formulario de registro.' }, 405);
  if (!mismoOrigen(request)) return json({ error: 'Abre el formulario desde tato.pe.' }, 403);
  if (!env.PEDIDOS_KV || !env.MEDIOS) return json({ error: 'El registro está temporalmente fuera de servicio.' }, 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Envía los datos desde el formulario.' }, 415);
  const lector = request.body?.getReader();
  if (!lector) return json({ error: 'No recibimos tus datos.' }, 400);
  const decoder = new TextDecoder();
  let cuerpo = '', bytes = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 6000) {
      await lector.cancel();
      return json({ error: 'El registro supera el tamaño permitido.' }, 413);
    }
    cuerpo += decoder.decode(value, { stream: true });
  }
  let datos;
  try { datos = JSON.parse(cuerpo + decoder.decode()); } catch { return json({ error: 'No pudimos leer tus datos.' }, 400); }
  const campo = (nombre, max) => typeof datos?.[nombre] === 'string' ? datos[nombre].trim().slice(0, max) : '';
  const token = campo('token', 37);
  const nombre = campo('nombre', 80);
  const whatsapp = telefonoPE(campo('whatsapp', 22));
  const region = campo('region', 80);
  const redes = campo('redes', 200);
  const contenido = campo('contenido', 500);
  const clave = datos?.clave;
  const correo = correoValido(campo('correo', 160));
  const claveCorreo = datos?.claveCorreo;
  if (datos?.version !== planes.version) return json({ error: 'Los planes se actualizaron. Recarga la página para revisar los precios vigentes.' }, 409);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token) || !formatoClave(clave) ||
      datos.sitio || !nombre || !/^9\d{8}$/.test(whatsapp) || !region || !redes || !contenido ||
      datos.mayor !== true || datos.autoriza !== true || datos.convenio !== true) {
    return json({ error: 'Completa los campos y confirma las casillas para crear tu cuenta.' }, 400);
  }

  const id = await idDeAlta(token);
  const limite = 'alta:' + (request.headers.get('CF-Connecting-IP') || 'local');
  if (await usos(env, limite) >= 6) return json({ error: 'Alcanzaste el límite de registros. Inténtalo mañana.' }, 429);
  const actual = await leerCuenta(env, id);
  if (actual) {
    if (actual.activa === false || !(await claveCorrecta(clave, actual.clave))) {
      await contar(env, limite, 86400);
      return json({ error: 'Ya existe esta cuenta. Entra con el ID que recibiste al crearla.' }, 409);
    }
  } else {
    // Correo verificado con un código (si el envío de correos está configurado; ver worker/correo.js).
    const conCorreo = configCorreo(env).listo;
    if (conCorreo) {
      if (!correo || !formatoClave(claveCorreo)) return json({ error: 'Escribe tu correo y confírmalo con el código que te llega.' }, 400);
      if (await idPorCorreo(env, correo)) return json({ error: 'Ese correo ya tiene una cuenta de creador. Entra en tato.pe/cuenta o recupera tu contraseña.' }, 409);
      const r = await comprobarCodigoCorreo(env, { desafio: campo('desafioCorreo', 40), codigo: campo('codigoCorreo', 8), correo, proposito: 'alta-creador', titular: `alta-creador:${token}` });
      if (r.error) return json({ error: r.error }, 400);
    }
    const verificacion = configVerificacion(env).estado;
    if (verificacion === 'pendiente') return json({ error: 'La verificación por WhatsApp todavía no está disponible.' }, 503);
    if (verificacion === 'activa') {
      const error = await comprobarCodigo(env, { desafio: campo('desafio', 33), codigo: campo('codigo', 7), numero: whatsapp, titular: `alta:${token}` });
      if (error) return json({ error }, 400);
    }
    await contar(env, limite, 86400);
    const nueva = {
      id, nombre, whatsapp, clave: await cifrarClave(clave), cambiarClave: false,
      activa: true, aceptaPedidos: true,
      ...(verificacion === 'activa' ? { whatsappVerificado: { numero: whatsapp, fecha: new Date().toISOString() } } : {}),
      porcentajeTato: planes.porcentajeTato,
      produccion: Object.fromEntries(planes.paquetes.map((p) => [p.nombre, p.produccion])),
      alta: { fecha: new Date().toISOString(), version: planes.version, perfil: { region, redes, contenido }, paquetes: planes.paquetes },
    };
    if (conCorreo) await ponerCorreo(env, nueva, correo, await cifrarClave(claveCorreo));
    else if (correo) nueva.correo = correo; // sin verificar: lo confirma después desde su cuenta
    await guardarCuenta(env, nueva);
  }
  const cookie = await crearSesion(env, request, id);
  const respuesta = json({ id, continuar: '/cuenta/identidad/' }, actual ? 200 : 201);
  respuesta.headers.set('Set-Cookie', cookie);
  return respuesta;
}
