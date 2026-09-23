import type { Product } from './catalog.ts';

// A hand-rolled client, the way a house codebase usually has one. The edit
// build wraps the `.json()` call in here, so every caller is covered without
// anything being listed in `sources`.
async function get<T>(path: string, origin: URL): Promise<T> {
  const res = await fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()) as T;
}

export const listProducts = (origin: URL): Promise<Product[]> =>
  get<Product[]>('/api/products.json', origin);

export const getProduct = (id: string, origin: URL): Promise<Product> =>
  get<Product>(`/api/products/${id}.json`, origin);
