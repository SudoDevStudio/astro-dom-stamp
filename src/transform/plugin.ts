import type { ResolvedOptions } from '../core/options.js';
import { VIRTUAL_RUNTIME } from './names.js';
import { JSON_RULE, isSfc, langFor, rewrite } from './rewrite.js';
import { codeFilter, compileSources, mightMatch, type SourceMatcher } from './sources.js';

const SFC_EXTENSION = /\.(?:vue|svelte)(?:$|\?)/;
const NOT_SFC = /\.(?:astro|[cm]?jsx?|[cm]?tsx?)(?:$|\?)/;

export interface TransformLogger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * Astro runs several Vite builds per `astro build`, so counts accumulate here
 * and the integration reports them once from `astro:build:done`.
 */
export interface TransformStats {
  files: number;
  counts: Map<string, number>;
  sources: SourceMatcher[];
}

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

const SFC_RENDERERS = ['@astrojs/vue', '@astrojs/svelte'];

export function usesSfcRenderer(integrations: ReadonlyArray<{ name: string }>): boolean {
  return integrations.some((integration) => SFC_RENDERERS.includes(integration.name));
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

export function createStats(patterns: string[]): TransformStats {
  return { files: 0, counts: new Map(), sources: compileSources(patterns) };
}

export function reportCoverage(stats: TransformStats, logger: TransformLogger): void {
  const total = [...stats.counts.values()].reduce((a, b) => a + b, 0);
  logger.info(`wrapped ${total} data source${total === 1 ? '' : 's'} in ${stats.files} file(s)`);
  for (const [rule, count] of stats.counts) logger.info(`  ${rule}  ${count}`);

  // A configured source that matched nothing is almost always a typo, or a name
  // that does not exist in this codebase.
  for (const source of stats.sources) {
    if (!stats.counts.has(source.pattern)) {
      logger.warn(`\`sources\` entry "${source.pattern}" matched no call in this build.`);
    }
  }
  if (!stats.counts.has(JSON_RULE)) {
    logger.warn(
      'no `.json()` call was wrapped. If your data does not come from fetch, add the call it comes from to `sources`.',
    );
  }
}
