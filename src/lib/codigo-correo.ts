// Bloque «confirma tu correo» de los formularios de la web (registro de creadores y de negocios).
// Pide el código a /api/correo/codigo (worker/correo.js) y deja el desafío en el formulario.
// Si el envío de correos no está configurado, el bloque queda oculto y el formulario sigue sin código.
//
// Marcado que espera dentro del <form>:
//   <div data-correo-codigo hidden>
//     <button type="button" data-correo-enviar>…</button>
//     <p data-correo-estado role="status"></p>
//     <input type="hidden" name="desafioCorreo">
//     <input name="codigoCorreo" …>
//   </div>
// y un <input name="correo" type="email"> en el mismo formulario.

export interface CodigoCorreo {
  /** true si el formulario tiene que llevar el código. */
  activo: () => boolean;
  /** '' si está todo bien; si no, qué falta. */
  revisar: () => string;
}

export function prepararCodigoCorreo(form: HTMLFormElement, opciones: { proposito: 'alta-creador' | 'registro-negocio'; token: string }): CodigoCorreo {
  const bloque = form.querySelector<HTMLElement>('[data-correo-codigo]');
  const enviar = form.querySelector<HTMLButtonElement>('[data-correo-enviar]');
  const estado = form.querySelector<HTMLElement>('[data-correo-estado]');
  const correo = form.elements.namedItem('correo') as HTMLInputElement | null;
  const desafio = form.elements.namedItem('desafioCorreo') as HTMLInputElement | null;
  const codigo = form.elements.namedItem('codigoCorreo') as HTMLInputElement | null;
  let activo = false;
  if (!bloque || !enviar || !estado || !correo || !desafio || !codigo) return { activo: () => false, revisar: () => '' };

  const decir = (t: string) => { estado.textContent = t; };
  let espera = 0;
  let reloj: number | undefined;
  const contar = (segundos: number) => {
    espera = segundos;
    clearInterval(reloj);
    const pintar = () => {
      enviar.disabled = espera > 0;
      enviar.textContent = espera > 0 ? `Pedir otro código en ${espera} s` : desafio.value ? 'Mandarme otro código' : 'Mandarme el código';
    };
    pintar();
    reloj = window.setInterval(() => { espera -= 1; pintar(); if (espera <= 0) clearInterval(reloj); }, 1000);
  };

  fetch('/api/correo/estado').then((r) => r.json()).then((r: { activo?: boolean }) => {
    activo = Boolean(r.activo);
    bloque.hidden = !activo;
    codigo.required = activo;
    correo.required = correo.required || activo;
  }).catch(() => { /* sin respuesta: el servidor decide al enviar */ });

  correo.addEventListener('input', () => {
    if (!desafio.value) return;
    desafio.value = '';
    codigo.value = '';
    decir('Cambiaste el correo: pide un código nuevo.');
  });

  enviar.addEventListener('click', async () => {
    if (!correo.checkValidity() || !correo.value.trim()) {
      correo.reportValidity();
      return;
    }
    enviar.disabled = true;
    decir('Mandando el código…');
    try {
      const res = await fetch('/api/correo/codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: correo.value, proposito: opciones.proposito, token: opciones.token }),
        signal: AbortSignal.timeout(15000),
      });
      const r = await res.json().catch(() => ({ error: 'No pudimos leer la respuesta. Inténtalo de nuevo.' }));
      if (!res.ok || !r.desafio) {
        decir(r.error || 'No pudimos mandar el código. Inténtalo de nuevo.');
        contar(res.status === 429 ? 60 : 0);
        return;
      }
      desafio.value = r.desafio;
      decir(`Te mandamos un código a ${r.enviadoA}. Revisa también la carpeta de spam.`);
      codigo.focus();
      contar(60);
    } catch {
      decir('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
      contar(0);
    }
  });

  return {
    activo: () => activo,
    revisar: () => {
      if (!activo) return '';
      if (!desafio.value) return 'Confirma tu correo: pide el código y escríbelo.';
      if (!/^\d{6}$/.test(codigo.value.trim())) return 'Escribe los 6 números del código que te llegó al correo.';
      return '';
    },
  };
}
