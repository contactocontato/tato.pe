// Worker de tato.pe.
// - La web estática (dist/) la sirve Cloudflare directo, sin pasar por aquí.
// - Este código solo atiende /api/* y /panel/* (ver run_worker_first en wrangler.jsonc).
//
// Conexión con TikTok (app «Tatostudio», Login Kit + Display API):
//   /panel/tiktok/            panel privado con las cifras de los videos (pide contraseña)
//   /panel/tiktok/conectar    inicia el permiso en TikTok
//   /panel/tiktok/desconectar quita el permiso y borra los tokens (POST)
//   /panel/tiktok/data.json   las mismas cifras en JSON, para otras herramientas internas
//   /api/tiktok/callback      a donde vuelve TikTok con el código (redirect URI registrado)
//
// Secretos (Cloudflare → Workers → tato-pe → Configuración → Variables y secretos):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, PANEL_PASSWORD
// Almacenamiento: KV con el binding TIKTOK_KV (tokens y estados temporales del login).

const REDIRECT_URI = 'https://tato.pe/api/tiktok/callback';
const SCOPES = 'user.info.basic,video.list';
const TOKENS_KEY = 'tiktok:tokens';
const PANEL_USER = 'tato';
const MAX_PAGES = 10; // 10 páginas × 20 videos = hasta 200 videos por consulta

const VIDEO_FIELDS = [
  'id', 'title', 'video_description', 'create_time', 'share_url', 'duration',
  'view_count', 'like_count', 'comment_count', 'share_count',
].join(',');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/api/tiktok/callback') return await handleCallback(request, env, url);

      if (path.startsWith('/panel')) {
        const denied = checkPanelAuth(request, env);
        if (denied) return denied;

        if (path === '/panel/tiktok') return await handlePanel(env, url);
        if (path === '/panel/tiktok/conectar') return await handleConnect(env);
        if (path === '/panel/tiktok/desconectar' && request.method === 'POST') return await handleDisconnect(env);
        if (path === '/panel/tiktok/data.json') return await handleData(env);
        if (path === '/panel') return Response.redirect(`${url.origin}/panel/tiktok/`, 302);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return html(page('Error', `<p class="err">Algo falló: ${esc(err.message || String(err))}</p><p><a href="/panel/tiktok/">Volver al panel</a></p>`), 500);
    }
  },

  // Renueva el token una vez al día para que la conexión no caduque.
  async scheduled(event, env, ctx) {
    const tokens = await env.TIKTOK_KV.get(TOKENS_KEY, 'json');
    if (!tokens) return;
    if (Date.now() > tokens.refresh_expires_at) return;
    await refreshTokens(env, tokens);
  },
};

// ---------- Acceso al panel (usuario «tato» + PANEL_PASSWORD) ----------

function checkPanelAuth(request, env) {
  if (!env.PANEL_PASSWORD) {
    return html(page('Falta configurar', '<p class="err">Falta el secreto <code>PANEL_PASSWORD</code> en Cloudflare. Agrégalo en el Worker <b>tato-pe</b> → Configuración → Variables y secretos.</p>'), 503);
  }
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch { /* cabecera mal formada */ }
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (i > 0 && safeEqual(user, PANEL_USER) && safeEqual(pass, env.PANEL_PASSWORD)) return null;
  }
  return new Response('Necesitas la contraseña del panel.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Panel Tato Studio", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function safeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

// ---------- Login con TikTok ----------

function requireTikTokSecrets(env) {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    throw new Error('Faltan los secretos TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en Cloudflare.');
  }
}

async function handleConnect(env) {
  requireTikTokSecrets(env);
  const state = randomToken();
  await env.TIKTOK_KV.put(`state:${state}`, '1', { expirationTtl: 600 });

  const auth = new URL('https://www.tiktok.com/v2/auth/authorize/');
  auth.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', SCOPES);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `tt_state=${state}; Path=/api/tiktok; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

async function handleCallback(request, env, url) {
  const back = (msg) => Response.redirect(`${url.origin}/panel/tiktok/?msg=${encodeURIComponent(msg)}`, 302);

  const error = url.searchParams.get('error');
  if (error) return back(`TikTok respondió: ${url.searchParams.get('error_description') || error}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const cookieState = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)tt_state=([^;]+)/)?.[1];

  if (!code || !state || state !== cookieState || !(await env.TIKTOK_KV.get(`state:${state}`))) {
    return back('El permiso no se pudo verificar o tardó más de 10 minutos. Vuelve a conectar.');
  }
  await env.TIKTOK_KV.delete(`state:${state}`);

  requireTikTokSecrets(env);
  const data = await tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });
  await saveTokens(env, data);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/panel/tiktok/?msg=${encodeURIComponent('Cuenta conectada.')}`,
      'Set-Cookie': 'tt_state=; Path=/api/tiktok; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    },
  });
}

