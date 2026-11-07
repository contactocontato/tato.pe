// Acceso del negocio: después de registrar su negocio, el negocio elige un usuario y una contraseña
// para entrar a su panel (/negocio/). Una cuenta puede tener varios RUC; cada RUC, una sola cuenta.
//
// KV NEGOCIOS_KV:
//   cuenta-negocio:<usuario>   { usuario, nombre, correo, rucs, clave, creada, ultimoIngreso, claveCambiada }
//   ruc-cuenta:<ruc>           usuario dueño del RUC
//   acceso-negocio:<token>     { modo: 'crear', rucs, nombre, correo } o { modo: 'cambiar', usuario }   1 hora
//
// La contraseña se cifra primero en el navegador (SCRIPT_CLAVE con data-prefijo="negocio-") y otra vez aquí.

import { esc } from './ui.js';
import { aleatorio, cifrarClave, claveCorrecta, formatoClave, crearSesionNegocio, cerrarSesionesNegocio, contar, borrarConteo } from './seguridad.js';
import { pagina, respuesta, ir } from './portal.js';

const HORA = 3600;

/** El usuario en minúsculas si es válido; si no, ''. */
export function usuarioValido(u) {
  const v = String(u ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{3,29}$/.test(v) && !/[._-]{2}/.test(v) ? v : '';
}

export const leerCuentaNegocio = (env, usuario) => (usuario ? env.NEGOCIOS_KV.get(`cuenta-negocio:${usuario}`, 'json') : null);
export const cuentaDeRuc = (env, ruc) => env.NEGOCIOS_KV.get(`ruc-cuenta:${ruc}`);
export const guardarCuentaNegocio = (env, c) => env.NEGOCIOS_KV.put(`cuenta-negocio:${c.usuario}`, JSON.stringify(c), {
  metadata: { rucs: c.rucs.slice(0, 10), creada: c.creada },
});

/** Los registros de los negocios de una cuenta. */
export async function negociosDeCuenta(env, cuenta) {
  if (!cuenta) return [];
  const regs = await Promise.all((cuenta.rucs || []).map((ruc) => env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json')));
  return regs.filter(Boolean);
}

/** Suma un RUC a una cuenta (si ese RUC no tiene otra). Devuelve true si quedó en la cuenta. */
export async function sumarRuc(env, cuenta, ruc) {
  const dueno = await cuentaDeRuc(env, ruc);
  if (dueno && dueno !== cuenta.usuario) return false;
  if (!cuenta.rucs.includes(ruc)) {
    cuenta.rucs = [...cuenta.rucs, ruc].slice(-20);
    await guardarCuentaNegocio(env, cuenta);
  }
  await env.NEGOCIOS_KV.put(`ruc-cuenta:${ruc}`, cuenta.usuario);
  return true;
}

/** Un enlace de 1 hora para crear el acceso (o cambiar la contraseña). Devuelve el token. */
export async function tokenAcceso(env, datos) {
  const token = aleatorio(24);
  await env.NEGOCIOS_KV.put(`acceso-negocio:${token}`, JSON.stringify(datos), { expirationTtl: HORA });
  return token;
}

const volverValido = (v) => (/^\/negocio\/[A-Za-z0-9/_?=&.-]*$/.test(String(v || '')) ? v : '/negocio/');

function paginaAcceso({ token, datos, volver, error = '', usuario = '' }) {
  const cambiar = datos.modo === 'cambiar';
  return pagina({
    titulo: cambiar ? 'Nueva contraseña' : 'Crea tu acceso',
    error,
    inicio: '/negocio/',
    cuerpo: `<h1>${cambiar ? 'Crea una contraseña nueva' : 'Crea tu <span class="fx">acceso</span>'}</h1>
<p class="sub">${cambiar ? `Para el usuario <b>${esc(datos.usuario)}</b>.` : `Con tu usuario y tu contraseña entras al panel de tu negocio${datos.nombre ? `, ${esc(datos.nombre.split(' ')[0])}` : ''}: ahí pides tus videos, apruebas tu storytelling y sigues cada pedido.`}</p>
<form class="caja" method="post" action="/negocio/acceso/" data-clave data-prefijo="negocio-"${cambiar ? ` data-id="${esc(datos.usuario)}"` : ''}>
  <input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="volver" value="${esc(volver)}">
  ${cambiar ? '' : `<label for="id">Tu usuario</label>
  <input id="id" name="id" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="4" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{3,29}" value="${esc(usuario)}" placeholder="cevicheria-ana">
  <p class="nota">De 4 a 30 letras o números, sin espacios. Puedes usar punto, guion o guion bajo.</p>`}
  <label for="nueva">Tu contraseña</label>
  <input id="nueva" type="password" autocomplete="new-password" required data-hash="clave" data-min="8" data-repetir="repetir"><input type="hidden" name="clave">
  <label for="repetir">Repite tu contraseña</label>
  <input id="repetir" type="password" autocomplete="new-password" required>
  <p class="nota">Al menos 8 caracteres. Que no sea la misma de otras cuentas.</p>
  <p class="aviso err" data-aviso-clave hidden></p>
  <div class="acciones"><button class="btn fucsia" type="submit">${cambiar ? 'Guardar y entrar' : 'Crear mi acceso y entrar'}</button></div>
</form>`,
  });
}

/** GET/POST /negocio/acceso/?t=: crea el usuario y la contraseña (o cambia la contraseña) y deja la sesión abierta. */
export async function handleAcceso(request, env, url) {
  const post = request.method === 'POST';
  const f = post ? await request.formData() : null;
  const token = String((f ? f.get('t') : url.searchParams.get('t')) || '');
  const volver = volverValido(f ? f.get('volver') : url.searchParams.get('volver'));
  const datos = /^[A-Za-z0-9_-]{32}$/.test(token) ? await env.NEGOCIOS_KV.get(`acceso-negocio:${token}`, 'json') : null;
  if (!datos) {
    return respuesta(pagina({ titulo: 'Enlace vencido', inicio: '/negocio/', cuerpo: '<h1>Este enlace ya no sirve</h1><p class="sub">Pasó más de una hora o ya lo usaste. <a href="/negocio/">Entra con tu usuario</a> o, si todavía no lo tienes, entra con tu RUC.</p>' }), 410);
  }
  if (!post) return respuesta(paginaAcceso({ token, datos, volver }));

  const clave = String(f.get('clave') || '');
  if (!formatoClave(clave)) return respuesta(paginaAcceso({ token, datos, volver, error: 'Escribe tu contraseña.' }), 400);

  if (datos.modo === 'cambiar') {
    const cuenta = await leerCuentaNegocio(env, datos.usuario);
    if (!cuenta) return ir('/negocio/');
    cuenta.clave = await cifrarClave(clave);
    cuenta.claveCambiada = new Date().toISOString();
    await guardarCuentaNegocio(env, cuenta);
    await env.NEGOCIOS_KV.delete(`acceso-negocio:${token}`);
    await cerrarSesionesNegocio(env, cuenta.usuario);
    return ir(volver === '/negocio/' ? '/negocio/?m=clave' : volver, await crearSesionNegocio(env, request, cuenta.usuario));
  }

  const usuario = usuarioValido(f.get('id'));
  if (!usuario) return respuesta(paginaAcceso({ token, datos, volver, usuario: String(f.get('id') || ''), error: 'Revisa tu usuario: de 4 a 30 letras o números, sin espacios.' }), 400);
  if ((await contar(env, `acceso-negocio:${request.headers.get('CF-Connecting-IP') || 'local'}`, HORA)) > 20) {
    return respuesta(paginaAcceso({ token, datos, volver, usuario, error: 'Probaste muchas veces. Vuelve a intentarlo en una hora.' }), 429);
  }
  if (await leerCuentaNegocio(env, usuario)) return respuesta(paginaAcceso({ token, datos, volver, usuario, error: 'Ese usuario ya existe. Elige otro.' }), 409);
  for (const ruc of datos.rucs) {
    if (await cuentaDeRuc(env, ruc)) return respuesta(paginaAcceso({ token, datos, volver, error: 'Este negocio ya tiene un acceso. Entra con su usuario o pide una contraseña nueva.' }), 409);
  }
  const ahora = new Date().toISOString();
  const cuenta = { usuario, nombre: datos.nombre || '', correo: datos.correo || '', rucs: [], clave: await cifrarClave(clave), creada: ahora, ultimoIngreso: ahora };
  await guardarCuentaNegocio(env, cuenta);
  for (const ruc of datos.rucs) await sumarRuc(env, cuenta, ruc);
  await env.NEGOCIOS_KV.delete(`acceso-negocio:${token}`);
  return ir(volver === '/negocio/' ? '/negocio/?m=bienvenida' : volver, await crearSesionNegocio(env, request, usuario));
}

/** Entra con usuario y contraseña. Devuelve { usuario } o { error }. */
export async function entrarConClave(env, request, usuarioEscrito, clave) {
  const usuario = usuarioValido(usuarioEscrito);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!usuario || !formatoClave(clave)) return { error: 'El usuario o la contraseña no coinciden.' };
  if ((await contar(env, `negocio-entrar-ip:${ip}`, HORA)) > 30) return { error: 'Probaste muchas veces. Espera un rato.' };
  const intentos = await contar(env, `negocio-entrar:${usuario}`, 900);
  if (intentos > 5) return { error: 'Probaste muchas veces. Espera 15 minutos o crea una contraseña nueva.' };
  const cuenta = await leerCuentaNegocio(env, usuario);
  if (!cuenta || !(await claveCorrecta(clave, cuenta.clave))) return { error: 'El usuario o la contraseña no coinciden.' };
  await borrarConteo(env, `negocio-entrar:${usuario}`);
  cuenta.ultimoIngreso = new Date().toISOString();
  await guardarCuentaNegocio(env, cuenta);
  return { usuario };
}
