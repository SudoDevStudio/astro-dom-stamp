# Example: a shop

A small SSR Astro site to try `astro-dom-stamp` against. It has a generated
catalogue, its own JSON API, a hand-rolled fetch client, React islands, and one
path that is excluded from editing.

## Run it

From the repository root:

```sh
npm install
npm run build                 # build the package first
npm run example               # start the shop in edit mode
```

Or directly:

```sh
cd examples/shop
ASTRO_DOM_STAMP_EDIT=true npx astro dev     # edit mode
npx astro dev                               # production behaviour
```

Then open the pages. In edit mode anything the browser script stamped gets a
dashed outline; the inspector shows `data-stamp-id`, `data-stamp-sku`.

## What each page is for

| Page | Shows |
| --- | --- |
| `/` | A server-rendered grid, a `client:load` island rendering **the same three products**, and a `client:only` island that fetches in the browser |
| `/product/p0` | A single object, with nested variants and reviews that each get their own element. A product carries both keys, so it gets both attributes: `data-stamp-id="p0" data-stamp-sku="SKU-1000"`. A review has no sku, so it gets only `data-stamp-id` |
| `/admin/` | A path in `excludeUrls`: same data, same helper, no markers and no stamping |

`/` is the interesting one. The grid and the island render the same products
from the same `listProducts()` call, so their markers are identical apart from
the field ordinal — that ordinal is what lets the browser stamp both renderings
separately instead of collapsing them into one.

## What to look at in the code

- [`src/lib/api.ts`](src/lib/api.ts) — a hand-rolled client. The edit build
  wraps the `.json()` call inside it, so every caller is covered and `sources`
  stays empty.
- [`src/pages/admin/index.astro`](src/pages/admin/index.astro) — calls the same
  helper, and compares strings without `clean()`. It can, because the path is
  excluded and the data never gets markers.
- [`src/components/LiveSearch.tsx`](src/components/LiveSearch.tsx) — filters on
  `cleanString(...)`. Without it the comparison would miss, because the titles
  it fetched carry markers.
- [`src/layouts/Layout.astro`](src/layouts/Layout.astro) — `<meta charset="utf-8">`.
  Without it the browser decodes the page as windows-1252 and every marker is
  destroyed before the stamper runs.

## Verify it

```sh
node examples/shop/check.mjs
```

Builds twice, serves each build, and checks the HTML and a real browser: markers
on the shop, none on `/admin/`, each rendering stamped separately, and a
production build with nothing in it at all.

```sh
node examples/shop/check-dev.mjs
```

The same checks against `astro dev`, which serves modules one at a time through
a different pipeline and hydrates islands later than a built server does.

## Copying this out of the repo

Replace the `file:../..` dependency with the published package:

```json
"dependencies": { "@sudodevstudio/astro-dom-stamp": "^0.1.0" }
```
