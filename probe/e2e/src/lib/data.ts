interface JsonSource {
  json(): Promise<unknown>;
}

// Stands in for `fetch` so the probe build renders real data without a network
// call. The transform only looks at the `.json()` call, not at what produced it.
async function request(): Promise<JsonSource> {
  return {
    json: async () => [
      { id: 'p1', sku: 'AB-1', title: 'Soft Shoe', blurb: 'Warm and light' },
      { id: 'p2', sku: 'AB-2', title: 'Rugged Boot', blurb: 'Built for winter' },
    ],
  };
}

export async function loadProducts() {
  const res = await request();
  return (await res.json()) as Array<Record<string, string>>;
}
