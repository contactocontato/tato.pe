# tato.pe

Sitio de Tato Studio (Carlos Quispe): cine con IA hecho en Perú. Astro 7 + Tailwind 4, estático.

## Comandos

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # genera dist/ con URLs relativas (sirve desde file:// o una subcarpeta)
npm run preview    # sirve dist/
npm test           # pruebas de la verificación de negocios (worker/*.test.mjs)
npm run export     # build + tato.pe-static.zip (URLs relativas)
npm run build:cf   # genera dist/ para Cloudflare Pages (URLs desde la raíz, sin reescritura)
npm run export:cf  # build:cf + tato.pe-cloudflare.zip
```

## Publicar en Cloudflare Pages

**Subida directa (sin Git):** en el panel de Pages elige *Upload assets*, descomprime `tato.pe-cloudflare.zip` y arrastra la carpeta `dist/` (o sube el zip con `npx wrangler pages deploy dist --project-name tato-pe`).

**Desde Git:** conecta el repositorio y usa esta configuración.

| Ajuste | Valor |
| --- | --- |
| Framework preset | Astro |
| Build command | `npm run build:cf` |
| Build output directory | `dist` |
| Variable de entorno | `NODE_VERSION` = `22` |

`public/_headers` define la caché larga para `/_astro`, `/video`, `/poster`, `/found`, `/notas` e `/inicio`. Luego apunta el dominio `tato.pe` al proyecto en *Custom domains*.

## Dónde está cada cosa

- `src/pages/index.astro`: la portada. Lleva sus textos, su CSS y su JS en el mismo archivo (en línea, sin Tailwind ni `global.css`). Tiene el video del inicio que avanza con el scroll, las secciones de servicios, el armador de pedido por WhatsApp y a Tato al costado con una pose por sección.
- `src/data/inicio.ts`: servicios y precios de la portada. Un precio cambiado aquí se actualiza en su tarjeta, en la tabla de precios y en el globo de Tato ("desde S/ ...", que se calcula solo). Las tarjetas se arman con `src/components/inicio/Tarjeta.astro`, y los gráficos de las tarjetas sin foto están en `src/components/inicio/graficos.ts`.
- `public/inicio/`: archivos de la portada: `seq/d` y `seq/p` (60 cuadros del video del inicio para computadora y celular), `tato/` (poses de Tato y su cara para el botón de WhatsApp), `servicios/` (fotos de las tarjetas, 800 × 600), `clips/` (videos cortos de la sección de TikTok) y el logo.
- `src/lib/site.ts`: WhatsApp, redes, links de afiliado, planes del carrito y el menú de las demás páginas.
- `src/content/products/*.md`: el taller y el pack (precio, cupos, fecha, qué incluye). Cada uno tiene su página en `/aprende/<slug>`.
- `src/content/blog/*.mdx`: notas del blog (`/blog`). Portada opcional en `cover` (las imágenes nuevas van en `public/notas/`). Cada nota lleva una `category` (noticias, prompts, herramientas, personajes), cada una con un color de la marca, y cada categoría con notas tiene su página en `/blog/categoria/<id>`. Las categorías se editan en `src/lib/blog.ts`. `video` (opcional) pone un clip propio en bucle en vez de la portada. Cómo publicar una nota paso a paso: `CLAUDE.md`.
- `src/content/influencers/*.md`: una ficha por influencer con convenio (`/influencers/<id>/`). Sus páginas usan `src/layouts/Studio.astro` y `src/styles/studio.css`. Ver la sección «Influencers y registro de negocios».
- `src/styles/global.css`: tokens de marca (`@theme`), tipografía, botones y helpers de movimiento.
- `public/video/` y `public/poster/`: clips comprimidos para web y sus fotogramas. Los originales están en `assets/` (fuera de git).
- `public/found/`: fotos de Huaraz, Ica y Lima de Wikimedia Commons con sus créditos en `credits.json` (ya citados en el pie).

## Links (bio)

`/links/` es una pantalla tipo Linktree: avatar, nombre y una columna de botones. Apunta ahí la bio de TikTok, Instagram y el Linktree. Los botones se editan en `src/pages/links/index.astro`.

## Recarga (bio de TikTok)

`/recarga/` es el centro de recarga de energía de servidores y buzón de sugerencias. Todo lo editable está en el objeto `CONFIG` al inicio de `src/pages/recarga.astro`: monto actual, meta, ruta del QR, titular, número Yape, botones de aporte, a dónde se envía el buzón y los últimos mecenas del muro.

- **QR:** guarda tu imagen en `public/assets/qr-yape.png`. Mientras no exista, la tarjeta muestra un recuadro "Aquí va tu QR" y el botón de descarga queda desactivado.
- **Buzón:** `submit.mode = 'whatsapp'` abre un chat con el mensaje armado (funciona sin servidor). Con `'webhook'` o `'both'` y una `webhookUrl`, hace un POST con el JSON `{ handle, recargo, nombreYape, monto, operacion, sugerencia, fecha, origen }`. Para Google Sheets, un Apps Script publicado como aplicación web basta:

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActive().getSheets()[0].appendRow([d.fecha, d.handle, d.recargo, d.nombreYape, d.monto, d.operacion, d.sugerencia]);
  return ContentService.createTextOutput('ok');
}
```

- **Verificar un aporte:** busca en tu historial de Yape un pago con el "Nombre en Yape", el monto y la hora del mensaje. Si coincide, agrega su @ a `recentSupporters` y súbelo a `currentAmount`.
- La suma a la batería y la tarjeta en el muro al enviar son solo visuales para quien envía. Los montos reales se actualizan a mano en `currentAmount` y `recentSupporters` después de verificar el Yape.
- El aviso legal está en `src/components/recarga/Aviso.astro`: no lo edites, debe ir palabra por palabra.

## Carrito

El carrito vive en `localStorage` (`src/scripts/cart.ts`). "Pagar por WhatsApp" arma el pedido con los productos y el total y abre un chat. No hay pasarela de pago: el cobro es por Yape, Plin o tarjeta a mano. Si más adelante se conecta una pasarela (Culqi, Mercado Pago, Stripe), el lugar es `src/pages/carrito.astro`.

## Cloudflare Worker y panel de TikTok

La web se publica como el Worker `tato-pe` (cuenta de Cloudflare de Tato). Cada push a `main` compila con `npm run build:cf` y despliega con `npx wrangler deploy`, según `wrangler.jsonc`.

- La web estática sale directo de `dist/`. Solo `/api/*` y `/panel/*` pasan por `worker/index.js`.
- **Panel privado:** `https://tato.pe/panel/tiktok/` (usuario `tato` + la contraseña `PANEL_PASSWORD`). Muestra el perfil y las cifras de los videos de @contactocontato (vistas, me gusta, comentarios, compartidos e interacción). Las mismas cifras en JSON: `/panel/tiktok/data.json`.
- **Conexión con TikTok:** app «Tatostudio», Sandbox `tatostudio-pruebas` en TikTok Developers. Permisos `user.info.basic` y `video.list`. Redirect URI: `https://tato.pe/api/tiktok/callback`.
- **Tokens:** se guardan en KV (`TIKTOK_KV`). El de acceso dura 24 h y se renueva solo; un cron diario (09:17 UTC) mantiene viva la conexión y además revisa el RUC de los negocios verificados (ver abajo). «Desconectar TikTok» en el panel revoca el permiso y borra los tokens.
- **Secretos** (Worker `tato-pe` → Configuración → Variables y secretos, tipo *Secreto*): `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (los del Sandbox) y `PANEL_PASSWORD`. Nunca van en el repo.
- Para probar en local: crea `.dev.vars` con esos tres valores (está en `.gitignore`), corre `npm run build:cf` y luego `npx wrangler dev`.
- Si se piden más datos de TikTok (por ejemplo seguidores con `user.info.stats`), primero hay que agregarlos a `src/pages/privacidad.astro`.

## Influencers y registro de negocios

- **Páginas:** `/influencers/` (catálogo con filtros por contenido y región), `/influencers/<id>/` (perfil, videos de muestra y paquetes), `/influencers/registro/` (registro de negocios, sin indexar) y `/influencers/unete/` (para influencers que quieren sumarse). Cómo agregar a un influencer: `CLAUDE.md`, sección «Influencers».
- Mientras no haya ningún influencer publicado, el catálogo invita a registrarse antes y la portada no muestra el link ni el botón del catálogo.
- **Verificación automática** (`POST /api/negocios/registro`, en `worker/negocios.js`), en este orden:
  1. Formato del RUC y su dígito de verificación.
  2. Consulta del RUC por un servicio de consulta RUC de SUNAT (por defecto Decolecta). La respuesta se guarda 24 horas, así un mismo RUC no se consulta dos veces el mismo día.
  3. Las reglas de `src/data/negocios.json` (las comparten el formulario y el Worker): RUC activo y habido, actividades que no entran, rubros que piden permisos y palabras que mandan a revisión. En un RUC 10, si el DNI del contacto no es el del RUC, pasa a revisión.
  4. Si existe `ANTHROPIC_API_KEY`, una lectura con IA de lo que va a promocionar. Solo puede mandar a revisión; nunca aprueba ni rechaza.
- **Resultado:** verde (verificado, recibe un código `TS-XXXXX` que se guarda en su navegador para pedir por WhatsApp desde el perfil), amarillo (en revisión) o rojo (no entra). Si el servicio de RUC falla o cambia su formato, el registro pasa a revisión: nunca se rechaza a nadie por un error del servicio.
- **Protecciones:** campo trampa para bots, no acepta envíos desde otras webs y como máximo 8 registros por conexión al día. Un RUC ya registrado por otra persona (otro DNI) no se pisa: el intento queda anotado y pasa a revisión. Lo que Tato decide en el panel (aprobar, rechazar o pausar) se mantiene aunque el negocio se vuelva a registrar.
- **Panel:** `https://tato.pe/panel/negocios/` (mismo usuario y contraseña que el de TikTok). Registros por estado, datos de SUNAT, contacto con link a WhatsApp, historial y los botones Aprobar, No entra y Pausar.
- **Revisión diaria:** el cron vuelve a consultar el RUC de los negocios verificados (hasta 20 por día; cada uno, como mucho una vez por semana). Si su RUC deja de estar activo o habido, el negocio queda en pausa.
- **Datos:** en KV (`NEGOCIOS_KV`, se crea solo en el primer deploy). Qué se guarda y para qué está en `/privacidad/`.
- **Secretos** (Worker `tato-pe` → Configuración → Variables y secretos, tipo *Secreto*):
  - `RUC_API_TOKEN`: token del servicio de consulta RUC. Sin él no hay verificación automática: todos los registros quedan en revisión y el panel lo avisa.
  - `RUC_API_URL` (opcional): para usar otro servicio. `{ruc}` se reemplaza por el número y el token va como `Authorization: Bearer`.
  - `ANTHROPIC_API_KEY` (opcional): la lectura con IA.
- Con el token nuevo, haz un registro de prueba con un RUC real y revisa en el panel que salgan la razón social y el estado. Si el servicio responde con otros nombres de campos, se ajustan en `normalizarSunat()`.
- **Pruebas:** `npm test` usa un KV en memoria y un servicio de RUC falso (no consulta SUNAT). Para probar con el Worker en local, agrega `RUC_API_TOKEN` (y `RUC_API_URL` si usas un servicio falso) a `.dev.vars`.

## Antes de publicar

- Confirmar precios de los videos personalizados (`plans` en `site.ts`) y la fecha y cupos del taller.
- Reemplazar las opiniones de ejemplo en `src/components/home/Opiniones.astro`.
- Conectar el formulario de correo de "Prompt de la semana" (`src/components/home/Prompt.astro`) a una lista real; hoy abre un `mailto:`.
- Confirmar el link del canal de YouTube en `site.ts`.
- Ajustar `.taste-skill/` o borrarlo: son notas y capturas del proceso de diseño.
