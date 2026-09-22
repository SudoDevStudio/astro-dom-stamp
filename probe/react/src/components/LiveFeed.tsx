import { useEffect, useState } from 'react';
import type { Product } from '../lib/data.ts';

export default function LiveFeed() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch('/api/products.json')
      .then((r) => r.json())
      .then(setProducts);
  }, []);

  if (products.length === 0) return <p className="live-empty">loading</p>;
  return (
    <ul className="live">
      {products.map((p) => (
        <li key={p.id} className="live-card">
          <h3>{p.title}</h3>
          <p>{p.blurb}</p>
        </li>
      ))}
    </ul>
  );
}
