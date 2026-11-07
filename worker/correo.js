// Correos de tato.pe: códigos de verificación y avisos de los pedidos.
//
// Proveedor (el primero que esté configurado):
//   - Cloudflare Email Service: binding `send_email` llamado EMAIL en wrangler.jsonc (pide el plan Workers Paid).
//   - Resend: secreto RESEND_API_KEY (tiene plan gratis). El dominio tato.pe se verifica una vez en Resend.
// Remitente: variable CORREO_REMITENTE, por ejemplo «Tato Studio <avisos@tato.pe>».
// Sin proveedor o sin remitente, no se manda nada y los formularios funcionan sin código (ver configCorreo).
//
// Códigos (KV PEDIDOS_KV):
//   codigo-correo:<desafío>   { correo, proposito, titular, hash, extra }  15 minutos
//   limite:correo-*           conteos para que nadie mande correos sin parar

import { esc } from './ui.js';
import { aleatorio, contar, usos } from './seguridad.js';

const VIGENCIA = 900;
const DESAFIO = /^[A-Za-z0-9_-]{32}$/;
export const PROPOSITOS = ['alta-creador', 'registro-negocio', 'entrar-negocio', 'recuperar-creador', 'correo-creador'];

/** El correo en minúsculas si tiene forma de correo; si no, ''. */
export function correoValido(s) {
  const c = String(s ?? '').trim().toLowerCase();
  return c.length <= 160 && /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(c) && !c.includes('..') ? c : '';
}

/** «a•••@gmail.com»: para mostrar a quién se mandó el código sin escribirlo entero. */
export const correoOculto = (c) => {
  const [u, d] = String(c || '').split('@');
  return d ? `${u.slice(0, 2)}•••@${d}` : '';
};

