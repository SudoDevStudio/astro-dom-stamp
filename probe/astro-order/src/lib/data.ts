export async function loadProducts() {
  const res = await fetch('https://example.com/api/products');
  return await res.json();
}
