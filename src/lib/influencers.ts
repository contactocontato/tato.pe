/**
 * Datos y formatos del catálogo de influencers (/influencers/).
 * Este archivo no importa astro:content para que lo pueda usar src/content.config.ts.
 */

/** Rubros de contenido de cada influencer. El id va en el campo `rubros:` de su ficha. */
export const rubrosIds = ['comida', 'viajes', 'humor', 'fitness', 'familia', 'moda', 'tecnologia', 'musica', 'deportes', 'educacion'] as const;
export type RubroId = (typeof rubrosIds)[number];

export const rubroNombre: Record<RubroId, string> = {
  comida: 'Comida',
  viajes: 'Viajes',
  humor: 'Humor',
  fitness: 'Fitness',
  familia: 'Familia',
  moda: 'Moda y belleza',
  tecnologia: 'Tecnología',
  musica: 'Música',
  deportes: 'Deportes',
  educacion: 'Educación',
};

export const redes = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'Kick', 'Twitch'] as const;

/** 25 mil, 1 millón, 1.2 millones. */
export function seguidores(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10;
    return `${m.toLocaleString('es-PE', { maximumFractionDigits: 1 })} ${m === 1 ? 'millón' : 'millones'}`;
  }
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString('es-PE')} mil`;
  return n.toLocaleString('es-PE');
}

export const soles = (n: number) => `S/ ${n.toLocaleString('en-US')}`;

/** «octubre de 2026», para decir de cuándo son las cifras. UTC a propósito: la fecha va tal cual está en la ficha. */
export const mesAnio = (d: Date) => d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface ConPaquetes { paquetes: { precio?: number }[] }
/** El precio más bajo de sus paquetes, o null si todos se cotizan. */
export function desde(d: ConPaquetes): number | null {
  const precios = d.paquetes.map((p) => p.precio).filter((p): p is number => typeof p === 'number');
  return precios.length ? Math.min(...precios) : null;
}

interface ConRedes { redes: { seguidores: number }[] }
export const comunidad = (d: ConRedes) => d.redes.reduce((s, r) => s + r.seguidores, 0);

/**
 * Cuándo vence el permiso de imagen, en milisegundos: al final del día de `convenioHasta` en Lima (UTC−5).
 * Sin fecha, no vence. Se usa al compilar (la ficha vencida no se publica) y en el navegador
 * (si vence entre una publicación y otra, se deja de ofrecer en ese momento).
 */
export const finConvenio = (d: { convenioHasta?: Date }) => (d.convenioHasta ? d.convenioHasta.getTime() + 29 * 3_600_000 : Infinity);
