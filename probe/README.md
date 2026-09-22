# Probes

Small experiments that answer a design question with a real build rather than a
guess. Each one records what it found, with the versions it found it on.

## `astro-order` — where does our transform sit relative to Astro's compiler?

**Question (kickoff, Phase 1):** does our Vite plugin run before or after Astro
compiles `.astro`? If before, we need `@astrojs/compiler-rs` to parse Astro
source. If after, `oxc-parser` alone is enough, because we would be looking at
plain JavaScript.

**Method:** register the same probe plugin three times — `enforce: 'pre'`, no
`enforce`, and `enforce: 'post'` — and record, for every non-`node_modules`
file reaching `transform`, whether the code still looks like Astro source
(a `---` frontmatter fence) or like compiler output (`createComponent`).

Run it with:

```sh
cd probe/astro-order && npx astro build
```

**Result — Astro 7.3.3, `output: 'server'`, `@astrojs/node` standalone, Node 22.22:**

| Plugin position | `.astro` reaches us as | `.ts` reaches us as |
| --- | --- | --- |
| `enforce: 'pre'` | compiled JS (`createComponent`) | original source |
| no `enforce` | compiled JS | after TS transform |
| `enforce: 'post'` | compiled JS | after TS transform |

The same result came back from a static build, so it is not adapter-specific.

**Conclusion:** `.astro` is compiled by the time any `transform` hook runs, at
every position including `pre`. Astro does that work in `load`, upstream of the
whole `transform` pipeline.

Two things follow for the design:

1. **`@astrojs/compiler-rs` is not needed.** `oxc-parser` handles every file we
   care about: `.astro` arrives as JavaScript, `.tsx/.jsx/.ts/.js` arrive as
   themselves. That removes one 0.x dependency and one entire parser code path
   from the plan in the kickoff.
2. **We want `enforce: 'pre'`.** For `.ts` it is the only position that still
   sees the author's original source, which keeps our `magic-string` edits and
   their sourcemaps aligned with the file on disk.

**Caveat to re-check on upgrade:** this is behaviour, not a documented
guarantee. The probe is cheap — re-run it when bumping Astro, and treat a
`fence=True` row as a signal that the Astro parser path is needed after all.

## `e2e` — does the whole pipeline work in a real Astro build?

**Question:** the unit tests cover each piece on its own. Do the transform, the
encoder, SSR and the stamper actually line up inside a real Astro SSR build?

**Method:** build a small SSR project twice — once with `ASTRO_DOM_STAMP_EDIT=true`
and once without — start the standalone Node server each time, fetch the page,
and check the HTML that comes back. The edit HTML is then run through the real
browser stamper under jsdom.

```sh
npm run build && node probe/e2e/check.mjs
```

**Result — Astro 7.3.3, `@astrojs/node` standalone, Node 22.22:** all nine
checks pass. The edit build wraps the `.json()` call, the SSR HTML carries
markers that decode back to the fetched ids and list indices, the stamper puts
`data-id` and `data-sku` on each `<li class="card">` — the `.map()` element, not
the text element — and the production HTML is byte-identical to the edit HTML
once markers and the injected script are removed.

**Two bugs this caught that the unit tests could not:**

1. The default `include` glob was `src/**/*.{...}`, which never matches the
   absolute ids Vite passes. Project-relative globs are now anchored.
2. The virtual runtime module exported the raw `encode` rather than going
   through `createEncoder`, so `__encode(res.json())` was handed a promise and
   returned it untouched. Both the unit tests and the transform were correct in
   isolation; only running them together showed it.
