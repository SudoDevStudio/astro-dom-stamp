import { loadProducts } from '../../lib/data.ts';

export async function GET() {
  return Response.json(await loadProducts());
}
