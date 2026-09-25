# Example: a shop

A small SSR Astro site to try the integration against, and the repository's
verification suite.

```sh
npm install && npm run example     # from the repo root, in edit mode
```

In edit mode anything the browser script stamped gets a dashed outline; the
inspector shows `data-stamp-id` and `data-stamp-sku`.

| Page | Shows |
| --- | --- |
| `/` | A server-rendered grid, a React island rendering **the same three products**, and a React island that fetches in the browser |
| `/product/p0` | A single object, with variants and reviews each taking their own element |
| `/frameworks` | A Vue island hydrated with props, and a Svelte island that fetches in the browser |
| `/admin/` | A path in `excludeUrls`: same data, same helper, no markers and no stamping |

Worth reading: [`src/lib/api.ts`](src/lib/api.ts), a hand-rolled client whose
`.json()` call the edit build wraps, so `sources` stays empty.
[`src/pages/admin/index.astro`](src/pages/admin/index.astro) compares strings
without `clean()`, which it can because the path is excluded.

## Verify

```sh
npm run verify        # from the repo root
```

Builds twice, serves each build and drives a real browser, in build mode and
under `astro dev`. Twenty-five checks.

## Copying this out of the repo

Replace the `file:../..` dependency with the published package.
