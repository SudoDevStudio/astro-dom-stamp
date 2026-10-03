# astro-dom-stamp

Marks up the elements your fetched data renders into — which entity they belong
to and which field they show — so a custom visual editor knows what it is
looking at. No template edits, and nothing at all in a production build.

```sh
npm install @sudodevstudio/astro-dom-stamp
```

## Setup

```js
// astro.config.mjs
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

Gating is **build time**: with `enabled: false` the integration registers
nothing — no Vite plugin, no runtime import, no script — so preview and
production have to be separate builds.

## What you get

A Vite plugin wraps every `.json()` call in your `src/`, appending an invisible
marker to each string that carries the id of its nearest object. Those strings
render into HTML and into island props, and a browser script reads the markers
back out and writes the attributes:

```html
<article data-stamp-type="product" data-stamp-id="p0" data-stamp-sku="SKU-1000">…</article>
```

One attribute per `read` key the object actually carries. The attribute lands on
the smallest element wrapping all of the entity's text — or, for a list with 2+
items rendered, the `.map()` element for that item. Nested entities each take
their own element, and an entity rendered twice is stamped twice.

Data that never passes through `fetch` needs naming:

```js
astroDomStamp({ read: ['id', 'sku'], enabled: editing, sources: ['client.query', 'api.get*'] });
```

Each build reports what it wrapped and warns about a `sources` entry that
matched nothing.

## Field-level editing

`deepStamps` also names the element rendering each value, so an editor can write
one field instead of just highlighting a block:

```js
astroDomStamp({ read: ['_type', 'id', 'sku'], enabled: editing, deepStamps: true });
```

```html
<article data-stamp-type="product" data-stamp-id="p0" data-stamp-sku="SKU-1000">
  <h1 data-stamp-field="title" data-stamp-type="product" data-stamp-id="p0">Rugged Runner</h1>
  <li data-stamp-field="label" data-stamp-type="variant" data-stamp-id="p0v0">Bone / 39</li>
</article>
```

```js
const el = event.target.closest('[data-stamp-field]');
update({
  type:  el.dataset.stampType,   // variant
  id:    el.dataset.stampId,     // p0v0
  field: el.dataset.stampField,  // label
  value: next,
});
```

The field is a path relative to its nearest owner: `title`, `tags.0`,
`details.fabric`. A nested object with its own id is its own entity, so the
variant above is named `label`, not `variants.0.label`. Off by default because
it costs about 4 more gzipped bytes per marker.

## Reading data back

Markers are real characters. Anything that inspects a string rather than
displaying it needs them gone first:

```ts
import { clean, cleanString } from '@sudodevstudio/astro-dom-stamp/core';

if (cleanString(product.status) === 'sold') { /* … */ }
```

Import these from `/core`, not the package root. The root is the integration and
reaches the build-time transform, which carries a Rust parser. `clean()` removes
only our markers; another CMS's stega is left alone.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `read` | `string[]` | **required** | Keys that become attributes. `productId` → `data-stamp-product-id`, `_type` → `data-stamp-type`. |
| `enabled` | `boolean` | `false` | `true` for the edit build. `false` registers nothing. |
| `sources` | `string[]` | `[]` | Extra calls to wrap. `*` matches one path segment; a dotted name also matches by its tail. |
| `skipFields` | `string[]` | see below | Extra keys never encoded. |
| `deepStamps` | `boolean` | `false` | Also name the field each element renders. |
| `excludeUrls` | `string[]` | `[]` | Paths where nothing happens at all, e.g. `['/admin/*']`. |
| `attributePrefix` | `string` | `data-stamp-` | Must start with `data-`. |
| `include` / `exclude` | `string[]` | `src/**`, not `node_modules` | Files the transform covers. |
| `stripAfterStamp` | `boolean` | `false` | Remove markers from the text once stamped. |
| `devWarnings` | `boolean` | `true` | Warn about collisions and markers in unsafe places. |

**Never encoded by default:** URLs and dates; keys starting with `_`, ending in
`Id`, or containing `type`; `class`, `className`, `color`, `email`, `hex`,
`href`, `icon`, `path`, `slug`, `url` (matched on the whole key or its last word,
so `imageUrl` counts); anything under `meta`, `metadata`, `openGraph`, `seo`; and
your own `read` keys.

## Things that will bite you

- **The page must declare UTF-8.** A page decoded as windows-1252 turns every
  marker into mojibake before any of this runs, and edit mode silently stamps
  nothing. Any normal Astro page already has `<meta charset="utf-8">`.
- **String logic breaks in edit mode.** Comparisons, `slice`, `.length`, class
  names built from CMS fields. That is what `clean()`, the skip rules and
  `excludeUrls` are for. Production is unaffected — there are no markers there.
- **Strings only.** An item rendered purely as a number, or an image with no
  `alt`, carries no marker and gets no attribute.
- **Two entities on one element:** the first wins and the second is reported in
  the console. An attribute already in your markup is never overwritten.
- **Build cost tracks how many files fetch.** A file with no fetch point is
  never parsed — around 4% when one file in ten fetches, 14% if every file does.
- **Vue and Svelte** need `@astrojs/vue` or `@astrojs/svelte` present, which
  adds a second transform pass.

## Try it

[`examples/shop`](examples/shop) is a small SSR site with React, Vue and Svelte
islands and an excluded `/admin/` path.

```sh
npm install && npm run example
```

## License

MIT
