const formulario = document.querySelector('form[data-verificacion]');
if (formulario) void preparar(formulario);

async function preparar(form) {
  const bloque = form.querySelector('[data-otp]');
  const enviar = form.querySelector('[data-otp-enviar]');
  const boton = form.querySelector('[data-otp-submit]');
  const estado = form.querySelector('[data-otp-estado]');
  const error = form.querySelector('[data-otp-error]');
  const whatsapp = form.elements.whatsapp;
  const cuenta = form.dataset.verificacion === 'cuenta';
  try {
    const res = await fetch('/api/influencers/verificacion', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error();
    const config = await res.json();
    if (config.estado === 'inactiva' && !cuenta) {
      boton.disabled = false;
      return;
    }
    if (config.estado !== 'activa') throw new Error();
    bloque.hidden = false;
    if (cuenta && form.elements.desafio.value) boton.disabled = false;
    enviar.disabled = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    await new Promise((ok, mal) => {
      const tiempo = setTimeout(mal, 12000);
      script.onload = () => { clearTimeout(tiempo); ok(); };
      script.onerror = () => { clearTimeout(tiempo); mal(); };
      document.head.append(script);
    });
    const widget = window.turnstile.render(form.querySelector('[data-turnstile]'), {
      sitekey: config.sitekey, action: config.accion, size: 'flexible',
      callback: () => { enviar.disabled = false; },
      'expired-callback': () => { enviar.disabled = true; },
      'error-callback': () => { enviar.disabled = true; estado.textContent = 'El control de seguridad no cargó. Recarga la página.'; },
    });
    whatsapp?.addEventListener('input', () => {
      form.elements.desafio.value = '';
      form.elements.codigo.value = '';
      boton.disabled = true;
      estado.textContent = '';
    });
    enviar.addEventListener('click', async () => {
      if (whatsapp && !/^9\d{8}$/.test(whatsapp.value.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, ''))) {
        estado.textContent = 'Escribe tu WhatsApp peruano de nueve dígitos.';
        whatsapp.focus();
        return;
      }
      enviar.disabled = true;
      estado.textContent = 'Enviando el código…';
      try {
        const r = await fetch('/api/influencers/verificacion/enviar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuenta, whatsapp: whatsapp?.value, token: form.elements.token?.value, captcha: window.turnstile.getResponse(widget) }),
          signal: AbortSignal.timeout(18000),
        });
        const dato = await r.json();
        if (!r.ok) throw new Error(dato.error);
        form.elements.desafio.value = dato.desafio;
        estado.textContent = 'Código enviado. Revisa tu WhatsApp y escribe los seis dígitos.';
        boton.disabled = false;
        form.elements.codigo.focus();
      } catch (e) {
        estado.textContent = e.message || 'No pudimos enviar el código. Vuelve a intentarlo.';
      } finally {
        window.turnstile.reset(widget);
      }
    });
  } catch {
    error.textContent = 'La verificación por WhatsApp no está disponible. Recarga la página e inténtalo más tarde.';
    error.hidden = false;
  }
}
