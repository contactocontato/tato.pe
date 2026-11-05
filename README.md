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

## Cuentas de influencers, pedidos y pagos

- **Identidad del influencer** (`worker/identidad.js`). Antes de recibir pedidos, en `/cuenta/identidad/`:
  - Sube 4 fotos: cuerpo completo y rostro, de frente y de perfil. El navegador las achica a 2048 px y las pasa a JPEG, lo que también les quita la ubicación GPS.
  - Lee en voz alta un cuento de un minuto y al final un código de tres números, que cambia cada vez para que la grabación sea nueva. El cuento lo escribe Claude si existe `ANTHROPIC_API_KEY`; si no, sale uno de los 8 cuentos propios de `worker/cuentos.js`.
  - Marca la autorización: mayor de 18, uso solo para su hoja de personaje y su voz con IA, y derecho a borrar. Queda guardada con la versión del texto, la fecha y la IP.
  - Tato la revisa en `/panel/influencers/` (fotos, voz, cuento leído y código): la aprueba o pide que rehaga partes. Sin identidad aprobada no recibe solicitudes.
  - El influencer puede borrar sus fotos y su voz cuando quiera. El panel avisa que hay que borrar también la hoja de personaje y la voz clonada.
- **Actuación del guion:** al mandar un guion puedes pedir que el influencer lo actúe en audio, en video o en ambos. No puede aprobar el guion sin subirlo, y también puede subirlo por su cuenta para ayudar. Sirve de referencia para editar con Seedance. Las actuaciones se borran solas 30 días después de que el pedido termina.
- **Archivos:** fotos, voces y actuaciones van en R2 (`MEDIOS`, privado). Solo salen por el Worker: al mismo influencer o al panel (`/panel/archivo`). Límite por subida: foto 8 MB, audio 25 MB, video 95 MB (Cloudflare acepta hasta 100 MB por pedido en el plan gratis).
- **Antes de publicar, activa R2** en Cloudflare (R2 Object Storage). Es gratis hasta 10 GB al mes, pero Cloudflare pide registrar una tarjeta o PayPal para activarlo. Sin R2 activado, el deploy falla. El bucket se crea solo en el primer deploy.
- **Cuenta del influencer:** `https://tato.pe/cuenta/`. Entra con su ID (el de su ficha, por ejemplo `rosa-perez`) y su contraseña. Ve las solicitudes, acepta o no, aprueba el guion y el video (o pide cambios), ve sus pagos, conecta su Mercado Pago y puede pausar sus pedidos.
- **Crear una cuenta:** en `/panel/influencers/`, cuando el convenio está firmado. Pones su WhatsApp, tu porcentaje y el costo de producción de cada paquete, generas una contraseña temporal y se la mandas por WhatsApp con el botón. Al entrar, la cuenta le pide cambiarla. «Poner contraseña temporal» sirve si la olvida, y cierra sus sesiones abiertas.
- **Contraseñas:** el navegador las cifra (PBKDF2, 200 000 vueltas) y el Worker vuelve a cifrar lo que llega (5 000 vueltas, con sal al azar). El servidor nunca ve la contraseña. El trabajo pesado se hace en el navegador porque el plan gratis de Workers da 10 ms de CPU por pedido. Después de 5 intentos fallidos, la cuenta se bloquea 15 minutos.
- **Pasos de un pedido** (`worker/pedidos.js`):
  1. El negocio verificado envía la solicitud desde el perfil, con su código `TS-XXXXX` y su RUC.
  2. El influencer la acepta. Si el paquete es «a cotizar», primero pones el precio en el panel.
  3. El negocio paga el **adelanto**, que es el costo de producción del paquete y es entero para ti.
  4. Escribes el guion y el influencer lo aprueba.
  5. Produces el video y el influencer lo aprueba.
  6. El negocio paga el **saldo** y entregas el video.
