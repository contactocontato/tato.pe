import { getCollection } from 'astro:content';
import { finConvenio } from './influencers';

/**
 * Influencers que salen en la web: con `activo: true`, sin `borrador: true` y con el convenio vigente.
 * Los borradores solo se ven con `npm run dev` o al compilar con PUBLIC_VER_BORRADORES=1 (para vistas previas).
 */
const verBorradores = import.meta.env.DEV || import.meta.env.PUBLIC_VER_BORRADORES === '1';

export async function influencersVisibles() {
  const ahora = Date.now();
  const lista = await getCollection('influencers', ({ data }) => data.activo && (verBorradores || !data.borrador) && finConvenio(data) > ahora);
  return lista.sort((a, b) => a.data.orden - b.data.orden || a.data.nombre.localeCompare(b.data.nombre, 'es'));
}
