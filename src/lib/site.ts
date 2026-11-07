export const site = {
  name: 'Tato Studio',
  person: 'Carlos Quispe',
  handle: 'Tato',
  tagline: 'Cine con IA hecho en Perú',
  url: 'https://tato.pe',
  whatsappNumber: '51961662512',
  email: 'contactocon@tato.pe',
  tiktok: 'https://www.tiktok.com/@contactocontato',
  instagram: 'https://www.instagram.com/studiotato',
  facebook: 'https://www.facebook.com/contactocontato/',
  youtube: 'https://www.youtube.com/@contactocontato', // SAMPLE: confirm the channel URL
  agentia: 'https://agentia.com.pe',
  higgsfield: 'https://higgsfield.ai/?fpr=carlos-952a07',
  cities: ['Huaraz', 'Ica', 'Lima'],
  /**
   * ID del proyecto de Microsoft Clarity (no es secreto: va en la página). Vacío = no se mide nada.
   * También se puede poner como variable de compilación PUBLIC_CLARITY_ID en Cloudflare.
   */
  clarity: (import.meta.env.PUBLIC_CLARITY_ID as string | undefined) || '',
};

export function wa(text: string, number = site.whatsappNumber) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export const nav = [
  { label: 'Servicios', href: '/#oficina' },
  { label: 'Videos', href: '/#videos' },
  { label: 'Precios', href: '/#pedido' },
  { label: 'Sobre mí', href: '/#sobre-mi' },
  { label: 'Blog', href: '/blog' },
  { label: 'Recarga', href: '/recarga/' },
];

/** Custom video plans. SAMPLE prices: confirm with the client before launch. */
export const plans = [
  { id: 'basico', name: 'Básico', res: '480p', price: 39, tries: 2, days: 2, note: 'Sin edición' },
  { id: 'estandar', name: 'Estándar', res: '720p', price: 69, tries: 3, days: 3, note: 'Con música' },
  { id: 'premium', name: 'Premium', res: '1080p', price: 119, tries: 5, days: 5, note: 'Con edición y música' },
];

export const occasions = ['Pareja', 'Familia', 'Cumpleaños', 'Otro'];
export const styles = ['Zombie Love', 'Pixar', 'Cine', 'Tu idea'];

export const soles = (n: number) => `S/${n}`;
