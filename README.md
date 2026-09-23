# astro-dom-stamp

Put `data-id`, `data-uid` and `data-sku` on the elements your fetched data
renders into, so a custom visual editor knows what it is looking at — without
touching a thousand templates by hand, and without costing anything in
production.

```sh
npm install @sudodevstudio/astro-dom-stamp
```

> **Status: Phase 5.** Built, tested, and verified end to end through a real
> Astro SSR build and a real headless browser: server rendering, `client:load`
> hydration, and `client:only` islands that fetch in the browser, for React,
> Vue and Svelte. What remains is running it against a real site.
> See [Roadmap](#roadmap).

## How it works

Three pieces, all of which exist only in an edit build:

1. **Transform.** A Vite plugin wraps each fetch point in your `src/` — nothing
   in your templates changes, and nothing on disk changes.
2. **Encoder.** Every string in a fetch result gets an invisible marker
   appended, carrying the id of the nearest object that has one.
3. **SSR.** Those strings render into HTML and into hydrated island props. The
   markers travel with them, because they are just characters in a string.
4. **Browser stamper.** It reads the markers back out of the DOM, works out
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

## What gets wrapped

Your source files are not edited. Only the code the edit build compiles changes:

```ts
// your file, unchanged
const products = await (await fetch(API)).json();

// what the edit build compiles
const products = await __encode((await fetch(API)).json());
```

Every `.json()` call with no arguments is wrapped, wherever it sits:

| Your code | Edit build |
| --- | --- |
| `await res.json()` | `await __encode(res.json())` |
| `fetch(u).then((r) => r.json())` | `fetch(u).then((r) => __encode(r.json()))` |
| `return res.json()` | `return __encode(res.json())` |

There is one rule rather than one per shape, because `__encode` takes a promise
as readily as a value. Anything else you fetch through goes in `sources`:

```js
astroDomStamp({
  read: ['id', 'uid', 'sku'],
  enabled: process.env.ASTRO_DOM_STAMP_EDIT === 'true',
  sources: ['client.query', 'request', 'useQuery'],
});
```

Those are wrapped with `__encodeResult`, which copies rather than marking in
place, because a cache entry or a hook result may be shared or frozen.

A dotted name matches by its tail, so `client.query` also covers
`this.client.query`. `*` stands for one path segment, which is how an in-house
naming convention gets covered without listing every call:

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `client.*` | `client.query`, `client.fetchAll` | `client.a.b` |
| `use*Query` | `useProductsQuery` | `useProductsQueryX` |
| `api.get*` | `api.getProducts` | `api.setProducts` |
| `*.query` | `anything.query` | `query` |

Files are matched by `include` / `exclude`, and a file with no fetch point is
never parsed.

`.astro`, `.ts`, `.js`, `.tsx` and `.jsx` are handled in one pass; `.vue` and
`.svelte` need a second one, because their compilers run later than Astro's.
That second pass is only registered when `@astrojs/vue` or `@astrojs/svelte` is
in your config, so a project without them pays nothing for it.

### Finding out what to configure

An edit build reports what it wrapped, so you do not have to guess:

```
[astro-dom-stamp] wrapped 143 data sources in 88 file(s)
[astro-dom-stamp]   .json()  141
[astro-dom-stamp]   client.*  2
[WARN] [astro-dom-stamp] `sources` entry "http.get" matched no call in this build.
```

A `sources` entry that matched nothing is almost always a typo or a name that
does not exist in your codebase. If nothing at all was wrapped, your data does
not reach the page through `fetch`, and you need to name the call it does come
from.

If you need to encode something the transform cannot reach, do it yourself:

```ts
import { createEncoder } from '@sudodevstudio/astro-dom-stamp/runtime';

const { __encode } = createEncoder({ read: ['id', 'uid', 'sku'] });
const products = __encode(await db.products.findMany());
```

## Where the attribute lands

| Case | Element | Example |
| --- | --- | --- |
| Single object | Smallest element wrapping all of its text | `div.product` in `<div class="product"><h1>Shoe</h1><p>Soft</p></div>` |
| Same entity rendered twice | Each rendering gets its own attribute | a hero and a sidebar card both stamped |
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
| `sources` | `string[]` | `[]` | Extra call expressions to wrap, e.g. `client.query`, `useQuery`, `api.*`. `*` matches one path segment. |
| `skipFields` | `string[]` | see below | Extra keys whose values are never marked. |
| `include` | `string[]` | `src/**/*.{astro,ts,js,mjs,tsx,jsx}` | Files the transform covers. A project-relative glob is anchored for you, since Vite passes absolute ids. |
| `exclude` | `string[]` | `**/node_modules/**` | Files it skips. |
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
| Build | **+4.4%** over 1000 modules where 100 contain a fetch point; **+14%** if all 1000 do | < 10% |
| Server | **~6.8 ms** to encode a 1000-product response (8001 objects, 32000 strings) | < 20 ms/request |
| Browser | **~2.8 ms** first scan on a 806-element page; ~12 ms at 3206 elements | < 50 ms |
| HTML | **~410 B raw per marker, ~12 B after gzip** | measure and decide |
| `clean()` | ~22 ms over a whole 1000-product response | — |

The HTML figure is the one to watch. Raw growth is large — markers are 12 bytes
of UTF-8 per payload byte — but around 97% of it compresses away, because a
marker is a run of only four distinct characters. Budget by marker count: a page
with 500 marked strings costs roughly 6 KB gzipped.

Browser numbers come from jsdom, which is slower than a real engine, so treat
them as an upper bound. Scan time grows linearly with element count.

Each marker also carries the ordinal of the string it was attached to, which is
what lets the browser tell two renderings of one entity apart. It costs about
13% more bytes per marker; on the server it costs nothing measurable, because
the entity part of a marker is encoded once per object and reused.

## Requirements

**The page must declare UTF-8.** Markers are zero-width characters; a page
decoded as windows-1252 turns every one of them into mojibake before any of this
code runs, and nothing downstream can recover. Any normal Astro page already has
`<meta charset="utf-8">` in its head — but if yours does not, or your server
sends `Content-Type: text/html` with no charset, edit mode silently stamps
nothing. The browser console says so when `devWarnings` is on.

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
- **Build time on a worst-case codebase.** A file with no fetch point is never
  parsed, so cost tracks how many files actually fetch. At one in ten it is
  around 4%; if every file fetches it is around 14%, over the 10% budget.

## Roadmap

1. ✅ **Phase 1** — encoder, stamper, `clean()`, tests, benchmarks; Astro plugin
   order, Gurmukhi and emoji rendering, and gzipped HTML size all verified.
2. ✅ **Phase 2** — build-time transform for `.astro` and `.ts/.js` helpers,
   verified end to end against a real Astro SSR build.
3. ✅ **Phase 3** — React: `.tsx/.jsx`, browser-side fetch, hydrated islands,
   `client:only`, all verified in a real headless browser.
4. **Phase 4** — preview deployment against real pages. *This is the only step
   left, and it needs your site rather than this repo.*
5. ✅ **Phase 5** — Vue and Svelte, verified in a real headless browser.

## License

MIT
