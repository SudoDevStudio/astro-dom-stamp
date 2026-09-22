import type { ResolvedOptions } from '../core/options.js';
import { VIRTUAL_RUNTIME } from './names.js';
import { langFor, mightMatch, rewrite } from './rewrite.js';

export interface TransformPlugin {
  name: string;
  enforce: 'pre';
  transform: {
    filter: { id: { include: string[]; exclude: string[] }; code: { include: RegExp[] } };
    handler(
      this: unknown,
      code: string,
      id: string,
    ): { code: string; map: unknown } | null;
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function codeFilter(sources: string[]): RegExp[] {
  const patterns = ['\\.json\\s*\\('];
  for (const source of sources) {
    const tail = source.slice(source.lastIndexOf('.') + 1);
    patterns.push(`\\b${escapeRegExp(tail)}\\s*\\(`);
  }
  return patterns.map((pattern) => new RegExp(pattern));
}

/**
 * Runs at `enforce: 'pre'` because that is the only position where `.ts` still
 * holds the author's original source; `.astro` is already compiled to JS at
 * every position, which is why no Astro-specific parser is needed.
 */
export function createTransformPlugin(resolved: ResolvedOptions): TransformPlugin {
  const sources = resolved.sources;
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
        return result === null ? null : { code: result.code, map: result.map };
      },
    },
  };
}
