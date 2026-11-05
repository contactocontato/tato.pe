import type { APIRoute } from 'astro';
import { influencersVisibles } from '../../lib/catalogo';
import { finConvenio } from '../../lib/influencers';

/**
 * /influencers/datos.json: lo que el Worker necesita saber de cada influencer publicado
 * (nombre, @, paquetes y precios, cuándo vence su convenio). Es lo mismo que ya se ve en los perfiles:
 * nada privado va aquí. Lo usa worker/pedidos.js para armar cada pedido.
 */
export const GET: APIRoute = async () => {
  const lista = await influencersVisibles();
  const influencers = lista.map((i) => {
    const fin = finConvenio(i.data);
    return {
      id: i.id,
      nombre: i.data.nombre,
      usuario: i.data.usuario,
      fin: Number.isFinite(fin) ? fin : null,
      paquetes: i.data.paquetes.map((p) => ({ nombre: p.nombre, precio: p.precio ?? null, entrega: p.entrega, uso: p.uso })),
    };
  });
  return new Response(JSON.stringify({ influencers }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
