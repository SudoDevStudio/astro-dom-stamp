export interface Product {
  id: string;
  sku: string;
  title: string;
  blurb: string;
}

async function request(): Promise<{ json(): Promise<unknown> }> {
  return {
    json: async () => [
      { id: 'p1', sku: 'AB-1', title: 'Soft Shoe', blurb: 'Warm and light' },
      { id: 'p2', sku: 'AB-2', title: 'Rugged Boot', blurb: 'Built for winter' },
    ],
  };
}

export async function loadProducts(): Promise<Product[]> {
  const res = await request();
  return (await res.json()) as Product[];
}
