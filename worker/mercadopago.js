// Mercado Pago: conexión de la cuenta de cada influencer (OAuth), links de pago y lectura de pagos.
//
// - Adelanto: se cobra con la cuenta de Tato (MP_ACCESS_TOKEN) y va entero a él.
// - Saldo: se cobra con la cuenta del influencer (su token de OAuth) y Split de Pagos 1:1 le pasa
//   a Tato su parte como `marketplace_fee`. Mercado Pago descuenta primero su comisión del cobro
//   del influencer y después la parte de Tato.
// Documentación: https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/overview
//
// Secretos: MP_CLIENT_ID y MP_CLIENT_SECRET (la aplicación de Tato en Mercado Pago Developers),
// MP_ACCESS_TOKEN (token de producción de la cuenta de Tato) y MP_WEBHOOK_SECRET (clave secreta de los webhooks).
// MP_API y MP_AUTH solo se cambian para pruebas locales.

export const REDIRECCION = 'https://tato.pe/api/mp/conectado';

const api = (env) => (env.MP_API || 'https://api.mercadopago.com').replace(/\/+$/, '');
const auth = (env) => (env.MP_AUTH || 'https://auth.mercadopago.com').replace(/\/+$/, '');
const redireccion = (env) => env.MP_REDIRECT_URI || REDIRECCION;

/** ¿Está la aplicación de Tato configurada para cobrar y dividir pagos? */
export const mpListo = (env) => Boolean(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET && env.MP_ACCESS_TOKEN);

export function urlConexion(env, state) {
  const u = new URL(`${auth(env)}/authorization`);
  u.searchParams.set('client_id', env.MP_CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('platform_id', 'mp');
  u.searchParams.set('state', state);
  u.searchParams.set('redirect_uri', redireccion(env));
  return u.toString();
}

async function pedir(env, ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${api(env)}${ruta}`, {
      method: metodo,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`Mercado Pago respondió ${res.status}: ${data.message || data.error || 'sin detalle'}`);
      e.status = res.status;
      throw e;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

const guardarTokens = (data) => ({
  userId: String(data.user_id || ''),
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  vence: Date.now() + Number(data.expires_in || 15552000) * 1000,
  conectada: new Date().toISOString(),
});

/** Canjea el código que devuelve Mercado Pago por los tokens de la cuenta del influencer. */
export async function canjearCodigo(env, code) {
  const data = await pedir(env, '/oauth/token', {
    metodo: 'POST',
    cuerpo: { client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redireccion(env) },
  });
  if (!data.access_token) throw new Error('Mercado Pago no devolvió el permiso.');
  return guardarTokens(data);
}

/** Renueva el permiso (dura 180 días). */
export async function renovar(env, mp) {
  const data = await pedir(env, '/oauth/token', {
    metodo: 'POST',
    cuerpo: { client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: mp.refreshToken },
  });
  return { ...guardarTokens(data), conectada: mp.conectada };
}

/**
 * Crea el link de pago (Checkout Pro). `comision` es la parte de Tato en un pago dividido:
 * solo va cuando se cobra con el token del influencer.
 */
export async function crearLink(env, token, { id, titulo, monto, comision, referencia, notificacion, volver }) {
  const cuerpo = {
    items: [{ id, title: titulo.slice(0, 250), quantity: 1, unit_price: monto, currency_id: 'PEN' }],
    external_reference: referencia,
    notification_url: notificacion,
    back_urls: { success: `${volver}&estado=ok`, pending: `${volver}&estado=pendiente`, failure: `${volver}&estado=error` },
    auto_return: 'approved',
    statement_descriptor: 'TATO STUDIO',
  };
  if (comision) cuerpo.marketplace_fee = comision;
  const data = await pedir(env, '/checkout/preferences', { token, metodo: 'POST', cuerpo });
  const link = env.MP_SANDBOX === '1' ? data.sandbox_init_point || data.init_point : data.init_point;
  if (!link) throw new Error('Mercado Pago no devolvió el link de pago.');
  return { preferencia: data.id, link, creado: new Date().toISOString() };
}

export const leerPago = (env, token, id) => pedir(env, `/v1/payments/${encodeURIComponent(id)}`, { token });

/** Lo que Mercado Pago cobró y lo que se llevó Tato, según el detalle del pago. */
export function comisiones(pago) {
  let mp = 0;
  let tato = 0;
  for (const f of pago.fee_details || []) {
    if (f.type === 'mercadopago_fee') mp += Number(f.amount) || 0;
    else if (f.type === 'application_fee' || f.type === 'marketplace_fee') tato += Number(f.amount) || 0;
  }
  return { mp: Math.round(mp * 100) / 100, tato: Math.round(tato * 100) / 100 };
}

/**
 * Revisa la firma de la notificación (cabecera x-signature) con MP_WEBHOOK_SECRET.
 * Devuelve true si es válida, false si es inválida y null si no hay firma o clave para revisar.
 * Aunque la firma falte, el pago siempre se vuelve a leer en la API de Mercado Pago antes de usarlo.
 */
export async function firmaValida(env, request, dataId) {
  const firma = request.headers.get('x-signature');
  if (!firma || !env.MP_WEBHOOK_SECRET) return null;
  const partes = Object.fromEntries(firma.split(',').map((p) => p.split('=').map((s) => s.trim())));
  if (!partes.ts || !partes.v1) return false;
  const requestId = request.headers.get('x-request-id');
  let plantilla = '';
  if (dataId) plantilla += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) plantilla += `request-id:${requestId};`;
  plantilla += `ts:${partes.ts};`;
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey('raw', enc.encode(env.MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', llave, enc.encode(plantilla)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== partes.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return diff === 0;
}
