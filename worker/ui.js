// Páginas y respuestas del Worker: el HTML sencillo de los paneles privados y las respuestas JSON.

export function page(title, body, nav = true) {
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
  @media (max-width:700px){table{display:block;overflow-x:auto}.reg dl{grid-template-columns:1fr}}
  .nav{display:flex;gap:16px;margin:0 0 20px;font-size:14px}.nav a{color:#666}.nav a[aria-current]{color:#111;font-weight:700}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.tabs a{padding:6px 12px;border:1px solid #ddd;border-radius:999px;text-decoration:none;font-size:14px;background:#fff}.tabs a[aria-current]{background:#111;color:#fff;border-color:#111}
  .reg{background:#fff;border:1px solid #e5e5e5;border-radius:10px;margin-bottom:10px}
  .reg summary{display:flex;gap:12px;align-items:center;padding:12px 14px;cursor:pointer;flex-wrap:wrap}
  .reg .cuerpo{padding:0 14px 14px;display:grid;gap:6px;font-size:14px}
  .reg dl{display:grid;grid-template-columns:160px 1fr;gap:4px 12px;margin:0}.reg dt{color:#666}.reg dd{margin:0}
  .badge{font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
  .b-verde{background:#e3f4e8;color:#17602f}.b-amarillo{background:#fff2cc;color:#7a5600}.b-rojo{background:#f0e6ec;color:#7a0a45}.b-pausado{background:#e8e8e8;color:#333}
  .acciones{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.acciones input{flex:1;min-width:200px;padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}
  .acciones button{padding:8px 14px;border-radius:8px;border:0;font:inherit;font-weight:600;cursor:pointer}.ok{background:#17602f;color:#fff}.no{background:#7a0a45;color:#fff}.pausa{background:#ddd}
</style></head><body><main>${nav ? '<nav class="nav"><a href="/panel/tiktok/">TikTok</a><a href="/panel/negocios/">Negocios</a></nav>' : ''}<h1>${esc(title)}</h1>${body}</main></body></html>`;
}

export function html(body, status = 200) {
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

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

