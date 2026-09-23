import type { APIRoute } from 'astro';
import { makeCatalogue } from '../../lib/catalog.ts';

export const GET: APIRoute = () => Response.json(makeCatalogue(12));