const remitente = (env) => {
  const r = String(env.CORREO_REMITENTE || '').trim();
  return /^[^<>]*<[^\s@<>]+@[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+$/.test(r) ? r : '';
};

export function configCorreo(env) {
  const via = env.EMAIL && typeof env.EMAIL.send === 'function' ? 'cloudflare' : env.RESEND_API_KEY ? 'resend' : null;
  return { listo: Boolean(via && remitente(env)), via, remitente: remitente(env) };
}

/** Manda un correo. Devuelve true si el proveedor lo aceptó. Nunca lanza error. */
export async function enviarCorreo(env, { para, asunto, texto, html }) {
  const cfg = configCorreo(env);
  const destino = correoValido(para);
  if (!cfg.listo || !destino) return false;
  try {
    if (cfg.via === 'cloudflare') {
      await env.EMAIL.send({ from: cfg.remitente, to: destino, subject: asunto, text: texto, html });
      return true;
    }
    const base = (env.CORREO_API || 'https://api.resend.com').replace(/\/+$/, '');
    const r = await fetch(`${base}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.remitente, to: [destino], subject: asunto, text: texto, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('Correo: el proveedor respondió', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error('Correo: no se pudo enviar', e);
    return false;
  }
}

/**
 * Un correo con la marca: título, párrafos y, si hay, un código grande y un botón.
 * Devuelve { texto, html } para enviarCorreo.
 */
export function plantilla({ titulo, parrafos = [], codigo = '', boton = null, pie = '' }) {
  const texto = [titulo, '', ...(codigo ? [`Tu código: ${codigo}`, ''] : []), ...parrafos.flatMap((p) => [p, '']),
    ...(boton ? [`${boton.texto}: ${boton.url}`, ''] : []), pie || 'Tato Studio · tato.pe'].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#E9E4DD;font-family:Arial,Helvetica,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9E4DD;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#F4F1EC;border:1px solid #D3CCC1;border-radius:14px">
<tr><td style="padding:22px 26px 6px;font:800 15px Arial,sans-serif;letter-spacing:.02em;color:#E2037E">TATO STUDIO</td></tr>
<tr><td style="padding:6px 26px 4px"><h1 style="margin:0;font:800 23px/1.25 Arial,sans-serif;color:#141414">${esc(titulo)}</h1></td></tr>
${codigo ? `<tr><td style="padding:16px 26px 4px"><div style="display:inline-block;background:#141414;color:#fff;border-radius:10px;padding:12px 20px;font:700 30px/1 'Courier New',monospace;letter-spacing:.28em">${esc(codigo)}</div></td></tr>` : ''}
${parrafos.map((p) => `<tr><td style="padding:12px 26px 0;font:16px/1.5 Arial,sans-serif;color:#2b2b2b">${esc(p)}</td></tr>`).join('')}
${boton ? `<tr><td style="padding:20px 26px 0"><a href="${esc(boton.url)}" style="display:inline-block;background:#E2037E;color:#fff;text-decoration:none;font:700 16px Arial,sans-serif;padding:13px 20px;border-radius:999px">${esc(boton.texto)}</a></td></tr>` : ''}
<tr><td style="padding:24px 26px 22px;font:13px/1.5 Arial,sans-serif;color:#5B5B57">${esc(pie || 'Tato Studio · tato.pe')}</td></tr>
</table></td></tr></table></body></html>`;
  return { texto, html };
}

// ---------- Códigos de verificación ----------

const sha = async (s) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
};

function codigoAlAzar() {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0'); // sin sesgo
  }
}

const ASUNTOS = {
  'alta-creador': ['Confirma tu correo', 'Escribe este código en tato.pe para crear tu cuenta de creador.'],
  'registro-negocio': ['Confirma el correo de tu negocio', 'Escribe este código en tato.pe para terminar el registro de tu negocio.'],
  'entrar-negocio': ['Tu código para entrar', 'Escribe este código en tato.pe/negocio para entrar al panel de tu negocio.'],
  'recuperar-creador': ['Cambia tu contraseña', 'Escribe este código en tato.pe/cuenta para crear una contraseña nueva.'],
  'correo-creador': ['Confirma tu correo', 'Escribe este código en tu cuenta de tato.pe para guardar este correo.'],
};

/**
 * Crea un código y lo manda al correo. `enviar: false` crea el desafío sin mandar nada: sirve para no
 * revelar si un correo está registrado (al entrar o al recuperar la contraseña).
 * Devuelve { desafio } o { error, status }.
 */
export async function pedirCodigo(env, request, { correo, proposito, titular, extra = null, enviar = true }) {
  if (!PROPOSITOS.includes(proposito)) return { error: 'Solicitud no válida.', status: 400 };
  if (!configCorreo(env).listo) return { error: 'El envío de códigos por correo todavía no está disponible.', status: 503 };
  const c = correoValido(correo);
  if (!c) return { error: 'Revisa tu correo: parece que le falta algo.', status: 400 };
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const dir = (await sha(c)).slice(0, 24);
  if (await usos(env, `correo-pausa:${dir}`)) return { error: 'Ya te mandamos un código. Espera un minuto antes de pedir otro.', status: 429 };
  if ((await usos(env, `correo-ip:${ip}`)) >= 15 || (await usos(env, `correo-dir:${dir}`)) >= 6) {
    return { error: 'Pediste muchos códigos. Vuelve a intentarlo en una hora.', status: 429 };
  }
  await Promise.all([contar(env, `correo-ip:${ip}`, 3600), contar(env, `correo-dir:${dir}`, 3600), contar(env, `correo-pausa:${dir}`, 60)]);
  const desafio = aleatorio(24);
  const codigo = codigoAlAzar();
  await env.PEDIDOS_KV.put(`codigo-correo:${desafio}`, JSON.stringify({
    correo: c, proposito, titular, extra, hash: await sha(`${desafio}:${codigo}`), creado: new Date().toISOString(),
  }), { expirationTtl: VIGENCIA });
  if (enviar) {
    const [titulo, linea] = ASUNTOS[proposito];
    const ok = await enviarCorreo(env, {
      para: c,
      asunto: `${codigo} es tu código de Tato Studio`,
      ...plantilla({ titulo, codigo, parrafos: [linea, 'Vence en 15 minutos. Si no lo pediste, ignora este correo: nadie puede entrar sin este código.'] }),
    });
    if (!ok) {
      await env.PEDIDOS_KV.delete(`codigo-correo:${desafio}`);
      return { error: 'No pudimos mandar el correo. Revisa que esté bien escrito o inténtalo en unos minutos.', status: 502 };
    }
  }
  return { desafio };
}

/**
 * Revisa el código. Devuelve { ok: true, extra } o { error }.
 * Cada desafío acepta 5 intentos; si el código es correcto, se borra (sirve una sola vez).
 */
export async function comprobarCodigoCorreo(env, { desafio, codigo, correo, proposito, titular }) {
  if (!configCorreo(env).listo) return { error: 'El envío de códigos por correo todavía no está disponible.' };
  const cod = String(codigo ?? '').replace(/\D/g, '');
  if (!DESAFIO.test(desafio || '') || cod.length !== 6) return { error: 'Escribe los 6 números del código que te llegó al correo.' };
  const k = `codigo-correo:${desafio}`;
  const reto = await env.PEDIDOS_KV.get(k, 'json');
  if (!reto || reto.proposito !== proposito || (correo != null && reto.correo !== correoValido(correo)) || (titular != null && reto.titular !== titular)) {
    return { error: 'El código venció o el correo cambió. Pide uno nuevo.' };
  }
  if ((await contar(env, `correo-intentos:${desafio}`, VIGENCIA)) > 5) return { error: 'Probaste muchas veces. Pide un código nuevo.' };
  if (reto.hash !== (await sha(`${desafio}:${cod}`))) return { error: 'El código no coincide. Revisa el último correo que te llegó.' };
  await env.PEDIDOS_KV.delete(k);
  return { ok: true, correo: reto.correo, titular: reto.titular, extra: reto.extra };
}

// ---------- API para los formularios de la web ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** GET /api/correo/estado: si los formularios deben pedir código. */
export const estadoCorreo = (env) => json({ activo: configCorreo(env).listo });

/**
 * POST /api/correo/codigo { correo, proposito: 'alta-creador' | 'registro-negocio', token }
 * El token es un UUID que crea la página: el código solo sirve para ese formulario.
 */
export async function handleCodigoCorreo(request, env) {
  if (request.method !== 'POST') return json({ error: 'Usa el formulario.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin && origin !== 'https://tato.pe') return json({ error: 'Abre el formulario desde tato.pe.' }, 403);
  if (Number(request.headers.get('Content-Length') || 0) > 2000) return json({ error: 'Solicitud no válida.' }, 413);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== 'object' || b.sitio) return json({ error: 'Solicitud no válida.' }, 400);
  const proposito = ['alta-creador', 'registro-negocio'].includes(b.proposito) ? b.proposito : '';
  if (!proposito || !UUID.test(String(b.token || ''))) return json({ error: 'Recarga la página y vuelve a intentarlo.' }, 400);
  const correo = correoValido(b.correo);
  if (!correo) return json({ error: 'Revisa tu correo: parece que le falta algo.' }, 400);
  if (proposito === 'alta-creador' && (await env.PEDIDOS_KV.get(`correo-creador:${correo}`))) {
    return json({ error: 'Ese correo ya tiene una cuenta de creador. Entra en tato.pe/cuenta o recupera tu contraseña.' }, 409);
  }
  const r = await pedirCodigo(env, request, { correo, proposito, titular: `${proposito}:${b.token}` });
  return r.error ? json({ error: r.error }, r.status) : json({ desafio: r.desafio, enviadoA: correoOculto(correo) });
}
