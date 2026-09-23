import { useEffect, useMemo, useState } from 'react';
import { cleanString } from '@sudodevstudio/astro-dom-stamp/core';
import type { Product } from '../lib/catalog.ts';

/** Fetches in the browser, so the markers arrive over the wire as JSON. */
export default function LiveSearch() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/products.json')
      .then((r) => r.json())
      .then(setProducts);
  }, []);

  // `cleanString` first: without it the markers sit inside every title and
  // the comparison would match far less than it should.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) => cleanString(p.title).toLowerCase().includes(needle));
  }, [products, query]);

  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name"
        aria-label="Filter by name"
      />
      <ul className="grid">
        {shown.map((product) => (
          <li key={product.id} className="card">
            <h3>{product.title}</h3>
            <p>{product.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
