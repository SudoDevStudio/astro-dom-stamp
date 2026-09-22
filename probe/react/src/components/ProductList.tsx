import type { Product } from '../lib/data.ts';

export default function ProductList({ products }: { products: Product[] }) {
  return (
    <ul className="hydrated">
      {products.map((p) => (
        <li key={p.id} className="hydrated-card">
          <h3>{p.title}</h3>
          <p>{p.blurb}</p>
        </li>
      ))}
    </ul>
  );
}
