# tato.pe — notas para Claude Code

Web de Tato Studio en Astro 7 + Tailwind 4. Comandos, estructura y deploy están en `README.md`.
Se publica como el Worker `tato-pe` de Cloudflare: lo que llega a `main` se publica solo en tato.pe. El panel privado de TikTok (`/panel/tiktok/`) y su conexión viven en `worker/index.js`; cómo funciona está en `README.md`, sección «Cloudflare Worker y panel de TikTok». El registro de negocios y su panel (`/panel/negocios/`) viven en `worker/negocios.js`; el portal del negocio (`/negocio/`) y el resumen del panel (`/panel/`), en `worker/portal-negocio.js` y `worker/panel-resumen.js` (ver «Influencers» más abajo). Nunca pongas secretos ni tokens en el repo.

## Portada

- Servicios y precios: `src/data/inicio.ts`. El globo de Tato muestra el precio más bajo de cada sección y se calcula solo. Al cambiar un precio, cambia también el texto de "Incluye" si lo menciona.
- Textos de las secciones, CSS y JS: en `src/pages/index.astro`, en línea. No usan Tailwind ni `global.css`: no les pongas clases de Tailwind.
- Color: el acento de la portada es el fucsia del logo de Tato (`--fucsia`, #E2037E), con el negro y el blanco. No uses rojo. Para textos chicos usa `--fucsia-tinta` sobre fondo claro y `--fucsia-claro` sobre fondo oscuro, que se leen mejor. Las palabras resaltadas de los títulos llevan la clase `fx`.
- La cabecera lleva el logo de Tato Studio (`public/inicio/logo-tato-cabecera.webp`). Tiene partes en negro, así que no va sobre fondo oscuro.
- Poses de Tato al costado: archivos en `public/inicio/tato/` y la lista `FIG` al inicio de `index.astro`. Cada sección elige su pose con `data-fig` y su globo con `data-say` (el precio va entre asteriscos). En la sección de homenajes Tato no aparece, por respeto al tema.
- `/inicio/` tiene caché larga: si cambias una foto, una pose o un cuadro del video, súbelo con otro nombre.
- La portada no lleva la lista de empresas que trabajaron con Tato («Han trabajado conmigo»): Tato decidió quitarla.

## Publicar una noticia o una nota del blog

Cuando Tato pida "publica esta noticia" (o una nota de prompts, herramientas o personajes):

1. Crea `src/content/blog/<slug>.mdx`. El slug es la URL (`tato.pe/blog/<slug>`): minúsculas, sin tildes ni ñ, palabras separadas por guiones. Ejemplo: `taller-en-lima-noviembre`.
2. Empieza el archivo con este encabezado:

   ```mdx
   ---
   title: Título corto, como lo diría Tato
   description: Una o dos líneas. Es lo que se ve en el listado y al compartir el link por WhatsApp.
   date: 2026-10-20
   category: noticias
   cover: /notas/<slug>.jpg
   coverAlt: Qué se ve en la imagen, en una frase
   video: /video/<clip>.mp4
   tags: [tema, otro-tema]
   ---
   ```

   - `title`: de preferencia menos de 45 caracteres. La nota más nueva sale en grande arriba del blog y los títulos largos se parten en muchas líneas en el celular.
   - `category`: una de `noticias`, `prompts`, `herramientas` o `personajes` (la lista y el color de cada una viven en `src/lib/blog.ts`). Si falta, la nota queda como `noticias`.
   - `date`: el día de publicación, en formato AAAA-MM-DD. El blog ordena de la más nueva a la más antigua.
   - `cover` y `coverAlt` son opcionales, pero una nota con imagen se ve mucho mejor. La imagen va en `public/notas/`, en JPG, vertical (9:16 o 4:5) como los videos, de al menos 720 px de ancho y de preferencia menos de 300 KB. En las tarjetas se recorta a 3:4, así que el sujeto debe ir al centro.
   - `video` es opcional: un clip corto propio o de un cliente con permiso, en `public/video/` (mp4, se reproduce sin sonido y en bucle; la portada es su primer cuadro). Los videos con personajes de la TV no se suben a la web: esos van como link a TikTok.
   - Si se cambia una imagen o un video ya publicado, súbelo con otro nombre: `/notas/` y `/video/` tienen caché larga y el navegador seguiría mostrando el anterior.
   - `draft: true` guarda la nota sin publicarla.
3. Debajo del encabezado va el texto, en Markdown: párrafos cortos y subtítulos con `##`. Si hay un prompt, va en un bloque de código: la nota le pone solo el botón "Copiar prompt".
4. Voz: español de Perú, de tú, directo, como habla Tato. Sin anglicismos de marketing, sin "increíble" ni "épico". Precios en soles (S/).
5. No inventes datos, fechas, precios ni citas. Si falta algo, pregúntale a Tato.
6. Revisa con `npm run dev` (http://localhost:4321/blog) y corre `npm run build` antes de hacer commit.
7. El push lo decide Tato. Lo que llega a `main` sale en vivo.

## Categorías

Cada categoría usa uno de los cuatro colores de la marca (noticias azul, prompts rojo, herramientas amarillo, personajes verde) en su bloque, sus tarjetas y el encabezado de sus notas. Para agregar o renombrar una, edita `src/lib/blog.ts` (id, nombre, color y frase de presentación). Sobre el rojo y el azul el texto tiene que ir grande (19 px o más) para que se lea bien. En la fila de categorías solo aparecen las que tienen notas, y la página `/blog/categoria/<id>` se crea sola con la primera nota.

## Influencers

Catálogo en `/influencers/`. Cada influencer con convenio tiene una ficha en `src/content/influencers/<id>.md`. El id es su URL (`tato.pe/influencers/<id>/`): minúsculas, sin tildes ni ñ, con guiones. `ejemplo-tato.md` es una ficha de ejemplo en borrador (nunca se publica): cópiala y cambia todos los datos.

- Hay dos formas de sumar creadores. Con convenio firmado: una ficha en el repo (lo de abajo) y su cuenta creada por Tato en `/panel/influencers/`. En línea: el creador se registra solo en `/influencers/unete/` (`worker/alta-influencer.js`, cuenta `creador-*` en KV, sin ficha en el repo); su perfil sale en el catálogo recién cuando Tato aprueba su identidad. No cambies eso: Tato revisa a cada creador antes de publicarlo.
- Agrega una ficha al repo solo cuando Tato confirme que firmó el convenio. El repo es público: el convenio, el DNI, el teléfono, el correo y lo que gana cada influencer no van aquí. En la ficha va solo lo que se muestra en la web.
- Qué significa cada campo: `src/content.config.ts`. Si un texto lleva `#` o dos puntos, va entre comillas; si no, el texto se corta o la web no compila.
- La foto (vertical 4:5, aprobada por el influencer) y los videos de muestra van en `public/influencers/<id>/`. Las muestras son videos hechos con IA que el influencer aprobó; nada con personajes de la TV.
- No inventes seguidores, precios, fechas ni temas que no acepta: pídeselos a Tato. `cifrasAl` es el día en que se contaron los seguidores. Un paquete sin `precio` sale «A cotizar».
- `borrador: true` solo se ve con `npm run dev`. `activo: false` lo saca de la web (convenio pausado). Con `convenioHasta`, la ficha deja de publicarse cuando vence, y si vence entre una publicación y otra, su página deja de tomar pedidos ese mismo día. Para sacar a alguien al toque: `activo: false` y publicar.
- El link «Influencers» de la portada y el botón del catálogo en su tarjeta aparecen solos cuando hay al menos un influencer publicado.
- Estas páginas usan `src/layouts/Studio.astro` y `src/styles/studio.css`, con estilo de cartel: fucsia (#E2037E), negro y blanco planos, sin rojo; la letra Archivo (servida desde `public/fuentes/`, angosta y en 900 para los títulos); esquinas rectas; sin sombras, degradados ni líneas finas; títulos de dos líneas como máximo; ninguna palabra resaltada en un título. Si el fucsia cambia en `index.astro`, cámbialo también ahí. Los paneles privados (`worker/portal.js` y `worker/ui.js`) usan los mismos colores y la misma letra (`FUENTE` en `worker/ui.js`).
- En la portada de `/influencers/`, «Arma tu video» reparte los segundos con los planes de `src/data/planes-influencer.json`: si cambian los planes, revisa que el esqueleto siga cuadrando. Los clips de «Así se ven» son de Tato; nada con personajes de la TV.

### Registro de negocios

`/influencers/registro/` verifica cada negocio solo, con su RUC (`worker/negocios.js`): verde (recibe su código `TS-XXXXX`), amarillo (Tato lo revisa en `/panel/negocios/`) o rojo (no entra). Las reglas (rubros, actividades de SUNAT que no entran o piden permisos, palabras que mandan a revisión) están en `src/data/negocios.json`, que comparten el formulario y el Worker. Si cambias las reglas o el Worker, corre `npm test`. Si cambian los datos que se piden, actualiza también `src/pages/privacidad.astro`. Secretos y detalles: `README.md`, sección «Influencers y registro de negocios».

### Cuentas, pedidos y pagos

- El influencer entra en `/cuenta/` (`worker/cuenta.js`) con su correo verificado o su ID. Las cuentas con convenio las crea Tato en `/panel/influencers/`, nunca desde código. Las contraseñas se cifran primero en el navegador (`SCRIPT_CLAVE` en `worker/seguridad.js`): no cambies ese cálculo, porque nadie podría volver a entrar. Para entrar con el correo se guarda el mismo cálculo con el correo en la sal (`claveCorreo`).
- Correos (`worker/correo.js`, `worker/avisos.js`): códigos de verificación y avisos de cada pedido. El remitente y la clave del proveedor van como variables y secretos de Cloudflare, nunca en el repo. Si agregas un paso al pedido, revisa también `eventosPedido` para que cada uno reciba su aviso.
- Panel del negocio en `/negocio/` (`worker/portal-negocio.js`): un solo registro; al terminar, el negocio crea su usuario y su contraseña (`worker/cuenta-negocio.js`, sal «negocio-<usuario>») y entra con ellos. Nunca le pidas a un negocio que se registre de nuevo: los antiguos crean su usuario con un código a su correo guardado o con RUC + DNI + WhatsApp. Su perfil de marca vive en el campo `perfil` del registro.
- Los videos se piden con la orden de servicio (`worker/orden.js`): paquete con segundos claros, idea o guion, qué hace el influencer, fotos del negocio y del escenario, storytelling con IA (`worker/storytelling.js`) que el negocio aprueba, y la aceptación de que la imagen y la voz son IA y la personalidad puede no ser idéntica. El storytelling sale solo de lo que dio el negocio: no lo cambies para que invente precios, promociones ni datos. El resumen del panel (`/panel/`, `worker/panel-resumen.js`) junta creadores, negocios y pedidos; cada uno tiene su ficha y la vista de su página.
- Pasos y reparto de cada pedido: `worker/pedidos.js` (adelanto = producción, para Tato; saldo menos la comisión de Mercado Pago, dividido según el porcentaje). Mercado Pago: `worker/mercadopago.js`.
- El porcentaje de Tato, los costos de producción y la comisión de Mercado Pago se configuran en el panel (`/panel/ajustes/` y `/panel/influencers/`). No los pongas en el repo: es público.
- `src/pages/influencers/datos.json.ts` publica los paquetes y precios que el Worker usa para armar cada pedido.
- Fotos y voz del influencer (`worker/identidad.js`) y actuaciones del guion: son datos biométricos. Viven solo en el bucket privado R2 (`MEDIOS`): nunca los subas al repo, no los copies a `public/` ni hagas público el bucket. Si cambias el texto de la autorización (`CONSENTIMIENTO`), cambia también su `version`.
- Medición: Microsoft Clarity (`src/components/Medicion.astro`), solo con el permiso de la persona y nunca en `/cuenta`, `/negocio` ni `/panel`. Los formularios con datos personales llevan `data-clarity-mask="true"`.
- Si cambias pedidos, cuentas, pagos, correos o el portal, corre `npm test`. Si cambian los datos que se guardan, actualiza `src/pages/privacidad.astro`.
