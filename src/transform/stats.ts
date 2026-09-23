import { JSON_RULE } from './names.js';
import { compileSources, type SourceMatcher } from './sources.js';

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

const SFC_RENDERERS = ['@astrojs/vue', '@astrojs/svelte'];

export function usesSfcRenderer(integrations: ReadonlyArray<{ name: string }>): boolean {
  return integrations.some((integration) => SFC_RENDERERS.includes(integration.name));
}
