import type { ResolvedOptions } from '../core/options.js';
import { VIRTUAL_RUNTIME } from './names.js';
import { isSfc, langFor, rewrite } from './rewrite.js';
import { codeFilter, mightMatch } from './sources.js';
import type { TransformStats } from './stats.js';

const SFC_EXTENSION = /\.(?:vue|svelte)(?:$|\?)/;
const NOT_SFC = /\.(?:astro|[cm]?jsx?|[cm]?tsx?)(?:$|\?)/;

export interface TransformPlugin {
  name: string;
  enforce: 'pre' | 'post';
  transform: {
    filter: {
      id: { include: string[]; exclude: Array<string | RegExp> };
      code: { include: RegExp[] };
    };
    handler(this: unknown, code: string, id: string): { code: string; map: unknown } | null;
  };
}

/**
 * Two passes, because the frameworks compile at different points.
 *
 * `.astro` is compiled in a `load` hook, upstream of every `transform`, so
 * `enforce: 'pre'` already sees JavaScript — and it is the only position where
 * `.ts` still holds the author's original source.
 *
 * `.vue` and `.svelte` are the opposite: at `pre` they are still SFC source
 * that no JavaScript parser can read, and only become JavaScript once their own
 * plugin's `transform` has run. Those go in a second pass at `enforce: 'post'`,
 * which is after every normal-stage plugin regardless of the order integrations
 * happen to be registered in.
 */
export function createTransformPlugins(
  resolved: ResolvedOptions,
  stats: TransformStats,
  withSfc: boolean,
): TransformPlugin[] {
  const passes = [pass(resolved, stats, 'pre')];
  // A project with no Vue or Svelte renderer should not pay for a second pass
  // over every module.
  if (withSfc) passes.push(pass(resolved, stats, 'post'));
  return passes;
}

function pass(
  resolved: ResolvedOptions,
  stats: TransformStats,
  enforce: 'pre' | 'post',
): TransformPlugin {
  const sources = stats.sources;
  const wantsSfc = enforce === 'post';
  // Each pass excludes the other's file types in the filter rather than in the
  // handler, so the rejection happens in Rolldown instead of crossing into JS
  // once per file.
  const notMine = wantsSfc ? NOT_SFC : SFC_EXTENSION;
  return {
    name: `astro-dom-stamp:transform-${wantsSfc ? 'sfc' : 'js'}`,
    enforce,
    transform: {
      filter: {
        id: { include: resolved.include, exclude: [...resolved.exclude, notMine] },
        code: { include: codeFilter(sources) },
      },
      handler(code: string, id: string) {
        // Repeated for Vite before 6.3, where the declarative filter is ignored.
        if (id.includes('node_modules') || id.includes(VIRTUAL_RUNTIME)) return null;
        if (isSfc(id) !== wantsSfc) return null;
        if (langFor(id) === null) return null;
        if (!mightMatch(code, sources)) return null;

        const result = rewrite(id, code, { sources });
        if (result === null) return null;

        stats.files++;
        for (const rule in result.matched) {
          stats.counts.set(rule, (stats.counts.get(rule) ?? 0) + result.matched[rule]!);
        }
        return { code: result.code, map: result.map };
      },
    },
  };
}
