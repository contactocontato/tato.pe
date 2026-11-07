import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { categoryIds, defaultCategory } from './lib/blog';
import { rubrosIds, redes } from './lib/influencers';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(categoryIds).default(defaultCategory), // ids in src/lib/blog.ts
    cover: z.string().optional(),      // path under /public, e.g. /poster/afhs-joel.jpg
    coverAlt: z.string().optional(),
    video: z.string().optional(),      // muted loop under /public/video, own or client work only; cover is its poster
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    short: z.string(),
    price: z.number(),
    compareAt: z.number().optional(),
    kind: z.enum(['pack', 'taller', 'curso']),
    available: z.boolean().default(true),
    availableFrom: z.string().optional(),
    when: z.string().optional(),       // for talleres: date and time
    seats: z.number().optional(),
    includes: z.array(z.string()),
    cover: z.string(),
    coverAlt: z.string(),
    cta: z.string().default('Comprar'),
    order: z.number().default(0),
  }),
});

// Influencers con convenio. Una ficha por influencer en src/content/influencers/<id>.md; el id es su URL (/influencers/<id>/).
// Cómo agregar uno: ver CLAUDE.md, sección «Influencers».
const influencers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/influencers' }),
  schema: z.object({
    nombre: z.string(),
    usuario: z.string(),                       // su @ principal, sin la arroba
    foto: z.string(),                          // vertical 4:5, aprobada por el influencer, en public/influencers/<id>/
    fotoAlt: z.string(),
    estilo: z.string(),                        // su estilo en pocas palabras
    rubros: z.array(z.enum(rubrosIds)).min(1),
    regiones: z.array(z.string()).min(1),      // dónde tiene más público o dónde graba: Huaraz, Ica, Lima…
    redes: z.array(z.object({
      red: z.enum(redes),
      url: z.string().url(),
      seguidores: z.number().int().nonnegative(),
    })).min(1),
    cifrasAl: z.coerce.date(),                 // el día en que se contaron los seguidores
    encajaCon: z.array(z.string()).default([]),
    noAcepta: z.array(z.string()).default([]),
    paquetes: z.array(z.object({
      nombre: z.string(),
      precio: z.number().optional(),           // en soles; sin precio sale «A cotizar»
      segundos: z.number().int().positive().optional(), // duración de cada video (la orden de servicio la muestra)
      videos: z.number().int().positive().optional(),   // cuántos videos incluye (1 si no se pone)
      incluye: z.array(z.string()).min(1),
      entrega: z.string(),
      uso: z.string(),                         // dónde y por cuánto tiempo puede usar el video el negocio
    })).min(1),
    muestras: z.array(z.object({
      video: z.string(),                       // mp4 corto hecho con IA y aprobado por el influencer
      poster: z.string(),
      titulo: z.string(),
    })).default([]),
    convenioHasta: z.coerce.date().optional(),
    activo: z.boolean().default(true),         // false: no sale en la web (convenio vencido o pausado)
    borrador: z.boolean().default(false),      // true: solo en vistas previas, nunca en tato.pe
    orden: z.number().default(0),
  }),
});

export const collections = { blog, products, influencers };
