/**
 * Path patterns for `excludeUrls`. `*` matches any characters, including `/`,
 * so `/admin/*` covers `/admin/a/b` as well as `/admin/a`. A pattern ending in
 * `/*` also matches the directory itself, because `/admin/*` silently missing
 * `/admin` is an expensive way to be wrong about an opt-out.
 */
export function compileUrlPatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    compiled.push(toRegExp(pattern));
    if (pattern.endsWith('/*')) compiled.push(toRegExp(pattern.slice(0, -2)));
  }
  return compiled;
}

function toRegExp(pattern: string): RegExp {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

export function matchesUrl(pathname: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) if (pattern.test(pathname)) return true;
  return false;
}
