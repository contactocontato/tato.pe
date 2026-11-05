// Archivos privados en R2 (binding MEDIOS): las fotos y la voz de la identidad de cada influencer,
// y sus actuaciones del guion en cada pedido. El bucket es privado: los archivos solo salen por el Worker,
// al mismo influencer o al panel de Tato. Nunca se suben al repo ni se hacen públicos.

const MB = 1024 * 1024;
export const CLASES = {
  foto: { tipos: { 'image/jpeg': 'jpg' }, max: 8 * MB, nombre: 'la foto' },
  audio: {
    tipos: { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav' },
    max: 25 * MB,
    nombre: 'el audio',
  },
  video: { tipos: { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }, max: 95 * MB, nombre: 'el video' },
};
export const tipoBase = (t) => String(t || '').split(';')[0].trim().toLowerCase();

/**
 * Guarda el cuerpo del pedido en R2. Devuelve { clave, tipo, tamano } o { error, status }.
 * El archivo se guarda como `${prefijo}-<fecha>.<ext>`.
 */
export async function guardarArchivo(env, request, clase, prefijo) {
  const c = CLASES[clase];
  if (!env.MEDIOS) return { error: 'El almacenamiento de archivos todavía no está activado. Avísale a Tato.', status: 503 };
  const tipo = tipoBase(request.headers.get('Content-Type'));
  if (!c.tipos[tipo]) return { error: `No reconocemos el formato de ${c.nombre}. Inténtalo con otro archivo.`, status: 415 };
  const tamano = Number(request.headers.get('Content-Length') || 0);
  if (!tamano) return { error: `No llegó ${c.nombre}. Inténtalo otra vez.`, status: 411 };
  if (tamano > c.max) return { error: `${c.nombre[0].toUpperCase()}${c.nombre.slice(1)} pesa más de ${Math.round(c.max / MB)} MB. ${clase === 'video' ? 'Grábalo en 720p o más corto.' : 'Prueba con uno más liviano.'}`, status: 413 };
  let cuerpo = request.body;
  if (clase === 'foto') {
    // Las fotos llegan ya pasadas a JPEG por el navegador: se revisa que de verdad lo sean.
    cuerpo = await request.arrayBuffer();
    const b = new Uint8Array(cuerpo.slice(0, 3));
    if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return { error: 'Esa foto no se pudo leer. Tómala otra vez.', status: 415 };
  }
  const clave = `${prefijo}-${Date.now().toString(36)}.${c.tipos[tipo]}`;
  await env.MEDIOS.put(clave, cuerpo, { httpMetadata: { contentType: tipo } });
  return { clave, tipo, tamano };
}

export async function borrarArchivo(env, clave) {
  if (clave && env.MEDIOS) await env.MEDIOS.delete(clave);
}

/** Entrega un archivo de R2 (con soporte de rangos, que Safari necesita para reproducir audio y video). */
export async function servirArchivo(env, request, clave, { descarga = '' } = {}) {
  if (!env.MEDIOS || !clave) return new Response('No encontrado', { status: 404 });
  const rango = (request.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  let obj;
  if (rango && (rango[1] || rango[2])) {
    const cabeza = await env.MEDIOS.head(clave);
    if (!cabeza) return new Response('No encontrado', { status: 404 });
    const total = cabeza.size;
    let inicio = rango[1] ? Number(rango[1]) : Math.max(0, total - Number(rango[2]));
    let fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1;
    if (inicio >= total || inicio > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    obj = await env.MEDIOS.get(clave, { range: { offset: inicio, length: fin - inicio + 1 } });
    if (!obj) return new Response('No encontrado', { status: 404 });
    return new Response(obj.body, { status: 206, headers: cabeceras(obj, { 'Content-Range': `bytes ${inicio}-${fin}/${total}`, 'Content-Length': String(fin - inicio + 1) }, descarga) });
  }
  obj = await env.MEDIOS.get(clave);
  if (!obj) return new Response('No encontrado', { status: 404 });
  return new Response(obj.body, { headers: cabeceras(obj, { 'Content-Length': String(obj.size) }, descarga) });
}

function cabeceras(obj, extra, descarga) {
  return {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Disposition': descarga ? `attachment; filename="${descarga.replace(/[^a-z0-9._-]/gi, '-')}"` : 'inline',
    ...extra,
  };
}

/**
 * Script de las páginas con subidas. Funciona con atributos:
 *  - <input type="file" data-subir="foto|audio|video" data-url="…" data-max="bytes" [data-recargar]> dentro de un [data-caja]
 *    con [data-estado], .progreso i e img[data-vista] opcionales. Las fotos se achican a 2048 px y se pasan a JPEG
 *    en el navegador (eso también borra la ubicación GPS de la foto).
 *  - [data-grabadora] con data-url, data-min y data-max (segundos): botones [data-grabar], [data-detener], [data-enviar],
 *    [data-tiempo], .nivel i, audio[data-escuchar], [data-estado] y un bloque [data-alterno] por si no se puede grabar.
 *  - [data-otro-cuento] pide otro cuento y lo pone en [data-cuento-titulo], [data-cuento-texto] y [data-cuento-codigo].
 */
export const SCRIPT_MEDIOS = `<script>
(() => {
  const tipoBase = (t) => String(t || '').split(';')[0];
  function subir(url, blob, tipo, avance) {
    return new Promise((ok, mal) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('Content-Type', tipo);
      x.upload.onprogress = (e) => { if (e.lengthComputable && avance) avance(e.loaded / e.total); };
      x.onload = () => {
        let r = {};
        try { r = JSON.parse(x.responseText); } catch (e) { r = {}; }
        if (x.status >= 200 && x.status < 300 && !r.error) ok(r);
        else mal(new Error(r.error || (x.status === 413 ? 'El archivo pesa demasiado.' : 'No se pudo subir. Inténtalo otra vez.')));
      };
      x.onerror = () => mal(new Error('Sin conexión. Revisa tu internet e inténtalo otra vez.'));
      x.send(blob);
    });
  }
  async function aJpeg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.9));
    } catch (e) {
      throw new Error('No se pudo leer la foto. Prueba con otra o tómala de nuevo.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function duracion(file) {
    return new Promise((ok) => {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.onloadedmetadata = () => { ok(Math.round(a.duration) || 0); URL.revokeObjectURL(a.src); };
      a.onerror = () => ok(0);
      a.src = URL.createObjectURL(file);
    });
  }
  function terminado(caja) {
    caja.dataset.hecho = '1';
    caja.classList.add('hecha');
    const falta = document.querySelector('[data-falta="' + (caja.dataset.caja || '') + '"]');
    if (falta) falta.remove();
    const lista = document.querySelector('[data-faltan]');
    if (lista && !lista.querySelector('li')) { lista.hidden = true; const listo = document.querySelector('[data-todo-listo]'); if (listo) listo.hidden = false; }
  }
  document.querySelectorAll('input[type=file][data-subir]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const caja = inp.closest('[data-caja]') || inp.parentElement;
    const estado = caja.querySelector('[data-estado]');
    const barra = caja.querySelector('.progreso i');
    const decir = (t, err) => { if (estado) { estado.textContent = t; estado.classList.toggle('err', !!err); } };
    try {
      let blob = f;
      let tipo = tipoBase(f.type);
      let url = inp.dataset.url;
      if (inp.dataset.subir === 'foto') { decir('Preparando la foto…'); blob = await aJpeg(f); tipo = 'image/jpeg'; }
      if (inp.dataset.subir === 'audio') url += (url.includes('?') ? '&' : '?') + 'segundos=' + (await duracion(f));
      if (!tipo) throw new Error('No reconocemos ese tipo de archivo.');
      const max = Number(inp.dataset.max || 0);
      if (max && blob.size > max) throw new Error(inp.dataset.muyGrande || 'El archivo pesa demasiado.');
      decir('Subiendo… 0 %');
      await subir(url, blob, tipo, (p) => { decir('Subiendo… ' + Math.round(p * 100) + ' %'); if (barra) barra.style.width = (p * 100) + '%'; });
      decir('Listo.');
      if (inp.hasAttribute('data-recargar')) { location.reload(); return; }
      terminado(caja);
      const vista = caja.querySelector('img[data-vista]');
      if (vista) {
        vista.src = vista.dataset.vista + '?v=' + Date.now();
        vista.hidden = false;
        const icono = caja.querySelector('svg');
        if (icono) icono.remove();
        const boton = inp.closest('label');
        if (boton && boton.firstChild && boton.firstChild.nodeType === 3) boton.firstChild.textContent = 'Cambiar foto';
      }
    } catch (e) {
      decir(e.message, true);
      if (barra) barra.style.width = '0';
    } finally {
      inp.value = '';
    }
  }));
  document.querySelectorAll('[data-otro-cuento]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const t = b.textContent;
    const aviso = document.querySelector('[data-cuento-error]');
    if (aviso) aviso.hidden = true;
    b.textContent = 'Escribiendo un cuento…';
    try {
      const r = await fetch(b.dataset.otroCuento, { headers: { Accept: 'application/json' } }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      document.querySelector('[data-cuento-titulo]').textContent = r.titulo;
      document.querySelector('[data-cuento-texto]').textContent = r.texto;
      document.querySelector('[data-cuento-codigo]').textContent = r.codigoEnLetras;
      document.querySelectorAll('[data-sin-cuento]').forEach((x) => { x.hidden = false; });
    } catch (e) {
      if (aviso) { aviso.textContent = e.message || 'No se pudo traer otro cuento. Inténtalo otra vez.'; aviso.hidden = false; }
    } finally {
      b.disabled = false;
      b.textContent = t;
    }
  }));
  document.querySelectorAll('[data-grabadora]').forEach((g) => {
    const q = (s) => g.querySelector(s);
    const grabar = q('[data-grabar]'), detener = q('[data-detener]'), enviar = q('[data-enviar]');
    const tiempo = q('[data-tiempo]'), nivel = q('.nivel i'), oir = q('audio[data-escuchar]'), estado = q('[data-estado]'), alterno = q('[data-alterno]');
    const min = Number(g.dataset.min || 0), max = Number(g.dataset.max || 180);
    const decir = (t, err) => { estado.textContent = t; estado.classList.toggle('err', !!err); };
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) {
      grabar.hidden = true;
      if (alterno) alterno.hidden = false;
      decir('Este navegador no puede grabar aquí. Graba con la app de grabadora de tu celular y sube el audio.');
      return;
    }
    const tipos = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
    let rec = null, stream = null, ctx = null, partes = [], inicio = 0, reloj = 0, blob = null, segundos = 0;
    grabar.addEventListener('click', async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      } catch (e) {
        decir('No pudimos usar el micrófono. Dale permiso en tu navegador e inténtalo otra vez.', true);
        if (alterno) alterno.hidden = false;
        return;
      }
      const mimeType = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {});
      partes = [];
      blob = null;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
      rec.onstop = () => {
        segundos = Math.round((Date.now() - inicio) / 1000);
        clearInterval(reloj);
        stream.getTracks().forEach((t) => t.stop());
        if (ctx) ctx.close().catch(() => {});
        if (nivel) nivel.style.width = '0';
        blob = new Blob(partes, { type: rec.mimeType || mimeType || 'audio/webm' });
        oir.src = URL.createObjectURL(blob);
        oir.hidden = false;
        detener.hidden = true;
        grabar.hidden = false;
        grabar.textContent = 'Grabar de nuevo';
        if (segundos < min) { decir('Duró ' + segundos + ' s y tiene que durar al menos ' + min + ' s. Léelo completo, sin apuro.', true); enviar.hidden = true; }
        else { decir('Duró ' + segundos + ' s. Escúchalo y, si se oye bien, envíalo.'); enviar.hidden = false; }
      };
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const d = new Uint8Array(an.fftSize);
        const medir = () => {
          if (!rec || rec.state !== 'recording') return;
          an.getByteTimeDomainData(d);
          let pico = 0;
          for (const v of d) pico = Math.max(pico, Math.abs(v - 128));
          if (nivel) nivel.style.width = Math.min(100, pico / 1.28) + '%';
          requestAnimationFrame(medir);
        };
        requestAnimationFrame(medir);
      } catch (e) { /* sin medidor de volumen */ }
      rec.start(1000);
      inicio = Date.now();
      grabar.hidden = true;
      detener.hidden = false;
      enviar.hidden = true;
      oir.hidden = true;
      decir('Grabando. Lee en voz alta, con calma.');
      reloj = setInterval(() => {
        const s = Math.round((Date.now() - inicio) / 1000);
        tiempo.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        if (s >= max && rec.state === 'recording') rec.stop();
      }, 250);
    });
    detener.addEventListener('click', () => { if (rec && rec.state === 'recording') rec.stop(); });
    enviar.addEventListener('click', async () => {
      if (!blob) return;
      enviar.disabled = true;
      try {
        const url = g.dataset.url + (g.dataset.url.includes('?') ? '&' : '?') + 'segundos=' + segundos;
        await subir(url, blob, tipoBase(blob.type), (p) => decir('Subiendo… ' + Math.round(p * 100) + ' %'));
        decir('Listo: tu grabación quedó guardada.');
        enviar.hidden = true;
        if (g.hasAttribute('data-recargar')) { location.reload(); return; }
        terminado(g);
      } catch (e) {
        decir(e.message, true);
      } finally {
        enviar.disabled = false;
      }
    });
  });
})();
</script>`;
