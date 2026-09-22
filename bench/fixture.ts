export interface Variant {
  id: string;
  sku: string;
  label: string;
  availability: string;
  _type: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  blurb: string;
  body: string;
  slug: string;
  imageUrl: string;
  publishedAt: string;
  categoryId: string;
  tags: string[];
  variants: Variant[];
  seo: { title: string; description: string };
  author: { uid: string; name: string; bio: string };
}

const WORDS = 'soft warm light rugged classic woven knit suede canvas leather'.split(' ');

function sentence(seed: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += (i ? ' ' : '') + WORDS[(seed + i * 7) % WORDS.length];
  return out;
}

export function makeProducts(count: number): Product[] {
  const products: Product[] = new Array(count);
  for (let i = 0; i < count; i++) {
    products[i] = {
      id: `p${i}`,
      sku: `SKU-${i}`,
      title: sentence(i, 3),
      blurb: sentence(i + 1, 8),
      body: sentence(i + 2, 40),
      slug: `product-${i}`,
      imageUrl: `https://cdn.example.com/${i}.jpg`,
      publishedAt: '2026-09-22T10:00:00Z',
      categoryId: `c${i % 20}`,
      tags: [sentence(i, 1), sentence(i + 3, 1), sentence(i + 5, 1)],
      variants: Array.from({ length: 3 }, (_, v) => ({
        id: `p${i}v${v}`,
        sku: `SKU-${i}-${v}`,
        label: sentence(i + v, 2),
        availability: sentence(i + v + 1, 3),
        _type: 'variant',
      })),
      seo: { title: sentence(i, 4), description: sentence(i + 9, 12) },
      author: { uid: `a${i % 50}`, name: sentence(i % 50, 2), bio: sentence(i % 50, 10) },
    };
  }
  return products;
}

export function countNodes(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let total = 1;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    total += countNodes(child, seen);
  }
  return total;
}

export function countStrings(value: unknown, seen = new WeakSet<object>()): number {
  if (typeof value === 'string') return 1;
  if (value === null || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let total = 0;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    total += countStrings(child, seen);
  }
  return total;
}

export const REFERENCE_PRODUCT_COUNT = 1000;