async function handleDisconnect(env) {
  const tokens = await env.TIKTOK_KV.get(TOKENS_KEY, 'json');
  if (tokens && env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET) {
    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        token: tokens.access_token,
      }),
    }).catch(() => {});
  }
  await env.TIKTOK_KV.delete(TOKENS_KEY);
  return new Response(null, { status: 303, headers: { Location: '/panel/tiktok/?msg=' + encodeURIComponent('Cuenta desconectada y tokens borrados.') } });
}

// ---------- Tokens ----------

async function tokenRequest(env, params) {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`TikTok no entregó el token (${data.error || res.status}): ${data.error_description || 'sin detalle'}`);
  }
  return data;
}

async function saveTokens(env, data, previous = {}) {
  const now = Date.now();
  const tokens = {
    open_id: data.open_id || previous.open_id,
    scope: data.scope || previous.scope,
    access_token: data.access_token,
    // Si TikTok devuelve un refresh_token nuevo, se usa ese.
    refresh_token: data.refresh_token || previous.refresh_token,
    expires_at: now + (Number(data.expires_in) || 86400) * 1000,
    refresh_expires_at: data.refresh_expires_in
      ? now + Number(data.refresh_expires_in) * 1000
      : previous.refresh_expires_at,
    updated_at: now,
  };
  await env.TIKTOK_KV.put(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

async function refreshTokens(env, tokens) {
  requireTikTokSecrets(env);
  const data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  return saveTokens(env, data, tokens);
}

async function getAccessToken(env) {
  let tokens = await env.TIKTOK_KV.get(TOKENS_KEY, 'json');
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 5 * 60 * 1000) return tokens.access_token;
  if (Date.now() > tokens.refresh_expires_at) return null;
  tokens = await refreshTokens(env, tokens);
  return tokens.access_token;
}

// ---------- Display API ----------

async function api(token, path, init = {}) {
  const res = await fetch(`https://open.tiktokapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body.error && body.error.code && body.error.code !== 'ok')) {
    throw new Error(`TikTok ${path}: ${body.error?.message || body.error?.code || res.status}`);
  }
  return body.data || {};
}

async function loadStats(env) {
  const token = await getAccessToken(env);
  if (!token) return null;

  const userData = await api(token, '/v2/user/info/?fields=open_id,display_name,avatar_url');
  const videos = [];
  let cursor;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await api(token, `/v2/video/list/?fields=${VIDEO_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cursor ? { max_count: 20, cursor } : { max_count: 20 }),
    });
    videos.push(...(page.videos || []));
    if (!page.has_more) break;
    cursor = page.cursor;
  }

  const totals = videos.reduce((t, v) => ({
    views: t.views + (v.view_count || 0),
    likes: t.likes + (v.like_count || 0),
    comments: t.comments + (v.comment_count || 0),
    shares: t.shares + (v.share_count || 0),
  }), { views: 0, likes: 0, comments: 0, shares: 0 });

  return { user: userData.user || {}, videos, totals, fetched_at: new Date().toISOString(), truncated: videos.length >= MAX_PAGES * 20 };
}

async function handleData(env) {
  const stats = await loadStats(env);
  if (!stats) return json({ connected: false }, 200);
  return json({ connected: true, ...stats }, 200);
}

// ---------- Panel ----------

