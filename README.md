# astro-dom-stamp

Put `data-id`, `data-uid` and `data-sku` on the elements your fetched data
renders into, so a custom visual editor knows what it is looking at — without
touching a thousand templates by hand, and without costing anything in
production.

```sh
npm install @sudodevstudio/astro-dom-stamp
```

> **Status: Phase 1.** The encoder, the browser stamper and `clean()` are built,
> tested and measured. The build-time transform that wraps your fetch calls
> automatically is Phase 2 — until then you call `encode()` yourself at each
> fetch point. See [Roadmap](#roadmap).

## How it works

Three pieces, all of which exist only in an edit build:

1. **Encoder.** Every string in a fetch result gets an invisible marker
   appended, carrying the id of the nearest object that has one.
2. **SSR.** Those strings render into HTML and into hydrated island props. The
   markers travel with them, because they are just characters in a string.
3. **Browser stamper.** It reads the markers back out of the DOM, works out
   which element each entity belongs to, writes the attributes, and keeps
   watching for nodes that appear later.

A production build contains none of this. With `enabled: false` the integration
registers no Vite plugin, no runtime import and no script, so the output is
byte-identical to a build without the package installed.

## Setup

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import astroDomStamp from '@sudodevstudio/astro-dom-stamp';

export default defineConfig({
  integrations: [
    astroDomStamp({
      read: ['id', 'uid', 'sku'],
      enabled: process.env.ASTRO_DOM_STAMP_EDIT === 'true',
    }),
  ],
});
```

```sh
ASTRO_DOM_STAMP_EDIT=true astro build   # editor preview
astro build                             # production, zero cost
```

This gating is **build time**, which assumes preview and production are separate
builds. If one artifact is deployed to both, build-time gating cannot work —
see [Limitations](#limitations).

### Encoding your data (Phase 1)

Until the transform lands, wrap each fetch result yourself:

```ts
import { createEncoder } from '@sudodevstudio/astro-dom-stamp/runtime';

const { __encode, __encodeResult } = createEncoder({
  read: ['id', 'uid', 'sku'],
});

// A fresh parse: marked in place, nothing cloned.
const products = __encode(await res.json());

// A shared or frozen result — a GraphQL cache entry, a hook result.
const data = __encodeResult(useQuery(PRODUCTS).data);
```

## Where the attribute lands

| Case | Element | Example |
| --- | --- | --- |
| Single object | Smallest element wrapping all of its text | `div.product` in `<div class="product"><h1>Shoe</h1><p>Soft</p></div>` |
| List, 2+ items rendered | Highest element covering only that item — the `.map()` element | each `<li>` or each card |
| List, 1 item rendered | No container to find, so the single-object rule applies | `<h3>` in `<ul><li><h3>Shoe</h3></li></ul>` |
| Nested entities | Each level takes its own element | product gets `<article>`, each variant its own `<li>` |

A grid with several cards per row still stops at the card, because the row
covers more than one item.

Two entities resolving to the same element: the first wins, and the second is
reported in the console. An attribute already written in your markup is never
overwritten.

## Reading data back

Markers are real characters. Anything that inspects a string rather than
displaying it needs them gone first:

```ts
import { clean, cleanString } from '@sudodevstudio/astro-dom-stamp';

if (cleanString(product.status) === 'sold') { /* ... */ }
const payload = clean(product);        // deep, for comparisons or an API call
```

`clean()` removes only our markers. Another CMS's stega on the same string is
left exactly where it was.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `read` | `string[]` | **required** | Keys that become attributes. `id` → `data-id`, `productId` → `data-product-id`. |
| `enabled` | `boolean` | `false` | `true` for the edit build. `false` registers nothing at all. |
| `sources` | `string[]` | `[]` | Extra data sources for the transform, e.g. `client.query`, `useQuery`. (Phase 2/3.) |
| `skipFields` | `string[]` | see below | Extra keys whose values are never marked. |
| `include` | `string[]` | `src/**/*.{astro,ts,js,mjs,tsx,jsx}` | Files the transform covers. (Phase 2.) |
| `exclude` | `string[]` | `**/node_modules/**` | Files it skips. (Phase 2.) |
| `stripAfterStamp` | `boolean` | `false` | Remove markers from the text once the attribute is on. |
| `devWarnings` | `boolean` | `true` | Warn about collisions and markers in unsafe places. |

### What is never marked

A marker inside a string that gets compared, parsed, sliced or used as a URL is
the main way edit mode can break a page that production renders fine. So these
are skipped by default:

- URLs (`http`, `https`, `mailto`, `tel`, protocol-relative) and dates
- Keys starting with `_`, keys ending in `Id`, keys containing `type`
- `class`, `classname`, `color`, `email`, `hex`, `href`, `icon`, `path`,
  `slug`, `url` — matched on the whole key or its last word, so `imageUrl` and
  `bgColor` are covered
- Everything under `meta`, `metadata`, `openGraph` and `seo`
- Your own `read` keys, since ids end up in URLs and comparisons
- Empty and whitespace-only strings

When something slips through, the browser console names the attribute it landed
in, which tells you what to add to `skipFields`.

## Measured cost

Node 22.22 on an Apple Silicon laptop. Reproduce with `npm run bench`,
`npm run size` and `node --experimental-strip-types bench/scan.ts`.

| Where | Measurement | Target |
| --- | --- | --- |
| Production | nothing is included | 0 |
| Server | **~6 ms** to encode a 1000-product response (8001 objects, 32000 strings) | < 20 ms/request |
| Browser | **~2.3 ms** first scan on a 806-element page; ~10.5 ms at 3206 elements | < 50 ms |
| HTML | **~360 B raw per marker, ~12 B after gzip** | measure and decide |
| `clean()` | ~22 ms over a whole 1000-product response | — |

The HTML figure is the one to watch. Raw growth is large — markers are 12 bytes
of UTF-8 per payload byte — but around 97% of it compresses away, because a
marker is a run of only four distinct characters. Budget by marker count: a page
with 500 marked strings costs roughly 6 KB gzipped.

Browser numbers come from jsdom, which is slower than a real engine, so treat
them as an upper bound. Scan time grows linearly with element count.

## Limitations

- **Strings only.** An item rendered purely as a number or an image with no
  `alt` carries no marker and gets no attribute.
- **String logic breaks in edit mode.** Comparisons, lookups, `slice`,
  `.length`, and class names built from CMS fields. The skip rules, `clean()`
  and the console warnings exist to manage this. Production is unaffected —
  there are no markers there at all.
- **One build for both deployments.** Build-time gating assumes preview and
  production are built separately. If a single artifact serves both and only the
  runtime environment differs, this approach cannot give you a zero-cost
  production path.
- **Coverage.** Data that does not come from `.json()` or a configured source —
  a database driver, some SDKs — is not reached.
- **Another CMS's stega.** Markers coexist: ours uses a different prefix, and
  each decoder skips the other. Still simpler to turn the CMS's own stega off
  when you have your own editor.
- **Vue and Svelte** are not covered yet.

## Roadmap

1. ✅ **Phase 1** — encoder, stamper, `clean()`, tests, benchmarks; Astro plugin
   order, Gurmukhi and emoji rendering, and gzipped HTML size all verified.
2. **Phase 2** — build-time transform for `.astro` and `.ts/.js` helpers.
3. **Phase 3** — React: `.tsx/.jsx`, browser-side fetch, hooks named in `sources`.
4. **Phase 4** — preview deployment against real pages.
5. **Phase 5** — Vue and Svelte.

## License

MIT