- **Reparto del saldo:** primero sale la comisión de Mercado Pago (si se pagó por ahí). De lo que queda, tu porcentaje es para ti (40 % por defecto) y el resto es para el influencer.
- **Dónde se configuran los números:** el porcentaje por defecto, la comisión de Mercado Pago y la producción por defecto, en `/panel/ajustes/`. Cada influencer puede tener su propio porcentaje y sus costos en `/panel/influencers/`. Cada pedido guarda los números con los que se creó. Nada de esto va en el repo.
- **Panel de pedidos:** `/panel/pedidos/`. Muestra lo que te toca, los links de pago y los botones de WhatsApp al negocio y al influencer con el mensaje armado. También sirve para registrar pagos a mano (número de operación), mandar el guion y el link privado del video, entregar y cancelar.
- **Con Mercado Pago** (`worker/mercadopago.js`, Split de Pagos 1:1):
  - El adelanto se cobra con tu cuenta.
  - El saldo se cobra con la cuenta del influencer, y Mercado Pago te pasa tu parte como comisión del marketplace.
  - El aviso de pago llega a `/api/mp/webhook` y el pago siempre se vuelve a leer en la API de Mercado Pago antes de darlo por bueno. El pedido avanza solo.
  - Si el influencer no conectó su cuenta, el saldo se cobra a mano y le pagas tú; el panel te recuerda registrar ese pago.
- **Configurar Mercado Pago:**
  1. En Mercado Pago Developers → Tus integraciones, crea una aplicación de pagos online con Checkout Pro y modelo marketplace (Split de Pagos).
  2. URL de redirección: `https://tato.pe/api/mp/conectado`.
  3. Webhooks: `https://tato.pe/api/mp/webhook`, con el evento de pagos.
  4. Secretos del Worker: `MP_CLIENT_ID` y `MP_CLIENT_SECRET` (de la aplicación), `MP_ACCESS_TOKEN` (el token de producción de tu cuenta) y `MP_WEBHOOK_SECRET` (la clave secreta de los webhooks).
  5. En `/panel/ajustes/`, pon la comisión que te cobra Mercado Pago (con IGV). Sin ella no se crean los links del saldo.
  6. Prueba primero con las credenciales y usuarios de prueba de Mercado Pago.
- **Antes del primer cobro real, con tu contador:**
  - Con el pago dividido, el saldo queda a nombre del influencer: hay que definir qué comprobante emite cada uno, si tu parte lleva IGV y cómo se factura.
  - Si le pagas a mano con recibo por honorarios de más de S/ 1,500 y tu empresa es agente de retención, corresponde retener 8 %.
- **Datos:** en KV (`PEDIDOS_KV`, se crea solo en el primer deploy). El influencer no ve el nombre, el DNI ni el WhatsApp del contacto del negocio.
- **Cron diario:** renueva las conexiones de Mercado Pago que vencen en menos de 30 días (duran 180).
- **Pruebas:** `npm test` (`worker/pedidos.test.mjs`) usa KV y R2 en memoria, un catálogo, un Mercado Pago y una IA falsos. Para probar con el Worker en local, `.dev.vars` acepta `MP_API`, `MP_AUTH`, `MP_REDIRECT_URI` y `SITIO` apuntando a un Mercado Pago falso, y `VOZ_MIN_SEGUNDOS` para acortar la grabación mínima (45 s por defecto).

## Antes de publicar

- Confirmar precios de los videos personalizados (`plans` en `site.ts`) y la fecha y cupos del taller.
- Reemplazar las opiniones de ejemplo en `src/components/home/Opiniones.astro`.
- Conectar el formulario de correo de "Prompt de la semana" (`src/components/home/Prompt.astro`) a una lista real; hoy abre un `mailto:`.
- Confirmar el link del canal de YouTube en `site.ts`.
- Ajustar `.taste-skill/` o borrarlo: son notas y capturas del proceso de diseño.
