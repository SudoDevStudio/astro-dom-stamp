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

With `enabled: false` the integration registers nothing — no Vite plugin, no
runtime import, no script — so the output is identical to a build without the
package installed. This gating is **build time**, so preview and production have
to be separate builds.

## How it works

In an edit build, a Vite plugin wraps every `.json()` call in your `src/`. The
encoder appends an invisible marker to each string in the result, carrying the
id of the nearest object that has one. Those strings render into HTML and into
island props, and a browser script reads the markers back out and writes the
attributes.

```ts
// your file, unchanged
const products = await (await fetch(API)).json();

// what the edit build compiles
const products = await __encode((await fetch(API)).json());
```

Every zero-argument `.json()` is wrapped wherever it sits — awaited, in a
`.then()`, or returned. A hand-rolled client is covered automatically, because
the wrap happens inside it.

Data that never passes through `fetch` needs naming:

```js
astroDomStamp({
  read: ['id', 'sku'],
  enabled: editing,
  sources: ['client.query', 'api.get*', 'use*Query'],
});
```

`*` matches one path segment. A dotted name also matches by its tail, so
`client.query` covers `this.client.query`. Each build reports what it wrapped
and warns about a `sources` entry that matched nothing.

## Where the attribute lands

| Case | Element |
| --- | --- |
| Single object | Smallest element wrapping all of its text |
| List, 2+ items rendered | Highest element covering only that item — the `.map()` element |
| List, 1 item rendered | No container to find, so the single-object rule applies |
| Nested entities | Each level takes its own element |
| Same entity rendered twice | Each rendering stamped separately |

An object gets one attribute per `read` key it actually carries. On top of that,
every element rendering one of its values is named with the field it shows, and
repeats the entity so a single element is enough to act on:

```html
<article data-stamp-type="product" data-stamp-id="p0" data-stamp-sku="SKU-1000">
  <h1 data-stamp-field="title"       data-stamp-type="product" data-stamp-id="p0">Rugged Runner</h1>
  <p  data-stamp-field="description" data-stamp-type="product" data-stamp-id="p0">…</p>
  <ul>
    <li data-stamp-field="label" data-stamp-type="variant" data-stamp-id="p0v0">Bone / 39</li>
  </ul>
</article>
```

```js
// an editor, or an MCP call, from one element
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
variant above is named `label`, not `variants.0.label`.

Put a type key in `read` to get `data-stamp-type` — a conventional `_type`
works, and is cleaned up rather than becoming `data-stamp--type`.

Two entities on one element, or two fields in one element: the first wins and
the second is reported in the console. An attribute already in your markup is
never overwritten — which is why the prefix is namespaced rather than a bare
`data-id`.

## Reading data back

Markers are real characters. Anything that inspects a string rather than
displaying it needs them gone first:

```ts
import { clean, cleanString } from '@sudodevstudio/astro-dom-stamp/core';

if (cleanString(product.status) === 'sold') { /* … */ }
```

Import these from `/core`, not the package root. The root is the integration and
reaches the build-time transform, which carries a Rust parser.

`clean()` removes only our markers; another CMS's stega is left alone.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `read` | `string[]` | **required** | Keys that become attributes. `productId` → `data-stamp-product-id`, `_type` → `data-stamp-type`. |
| `enabled` | `boolean` | `false` | `true` for the edit build. `false` registers nothing. |
| `sources` | `string[]` | `[]` | Extra calls to wrap. `*` matches one path segment. |
| `skipFields` | `string[]` | see below | Extra keys never encoded. |
| `excludeUrls` | `string[]` | `[]` | Paths where nothing happens at all, e.g. `['/admin/*']`. |
| `attributePrefix` | `string` | `data-stamp-` | Must start with `data-`. |
| `include` / `exclude` | `string[]` | `src/**`, not `node_modules` | Files the transform covers. |
| `stripAfterStamp` | `boolean` | `false` | Remove markers from the text once stamped. |
| `devWarnings` | `boolean` | `true` | Warn about collisions and markers in unsafe places. |

`excludeUrls` works on both ends: the browser script does nothing on those
paths, and a middleware scopes the decision to the request so the server does
not encode for them either. A shared fetch helper returns plain data when the
page asking for it is excluded.

**Never encoded by default:** URLs and dates; keys starting with `_`, ending in
`Id`, or containing `type`; `class`, `color`, `email`, `hex`, `href`, `icon`,
`path`, `slug`, `url` (matched on the whole key or its last word, so `imageUrl`
counts); anything under `meta`, `metadata`, `openGraph`, `seo`; and your own
`read` keys.

## Things that will bite you

- **The page must declare UTF-8.** A page decoded as windows-1252 turns every
  marker into mojibake before any of this runs. Any normal Astro page already
  has `<meta charset="utf-8">`; without it, edit mode silently stamps nothing.
  The console says so when `devWarnings` is on.
- **String logic breaks in edit mode.** Comparisons, `slice`, `.length`, class
  names built from CMS fields. That is what `clean()`, the skip rules and
  `excludeUrls` are for. Production is unaffected — there are no markers there.
- **Strings only.** An item rendered purely as a number, or an image with no
  `alt`, carries no marker and gets no attribute.
- **Build cost tracks how many files fetch.** A file with no fetch point is
  never parsed. Around 4% when one file in ten fetches; around 14% if every
  file does.
- **Vue and Svelte** need `@astrojs/vue` or `@astrojs/svelte` present, which
  adds a second transform pass.

## Cost

Nothing in production. In edit mode, measured on Node 22.22: about 7 ms to
encode a 1000-product response, about 3 ms for the first browser scan of an
800-element page, and about 15 bytes of gzipped HTML per marker.

## Try it

[`examples/shop`](examples/shop) is a small SSR site with React, Vue and Svelte
islands and an excluded `/admin/` path.

```sh
npm install && npm run example
```

## License

MIT
