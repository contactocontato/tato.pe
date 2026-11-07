// Páginas y respuestas del Worker: el HTML sencillo de los paneles privados y las respuestas JSON.

// La letra de tato.pe (Archivo, servida desde /fuentes/). La misma de src/styles/studio.css.
export const FUENTE = '@font-face{font-family:"Archivo";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(/fuentes/archivo-latin-wdth.woff2) format("woff2-variations"),url(/fuentes/archivo-latin-wdth.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:"Archivo";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(/fuentes/archivo-latin-ext-wdth.woff2) format("woff2-variations"),url(/fuentes/archivo-latin-ext-wdth.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}';

const NAV = [['/panel/', 'Resumen'], ['/panel/pedidos/', 'Pedidos'], ['/panel/influencers/', 'Influencers'], ['/panel/negocios/', 'Negocios'], ['/panel/postulaciones/', 'Postulaciones'], ['/panel/ajustes/', 'Ajustes'], ['/panel/tiktok/', 'TikTok']];
// Páginas que no están en el menú pero cuelgan de una sección (para marcarla en el menú).
const SECCION = { 'Ficha del negocio': 'Negocios', 'Ficha del creador': 'Influencers' };

export function page(title, body, nav = true) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Tato Studio</title>
<style>
  ${FUENTE}
  :root{--fucsia:#E2037E;--fucsia-tinta:#B50265;--ink:#000;--soft:#555;--line:#dadada;--paper:#fff}
  body{font:16px/1.5 "Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#000;background:var(--paper)}
  main{max-width:1180px;margin:0 auto;padding:20px clamp(14px,3vw,28px) 48px}
  h1{font-size:40px;font-weight:900;font-stretch:72%;font-variation-settings:"wdth" 72;line-height:.95;margin:0 0 16px;letter-spacing:-.02em}
  :focus-visible{outline:2px solid var(--fucsia);outline-offset:2px}
  .barra{background:#000;color:#fff}
  .barra .dentro{max-width:1180px;margin:0 auto;padding:10px clamp(14px,3vw,28px);display:flex;gap:6px 18px;align-items:center;flex-wrap:wrap}
  .barra .marca{font-weight:800;letter-spacing:.04em;color:var(--fucsia);text-decoration:none;margin-right:6px}
  a{color:inherit}
  .btn{display:inline-block;background:#000;color:#fff;padding:13px 20px;border-radius:0;text-decoration:none;font-weight:800}.btn:hover{background:var(--fucsia)}
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
  .nav{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px}.nav a{color:#cfcfcf;text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}.nav a:hover{color:#fff}.nav a[aria-current]{color:#fff;font-weight:700;border-color:var(--fucsia)}
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
  .tiles div{border-radius:12px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px}
  .card h2{margin:0 0 10px;font-size:18px}.card h3{margin:14px 0 6px;font-size:15px}
  .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 16px}
  .kpis a,.kpis div{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;display:block}
  .kpis span{display:block;color:var(--soft);font-size:13px}.kpis b{font-size:24px;font-variant-numeric:tabular-nums}.kpis small{display:block;color:var(--soft);font-size:12px}
  .cola{list-style:none;margin:0;padding:0}.cola li{display:flex;gap:10px;align-items:baseline;justify-content:space-between;padding:9px 0;border-top:1px solid #eee;flex-wrap:wrap}.cola li:first-child{border-top:0}
  .cola a{font-weight:600}.cola .que{color:var(--fucsia-tinta);font-weight:600;font-size:14px}
  .vacio{color:var(--soft);font-size:14px;margin:4px 0}
  .estado-cfg{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.estado-cfg span{font-size:13px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid var(--line)}
  .estado-cfg .bien::before{content:"● ";color:#17602f}.estado-cfg .falta::before{content:"● ";color:#b26b00}
  .barras{list-style:none;margin:0;padding:0;display:grid;gap:6px}.barras li{display:grid;grid-template-columns:130px 1fr 44px;gap:8px;align-items:center;font-size:14px}
  .barras i{display:block;height:12px;border-radius:6px;background:var(--fucsia);min-width:2px}.barras b{text-align:right;font-variant-numeric:tabular-nums}
  .feed{list-style:none;margin:0;padding:0;font-size:14px}.feed li{padding:7px 0;border-top:1px solid #eee;display:grid;grid-template-columns:170px 1fr;gap:10px}.feed time{white-space:nowrap}.feed li:first-child{border-top:0}.feed time{color:var(--soft);font-size:12px}
  .ficha dl{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;margin:0;font-size:14px}.ficha dt{color:var(--soft)}.ficha dd{margin:0;overflow-wrap:anywhere}
  .botones{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.botones a{display:inline-block;padding:7px 12px;border:1px solid #ccc;border-radius:8px;text-decoration:none;font-size:14px;background:#fff}.botones a.fuerte{background:var(--ink);color:#fff;border-color:var(--ink)}
  table.lista-t td{text-align:left;white-space:normal}table.lista-t td.n,table.lista-t th.n{text-align:right;white-space:nowrap}
  .si{color:#17602f;font-weight:700}.no-tiene{color:#999}
  @media (max-width:820px){.grid2,.grid3{grid-template-columns:1fr}.ficha dl{grid-template-columns:1fr}.feed li{grid-template-columns:1fr}.barras li{grid-template-columns:100px 1fr 36px}}
</style></head><body>${nav ? `<header class="barra"><div class="dentro"><a class="marca" href="/panel/">TATO STUDIO</a><nav class="nav" aria-label="Panel">${NAV.map(([href, nombre]) => `<a href="${href}"${nombre === (SECCION[title] || title) ? ' aria-current="page"' : ''}>${nombre}</a>`).join('')}</nav></div></header>` : ''}<main><h1>${esc(title)}</h1>${body}</main></body></html>`;
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

