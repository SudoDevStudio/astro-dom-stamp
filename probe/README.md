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
