import type { APIRoute } from 'astro';
import { makeCatalogue } from '../../../lib/catalog.ts';

export const GET: APIRoute = ({ params }) => {
  const product = makeCatalogue(12).find((p) => p.id === params.id);
  if (!product) return new Response('Not found', { status: 404 });
  return Response.json(product);
};
