// Páginas y respuestas del Worker: el HTML sencillo de los paneles privados y las respuestas JSON.

const NAV = [['/panel/pedidos/', 'Pedidos'], ['/panel/influencers/', 'Influencers'], ['/panel/postulaciones/', 'Postulaciones'], ['/panel/negocios/', 'Negocios'], ['/panel/ajustes/', 'Ajustes'], ['/panel/tiktok/', 'TikTok']];

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
  .nav{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0 0 20px;font-size:14px}.nav a{color:#666}.nav a[aria-current]{color:#111;font-weight:700}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.tabs a{padding:6px 12px;border:1px solid #ddd;border-radius:999px;text-decoration:none;font-size:14px;background:#fff}.tabs a[aria-current]{background:#111;color:#fff;border-color:#111}
  .reg{background:#fff;border:1px solid #e5e5e5;border-radius:10px;margin-bottom:10px}
  .reg summary{display:flex;gap:12px;align-items:center;padding:12px 14px;cursor:pointer;flex-wrap:wrap}
  .reg .cuerpo{padding:0 14px 14px;display:grid;gap:6px;font-size:14px}
  .reg dl{display:grid;grid-template-columns:160px 1fr;gap:4px 12px;margin:0}.reg dt{color:#666}.reg dd{margin:0}
  .badge{font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
  .b-verde{background:#e3f4e8;color:#17602f}.b-amarillo{background:#fff2cc;color:#7a5600}.b-rojo{background:#f0e6ec;color:#7a0a45}.b-pausado{background:#e8e8e8;color:#333}
  .acciones{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.acciones input{flex:1;min-width:200px;padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}
  .acciones button{padding:8px 14px;border-radius:8px;border:0;font:inherit;font-weight:600;cursor:pointer}.ok{background:#17602f;color:#fff}.no{background:#7a0a45;color:#fff}.pausa{background:#ddd}
  .b-gris{background:#eee;color:#333}
  .acciones label{display:flex;flex-direction:column;gap:4px;font-size:13px;flex:1;min-width:160px}
  .acciones label input{min-width:0}
  .acciones input[type=checkbox]{flex:none;min-width:0;width:auto;margin-right:6px}
  .acciones label:has(input[type=checkbox]){flex-direction:row;align-items:center;flex:none}
  .acciones textarea{flex-basis:100%;min-height:200px;padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}
  .acciones.cuenta{align-items:flex-end}
  table.plata{width:auto;min-width:min(420px,100%);margin-top:8px}
  table.plata td{white-space:normal}
  h2{font-size:20px;margin:28px 0 8px}
  .identidad{border-top:1px solid #eee;padding-top:10px;margin-top:6px}.identidad h3{font-size:16px;margin:0 0 8px}
  .miniaturas{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
  .miniatura{margin:0;width:130px;font-size:12px}.miniatura img{width:130px;height:173px;object-fit:cover;border-radius:8px;background:#eee;display:block}
</style></head><body><main>${nav ? `<nav class="nav">${NAV.map(([href, nombre]) => `<a href="${href}"${nombre === title ? ' aria-current="page"' : ''}>${nombre}</a>`).join('')}</nav>` : ''}<h1>${esc(title)}</h1>${body}</main></body></html>`;
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      // same-origin: no filtra las rutas del panel a otras webs, y el navegador sigue mandando Origin en los formularios
      // (con no-referrer manda «Origin: null» y el panel rechaza sus propios botones).
      'Referrer-Policy': 'same-origin',
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

