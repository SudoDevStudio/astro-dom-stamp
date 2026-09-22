export interface SourceMatcher {
  pattern: string;
  test(name: string): boolean;
  /** Longest literal run in the pattern, for the pre-parse text test. */
  hint: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A source is matched on its full dotted path or on its tail, so `client.query`
 * also covers `this.client.query`. `*` stands for one path segment's worth of
 * characters, which is how a house convention like `use*Query` or `api.get*`
 * gets covered without listing every call by hand.
 */
export function compileSources(patterns: string[]): SourceMatcher[] {
  return patterns.map((pattern) => {
    const body = pattern.split('*').map(escapeRegExp).join('[^.]*');
    const regex = new RegExp(`(?:^|\\.)${body}$`);
    return { pattern, test: (name: string) => regex.test(name), hint: longestLiteral(pattern) };
  });
}

function longestLiteral(pattern: string): string {
  let best = '';
  for (const run of pattern.split(/[*.]/)) if (run.length > best.length) best = run;
  return best;
}

/** Cheap pre-test so most files never reach the parser. */
export function mightMatch(code: string, sources: SourceMatcher[]): boolean {
  if (code.includes('.json(')) return true;
  for (const source of sources) {
    // A pattern with no literal part at all cannot be pre-tested.
    if (source.hint === '' || code.includes(source.hint)) return true;
  }
  return false;
}

export function codeFilter(sources: SourceMatcher[]): RegExp[] {
  const patterns = ['\\.json\\s*\\('];
  for (const source of sources) {
    if (source.hint === '') return [/[\s\S]/];
    patterns.push(escapeRegExp(source.hint));
  }
  return patterns.map((pattern) => new RegExp(pattern));
}
