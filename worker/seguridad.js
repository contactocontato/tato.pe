// Contraseñas, sesiones y límites de intentos de las cuentas de influencer (/cuenta/).
//
// Contraseñas en dos pasos, para que el servidor nunca vea la contraseña y para no pasar el límite de
// CPU de Cloudflare (10 ms por pedido en el plan gratis):
//   1. En el navegador: PBKDF2-SHA256 de la contraseña con 200 000 vueltas y la sal «tato.pe/cuenta:<id>».
//      Eso es lo único que viaja (script SCRIPT_CLAVE).
//   2. En el Worker: otra pasada PBKDF2-SHA256 de 5 000 vueltas con una sal al azar por cuenta.
//      Eso es lo único que se guarda.
// La sesión es una cookie HttpOnly con un número al azar; en KV se guarda a qué cuenta pertenece.

const VUELTAS = 5000;
export const VUELTAS_NAVEGADOR = 200_000;
const COOKIE = 'tato_cuenta';
const DIAS_SESION = 14;
const enc = new TextEncoder();

export const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Texto al azar seguro para sesiones y estados de OAuth. */
export const aleatorio = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** Compara dos textos sin delatar por el tiempo en qué parte difieren. */
export function igual(a, b) {
  const ea = enc.encode(String(a));
  const eb = enc.encode(String(b));
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

async function pbkdf2(texto, sal, vueltas) {
  const llave = await crypto.subtle.importKey('raw', enc.encode(texto), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, llave, 256);
}

/** Lo que manda el navegador: 43 caracteres base64url. */
export const formatoClave = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Paso 1 (lo hace el navegador; aquí solo para pruebas y para documentar el cálculo). */
export async function claveDelNavegador(id, clave) {
  return b64url(await pbkdf2(String(clave).normalize('NFC'), enc.encode(`tato.pe/cuenta:${String(id).trim().toLowerCase()}`), VUELTAS_NAVEGADOR));
}

/** Paso 2: lo que se guarda a partir de lo que mandó el navegador. */
export async function cifrarClave(desdeNavegador, sal = crypto.getRandomValues(new Uint8Array(16)), vueltas = VUELTAS) {
  return { alg: 'pbkdf2-sha256', vueltasNavegador: VUELTAS_NAVEGADOR, vueltas, sal: b64url(sal), hash: b64url(await pbkdf2(desdeNavegador, sal, vueltas)) };
}

export async function claveCorrecta(desdeNavegador, guardada) {
  if (!formatoClave(desdeNavegador) || !guardada?.sal || !guardada?.hash) return false;
  const h = await cifrarClave(desdeNavegador, desdeB64url(guardada.sal), guardada.vueltas || VUELTAS);
  return igual(h.hash, guardada.hash);
}

/**
 * Script de los formularios con contraseña. Cada <input type="password" data-hash="campo"> se convierte,
 * antes de enviar, en el campo oculto name="campo" (paso 1). El input visible no tiene name: la contraseña
 * no sale del navegador. El id de la cuenta sale del campo name="id" o de data-id en el <form>.
 * data-repetir="campo" pide que dos contraseñas coincidan; data-min="8", un largo mínimo.
 * Botones [data-generar] generan una clave temporal en el campo indicado (panel de Tato).
 */
export const SCRIPT_CLAVE = `<script>
(() => {
  const enc = new TextEncoder();
  const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  async function paso1(id, clave) {
    const k = await crypto.subtle.importKey('raw', enc.encode(clave.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('tato.pe/cuenta:' + id.trim().toLowerCase()), iterations: ${VUELTAS_NAVEGADOR} }, k, 256));
  }
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function temporal() {
    let s = '';
    while (s.length < 12) for (const b of crypto.getRandomValues(new Uint8Array(24))) if (b < 256 - (256 % letras.length) && s.length < 12) s += letras[b % letras.length];
    return s;
  }
  document.querySelectorAll('[data-generar]').forEach((b) => b.addEventListener('click', () => {
    const campo = document.getElementById(b.dataset.generar);
    campo.value = temporal();
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  document.querySelectorAll('form[data-clave]').forEach((f) => f.addEventListener('submit', async (e) => {
    if (f.dataset.listo) return;
    e.preventDefault();
    const aviso = f.querySelector('[data-aviso-clave]');
    const decir = (t) => { if (aviso) { aviso.textContent = t; aviso.hidden = !t; } };
    const id = (f.querySelector('[name=id]')?.value || f.dataset.id || '').trim();
    if (!id) return decir('Escribe tu ID.');
    for (const c of f.querySelectorAll('input[data-hash]')) {
      if (!c.value) return decir(c.dataset.falta || 'Escribe la contraseña.');
      const min = Number(c.dataset.min || 0);
      if (min && c.value.length < min) return decir('La contraseña nueva tiene que tener al menos ' + min + ' caracteres.');
      if (min && c.value.toLowerCase().includes(id.toLowerCase())) return decir('No uses tu ID dentro de la contraseña.');
      if (c.dataset.repetir && c.value !== f.querySelector('#' + c.dataset.repetir)?.value) return decir('Las dos contraseñas nuevas no coinciden.');
    }
    if (!window.crypto?.subtle) return decir('Este navegador no puede entrar. Actualízalo o usa Chrome.');
    const boton = f.querySelector('button[type=submit], button:not([type])');
    if (boton) { boton.disabled = true; boton.dataset.texto = boton.textContent; boton.textContent = 'Un momento…'; }
    try {
      for (const c of f.querySelectorAll('input[data-hash]')) f.querySelector('input[type=hidden][name="' + c.dataset.hash + '"]').value = await paso1(id, c.value);
      f.dataset.listo = '1';
      decir('');
      f.submit();
    } catch (err) {
      decir('No se pudo preparar la contraseña. Recarga la página e inténtalo otra vez.');
      if (boton) { boton.disabled = false; boton.textContent = boton.dataset.texto; }
    }
  }));
})();
</script>`;

// ---------- Sesiones ----------

const leerCookie = (request, nombre) =>
  (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${nombre}=`))?.slice(nombre.length + 1) || '';

const atributos = (request, maxAge) => {
  const segura = new URL(request.url).protocol === 'https:';
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${segura ? '; Secure' : ''}`;
};

/** Crea la sesión y devuelve la cabecera Set-Cookie. */
export async function crearSesion(env, request, id) {
  const token = aleatorio(32);
  await env.PEDIDOS_KV.put(`sesion:${token}`, JSON.stringify({ id, creada: new Date().toISOString() }), {
    expirationTtl: DIAS_SESION * 86400,
    metadata: { id },
  });
  return `${COOKIE}=${token}; ${atributos(request, DIAS_SESION * 86400)}`;
}

/** La cuenta de la sesión ({ id, token }) o null. */
export async function leerSesion(env, request) {
  const token = leerCookie(request, COOKIE);
  if (!token || token.length > 100) return null;
  const s = await env.PEDIDOS_KV.get(`sesion:${token}`, 'json');
  return s?.id ? { id: s.id, token } : null;
}

export async function cerrarSesion(env, request) {
  const token = leerCookie(request, COOKIE);
  if (token && token.length <= 100) await env.PEDIDOS_KV.delete(`sesion:${token}`);
  return `${COOKIE}=; ${atributos(request, 0)}`;
}

/** Cierra todas las sesiones de una cuenta, salvo la indicada (al cambiar la contraseña). */
export async function cerrarSesionesDe(env, id, salvo = '') {
  let cursor;
  do {
    const lote = await env.PEDIDOS_KV.list({ prefix: 'sesion:', cursor });
    for (const k of lote.keys) {
      if (k.metadata?.id === id && k.name !== `sesion:${salvo}`) await env.PEDIDOS_KV.delete(k.name);
    }
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
}

// ---------- Otros ----------

/** true si el formulario viene de esta misma web. Los navegadores mandan Origin en todos los POST. */
export function mismoOrigen(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // sin Origin no viene de un navegador, así que no trae la cookie de nadie
  return origin === new URL(request.url).origin || origin === 'https://tato.pe';
}

/**
 * Cuenta usos en una ventana de tiempo. No es exacto (KV no es atómico), pero alcanza
 * para frenar a quien prueba contraseñas o manda solicitudes sin parar.
 */
export async function contar(env, clave, segundos) {
  const k = `limite:${clave}`;
  const n = Number((await env.PEDIDOS_KV.get(k)) || 0) + 1;
  await env.PEDIDOS_KV.put(k, String(n), { expirationTtl: Math.max(60, segundos) });
  return n;
}
export const usos = async (env, clave) => Number((await env.PEDIDOS_KV.get(`limite:${clave}`)) || 0);
export const borrarConteo = (env, clave) => env.PEDIDOS_KV.delete(`limite:${clave}`);
