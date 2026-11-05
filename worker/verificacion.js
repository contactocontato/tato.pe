import { aleatorio, contar, leerSesion, mismoOrigen, usos } from './seguridad.js';
import { leerCuenta } from './pedidos.js';
import { esc, json } from './ui.js';

const ACCION = 'creadores-whatsapp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DESAFIO = /^[A-Za-z0-9_-]{32}$/;
const VIGENCIA = 600;
export const telefonoPE = (s) => String(s ?? '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
export const telefonoConfirmado = (c) => Boolean(c.whatsappVerificado?.fecha && c.whatsappVerificado.numero === c.whatsapp);

export function configVerificacion(env) {
  if (env.VERIFICACION_WHATSAPP !== '1') return { estado: 'inactiva' };
  const listo = /^VA[0-9a-f]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID || '') &&
    /^SK[0-9a-f]{32}$/i.test(env.TWILIO_VERIFY_KEY_SID || '') &&
    env.TWILIO_VERIFY_KEY_SECRET && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY;
  return listo ? { estado: 'activa', sitekey: env.TURNSTILE_SITE_KEY, accion: ACCION } : { estado: 'pendiente' };
}

async function verify(env, ruta, datos) {
  const url = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${ruta}`;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.TWILIO_VERIFY_KEY_SID}:${env.TWILIO_VERIFY_KEY_SECRET}`)}` },
    body: new URLSearchParams(datos),
    signal: AbortSignal.timeout(8000),
  });
  return { status: respuesta.status, datos: await respuesta.json().catch(() => null) };
}

export async function enviarCodigo(request, env) {
  if (request.method !== 'POST') return json({ error: 'Usa el formulario.' }, 405);
  if (!mismoOrigen(request)) return json({ error: 'Abre el formulario desde tato.pe.' }, 403);
  if (configVerificacion(env).estado !== 'activa') return json({ error: 'El envío por WhatsApp todavía no está disponible.' }, 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || Number(request.headers.get('Content-Length') || 0) > 4096) {
    return json({ error: 'Solicitud no válida.' }, 400);
  }
  const lector = request.body?.getReader();
  if (!lector) return json({ error: 'Solicitud no válida.' }, 400);
  const decoder = new TextDecoder();
  let texto = '', total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > 4096) {
      await lector.cancel();
      return json({ error: 'Solicitud no válida.' }, 400);
    }
    texto += decoder.decode(value, { stream: true });
  }
  let datos;
  try { datos = JSON.parse(texto + decoder.decode()); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  if (typeof datos?.captcha !== 'string' || !datos.captcha || datos.captcha.length > 2048) {
    return json({ error: 'Completa el control de seguridad.' }, 400);
  }
  let numero, titular;
  if (datos.cuenta === true) {
    const sesion = await leerSesion(env, request);
    const cuenta = sesion && await leerCuenta(env, sesion.id);
    if (!cuenta || cuenta.activa === false || cuenta.cambiarClave) return json({ error: 'Vuelve a iniciar sesión.' }, 401);
    numero = cuenta.whatsapp;
    titular = `cuenta:${cuenta.id}`;
  } else {
    if (!UUID.test(datos.token || '')) return json({ error: 'Recarga la página para enviar un código.' }, 400);
    numero = telefonoPE(datos.whatsapp);
    titular = `alta:${datos.token}`;
  }
  if (!/^9\d{8}$/.test(numero)) return json({ error: 'Escribe un WhatsApp peruano de 9 dígitos.' }, 400);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const limiteIP = `otp-ip:${ip}`;
  const limiteNumero = `otp-num:${numero}`;
  if (await usos(env, limiteIP) >= 10 || await usos(env, limiteNumero) >= 3 || await usos(env, `otp-pausa:${numero}`)) {
    return json({ error: 'Espera un minuto antes de reenviar. Si alcanzaste el límite, vuelve en una hora.' }, 429);
  }
  try {
    const captcha = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: datos.captcha }),
      signal: AbortSignal.timeout(8000),
    });
    const control = await captcha.json();
    if (!captcha.ok || !control.success || control.action !== ACCION || control.hostname !== new URL(request.url).hostname) {
      return json({ error: 'El control de seguridad venció. Complétalo de nuevo.' }, 400);
    }
    await Promise.all([
      contar(env, limiteIP, 3600), contar(env, limiteNumero, 3600), contar(env, `otp-pausa:${numero}`, 60),
    ]);
    const enviado = await verify(env, 'Verifications', { To: `+51${numero}`, Channel: 'whatsapp', Locale: 'es' });
    if (enviado.status >= 300 || enviado.datos?.status !== 'pending' || !/^VE[0-9a-f]{32}$/i.test(enviado.datos.sid || '')) {
      return json({ error: 'No pudimos enviar el código por WhatsApp. Inténtalo más tarde.' }, 502);
    }
    const desafio = aleatorio(24);
    await env.PEDIDOS_KV.put(`otp:${desafio}`, JSON.stringify({ numero, titular, sid: enviado.datos.sid }), { expirationTtl: VIGENCIA });
    return json({ desafio });
  } catch {
    return json({ error: 'El servicio de códigos está temporalmente ocupado.' }, 503);
  }
}

export async function comprobarCodigo(env, { desafio, codigo, numero, titular }) {
  if (configVerificacion(env).estado !== 'activa') return 'El servicio de verificación todavía no está disponible.';
  if (!DESAFIO.test(desafio || '') || !/^\d{6}$/.test(codigo || '')) return 'Solicita el código por WhatsApp y escribe los seis dígitos.';
  const k = `otp:${desafio}`;
  const reto = await env.PEDIDOS_KV.get(k, 'json');
  if (!reto || reto.numero !== numero || reto.titular !== titular) return 'El código venció o el número cambió. Solicita otro.';
  const limite = `otp-intentos:${desafio}`;
  if (await usos(env, limite) >= 5) return 'Agotaste los intentos. Solicita un código nuevo.';
  await contar(env, limite, VIGENCIA);
  try {
    const r = await verify(env, 'VerificationCheck', { VerificationSid: reto.sid, Code: codigo });
    if (r.status >= 500 || r.status === 401 || r.status === 403) return 'No pudimos comprobar el código. Inténtalo más tarde.';
    if (r.status >= 300 || r.datos?.status !== 'approved' || r.datos.to !== `+51${numero}`) return 'El código no coincide o ya venció.';
    await env.PEDIDOS_KV.delete(k);
    return '';
  } catch {
    return 'El servicio de verificación no respondió. Inténtalo de nuevo.';
  }
}

export function bloqueCodigoCuenta(numero, desafio) {
  return `<form class="caja" method="post" action="/cuenta/telefono/" data-verificacion="cuenta">
  <p>Enviaremos el código al número +51 ••• ••• ${esc(numero.slice(-3))}.</p>
  <div data-otp hidden>
    <div data-turnstile></div>
    <button class="btn linea chico" type="button" data-otp-enviar>Enviar código por WhatsApp</button>
    <p class="nota" data-otp-estado role="status"></p>
    <input type="hidden" name="desafio" value="${DESAFIO.test(desafio || '') ? esc(desafio) : ''}">
    <label for="otp-codigo">Código de seguridad</label>
    <input type="text" id="otp-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
  </div>
  <p data-otp-error class="aviso ojo" role="status" hidden></p>
  <div class="acciones"><button class="btn fucsia" type="submit" data-otp-submit disabled>Verificar mi número</button></div>
</form><script type="module" src="/creadores/verificacion.js"></script>`;
}
