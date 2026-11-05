# tato.pe — notas para Claude Code

Web de Tato Studio en Astro 7 + Tailwind 4. Comandos, estructura y deploy están en `README.md`.
Se publica como el Worker `tato-pe` de Cloudflare: lo que llega a `main` se publica solo en tato.pe. El panel privado de TikTok (`/panel/tiktok/`) y su conexión viven en `worker/index.js`; cómo funciona está en `README.md`, sección «Cloudflare Worker y panel de TikTok». Nunca pongas secretos ni tokens en el repo.

## Portada

- Servicios y precios: `src/data/inicio.ts`. El globo de Tato muestra el precio más bajo de cada sección y se calcula solo. Al cambiar un precio, cambia también el texto de "Incluye" si lo menciona.
- Textos de las secciones, CSS y JS: en `src/pages/index.astro`, en línea. No usan Tailwind ni `global.css`: no les pongas clases de Tailwind.
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
