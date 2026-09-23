import { describe, expect, it } from 'vitest';
import { compileUrlPatterns, matchesUrl } from '../src/core/urls.js';

const match = (patterns: string[], path: string) =>
  matchesUrl(path, compileUrlPatterns(patterns));

describe('excludeUrls patterns', () => {
  it.each([
    ['/admin/*', '/admin/settings', true],
    ['/admin/*', '/admin/users/42/edit', true],
    ['/admin/*', '/admin/', true],
    ['/admin/*', '/admin', true],
    ['/admin/*', '/administration', false],
    ['/admin/*', '/shop/admin/x', false],
    ['/checkout', '/checkout', true],
    ['/checkout', '/checkout/step-1', false],
    ['/*/preview', '/a/preview', true],
    ['/*/preview', '/a/b/preview', true],
    ['*', '/anything/at/all', true],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(match([pattern], path)).toBe(expected);
  });

  it('matches when any pattern matches', () => {
    expect(match(['/admin/*', '/checkout/*'], '/checkout/pay')).toBe(true);
  });

  it('matches nothing when no pattern is given', () => {
    expect(match([], '/admin')).toBe(false);
  });

  it('treats regex characters in a pattern as literal', () => {
    expect(match(['/a.b'], '/a.b')).toBe(true);
    expect(match(['/a.b'], '/axb')).toBe(false);
  });
});
