export async function idDeAlta(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const sufijo = Array.from(new Uint8Array(bytes).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `creador-${sufijo}`;
}
