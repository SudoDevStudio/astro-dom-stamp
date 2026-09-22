import type { Product } from './fixture.ts';

export function renderPage(products: Product[], withBody = false): string {
  let cards = '';
  for (const product of products) {
    let variants = '';
    for (const variant of product.variants) {
      variants += `<li class="variant"><span class="label">${variant.label}</span><span class="stock">${variant.availability}</span></li>`;
    }
    cards +=
      `<article class="card">` +
      `<div class="info"><h3>${product.title}</h3><p class="blurb">${product.blurb}</p>` +
      (withBody ? `<div class="body">${product.body}</div>` : '') +
      `</div>` +
      `<ul class="variants">${variants}</ul>` +
      `<footer class="by">${product.author.name}</footer>` +
      `</article>`;
  }
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Catalogue</title></head>` +
    `<body><main class="grid">${cards}</main></body></html>`
  );
}