async function handlePanel(env, url) {
  const msg = url.searchParams.get('msg');
  const notice = msg ? `<p class="notice">${esc(msg)}</p>` : '';
  const missing = !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET;

  if (missing) {
    return html(page('Panel TikTok', `${notice}<p class="err">Faltan los secretos <code>TIKTOK_CLIENT_KEY</code> y <code>TIKTOK_CLIENT_SECRET</code> en Cloudflare (Worker <b>tato-pe</b> → Configuración → Variables y secretos). Son los del Sandbox <b>tatostudio-pruebas</b> en TikTok Developers.</p>`));
  }

  const stats = await loadStats(env);
  if (!stats) {
    return html(page('Panel TikTok', `${notice}
      <p>La cuenta de TikTok del estudio todavía no está conectada.</p>
      <p><a class="btn" href="/panel/tiktok/conectar">Conectar TikTok</a></p>
      <p class="muted">Te lleva a TikTok para dar permiso de leer tu perfil básico y las cifras de tus videos. La app no publica nada.</p>`));
  }

  const n = (x) => new Intl.NumberFormat('es-PE').format(x || 0);
  const pct = (v) => (v.view_count ? (((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / v.view_count) * 100 : 0);
  const date = (s) => new Date(s * 1000).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' });
  const sorted = [...stats.videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

  const rows = sorted.map((v) => {
    const title = v.title || v.video_description || '(sin título)';
    return `<tr>
      <td data-v="${v.create_time || 0}">${date(v.create_time)}</td>
      <td class="title"><a href="${esc(v.share_url || '#')}" target="_blank" rel="noopener">${esc(title.slice(0, 90))}</a></td>
      <td data-v="${v.view_count || 0}">${n(v.view_count)}</td>
      <td data-v="${v.like_count || 0}">${n(v.like_count)}</td>
      <td data-v="${v.comment_count || 0}">${n(v.comment_count)}</td>
      <td data-v="${v.share_count || 0}">${n(v.share_count)}</td>
      <td data-v="${pct(v).toFixed(4)}">${pct(v).toFixed(1)} %</td>
    </tr>`;
  }).join('');

  const u = stats.user;
  const body = `${notice}
    <div class="profile">
      ${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="" width="56" height="56">` : ''}
      <div><b>${esc(u.display_name || 'Cuenta conectada')}</b><br><span class="muted">Actualizado: ${new Date(stats.fetched_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</span></div>
    </div>
    <div class="tiles">
      <div><span>Videos</span><b>${n(stats.videos.length)}</b></div>
      <div><span>Vistas</span><b>${n(stats.totals.views)}</b></div>
      <div><span>Me gusta</span><b>${n(stats.totals.likes)}</b></div>
      <div><span>Comentarios</span><b>${n(stats.totals.comments)}</b></div>
      <div><span>Compartidos</span><b>${n(stats.totals.shares)}</b></div>
    </div>
    ${stats.truncated ? '<p class="muted">Se muestran los 200 videos más recientes.</p>' : ''}
    <table id="t">
      <thead><tr>
        <th data-k="0">Fecha</th><th>Video</th><th data-k="2">Vistas</th><th data-k="3">Me gusta</th>
        <th data-k="4">Coment.</th><th data-k="5">Compart.</th><th data-k="6">Interacción</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <form method="post" action="/panel/tiktok/desconectar" onsubmit="return confirm('¿Quitar el permiso y borrar los tokens?')">
      <button class="link" type="submit">Desconectar TikTok</button>
    </form>
    <script>
      document.querySelectorAll('#t th[data-k]').forEach(th => th.addEventListener('click', () => {
        const k = +th.dataset.k, tb = document.querySelector('#t tbody');
        const desc = th.dataset.dir !== 'desc'; th.dataset.dir = desc ? 'desc' : 'asc';
        [...tb.rows].sort((a, b) => (+b.cells[k].dataset.v - +a.cells[k].dataset.v) * (desc ? 1 : -1)).forEach(r => tb.append(r));
      }));
    </script>`;
  return html(page('Panel TikTok', body));
}

// ---------- Utilidades ----------

function page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Tato Studio</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px;color:#111;background:#fafafa}
  main{max-width:1100px;margin:0 auto}
  h1{font-size:28px;margin:0 0 16px}
  a{color:inherit}
  .btn{display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600}
  .muted{color:#666;font-size:14px}
  .notice{background:#eef6ee;border:1px solid #cfe5cf;padding:10px 14px;border-radius:8px}
  .err{background:#fdeeee;border:1px solid #f3cccc;padding:10px 14px;border-radius:8px}
  .profile{display:flex;gap:12px;align-items:center;margin:8px 0 20px}
  .profile img{border-radius:50%}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
  .tiles div{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px}
  .tiles span{display:block;color:#666;font-size:13px}.tiles b{font-size:24px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;font-size:14px}
  th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap}
  th{background:#f3f3f3;cursor:pointer;user-select:none}
  th:nth-child(1),td:nth-child(1),th:nth-child(2),td:nth-child(2){text-align:left}
  td.title{white-space:normal;min-width:240px}
  .link{background:none;border:0;color:#a00;text-decoration:underline;cursor:pointer;margin-top:16px;padding:0;font:inherit}
  code{background:#f1f1f1;padding:1px 4px;border-radius:4px}
  @media (max-width:700px){table{display:block;overflow-x:auto}}
</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
