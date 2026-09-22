import type { ResolvedOptions } from '../core/options.js';
import { VIRTUAL_RUNTIME } from './names.js';
import { JSON_RULE, langFor, rewrite } from './rewrite.js';
import { codeFilter, compileSources, mightMatch, type SourceMatcher } from './sources.js';

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
  enforce: 'pre';
  transform: {
    filter: { id: { include: string[]; exclude: string[] }; code: { include: RegExp[] } };
    handler(this: unknown, code: string, id: string): { code: string; map: unknown } | null;
  };
}

/**
 * Runs at `enforce: 'pre'` because that is the only position where `.ts` still
 * holds the author's original source; `.astro` is already compiled to JS at
 * every position, which is why no Astro-specific parser is needed.
 */
export function createTransformPlugin(
  resolved: ResolvedOptions,
  stats: TransformStats,
): TransformPlugin {
  const sources = stats.sources;
  return {
    name: 'astro-dom-stamp:transform',
    enforce: 'pre',
    transform: {
      filter: {
        id: { include: resolved.include, exclude: resolved.exclude },
        code: { include: codeFilter(sources) },
      },
      handler(code: string, id: string) {
        // Repeated for Vite before 6.3, where the declarative filter is ignored.
        if (id.includes('node_modules') || id.includes(VIRTUAL_RUNTIME)) return null;
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
