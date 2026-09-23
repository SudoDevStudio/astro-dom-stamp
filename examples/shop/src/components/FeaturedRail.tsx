import type { Product } from '../lib/catalog.ts';

/**
 * A hydrated island rendering the same products the page already rendered
 * server-side, which is what makes the marker's field ordinal necessary.
 */
export default function FeaturedRail({ products }: { products: Product[] }) {
  return (
    <ul className="grid">
      {products.map((product) => (
        <li key={product.id} className="card">
          <h3>{product.title}</h3>
          <p>{product.tagline}</p>
          <strong>{product.priceLabel}</strong>
        </li>
      ))}
    </ul>
  );
}
