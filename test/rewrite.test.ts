import { describe, expect, it } from 'vitest';
import { isSfc, langFor, rewrite } from '../src/transform/rewrite.ts';
import { compileSources, mightMatch } from '../src/transform/sources.ts';
import { ENCODE_LOCAL, ENCODE_RESULT_LOCAL, VIRTUAL_RUNTIME } from '../src/transform/names.ts';

function body(id: string, code: string, sources: string[] = []): string | null {
  const result = rewrite(id, code, { sources: compileSources(sources) });
  if (!result) return null;
  return result.code.split('\n').slice(1).join('\n').trim();
}

describe('fetch results', () => {
  it('wraps an awaited .json()', () => {
    expect(body('a.ts', 'const p = await res.json();')).toBe(
      `const p = await ${ENCODE_LOCAL}(res.json());`,
    );
  });

  it('wraps a .json() inside a .then callback', () => {
    expect(body('a.ts', 'const p = fetch(u).then((r) => r.json());')).toBe(
      `const p = fetch(u).then((r) => ${ENCODE_LOCAL}(r.json()));`,
    );
  });

  it('wraps a returned .json() promise', () => {
    expect(body('a.ts', 'export const load = () => fetch(u).then((r) => r.json());')).toContain(
      `${ENCODE_LOCAL}(r.json())`,
    );
  });

  it('wraps an optional call', () => {
    expect(body('a.ts', 'const p = await res?.json();')).toBe(
      `const p = await ${ENCODE_LOCAL}(res?.json());`,
    );
  });

  it('wraps every fetch point in a file', () => {
    const result = rewrite(
      'a.ts',
      'const a = await one.json();\nconst b = await two.json();',
      {},
    );
    expect(result?.wrapped).toBe(2);
  });

  it('leaves a json call that takes arguments alone', () => {
    expect(rewrite('a.ts', 'const p = await res.json({ reviver });')).toBeNull();
  });

  it('leaves a computed json access alone', () => {
    expect(rewrite('a.ts', 'const p = await res["json"]();')).toBeNull();
  });
});

describe('configured sources', () => {
  it('wraps a dotted source with the copying encoder', () => {
    expect(body('a.ts', 'const d = await client.query({ query: Q });', ['client.query'])).toBe(
      `const d = await ${ENCODE_RESULT_LOCAL}(client.query({ query: Q }));`,
    );
  });

  it('wraps a bare source call', () => {
    expect(body('a.tsx', 'const d = useQuery(Q);', ['useQuery'])).toBe(
      `const d = ${ENCODE_RESULT_LOCAL}(useQuery(Q));`,
    );
  });

  it('matches a dotted source by its tail', () => {
    expect(body('a.ts', 'const d = await this.client.query(Q);', ['client.query'])).toContain(
      `${ENCODE_RESULT_LOCAL}(this.client.query(Q))`,
    );
  });

  it('ignores a source that is not configured', () => {
    expect(rewrite('a.ts', 'const d = useQuery(Q);', { sources: compileSources([]) })).toBeNull();
  });

  it('does not match a bare name against a dotted call', () => {
    expect(rewrite('a.ts', 'const d = a.useQueryX(Q);', { sources: compileSources(['useQuery']) })).toBeNull();
  });
});

describe('safety', () => {
  it('adds the runtime import exactly once', () => {
    const result = rewrite('a.ts', 'const a = await one.json();\nconst b = await two.json();')!;
    expect(result.code.split(VIRTUAL_RUNTIME)).toHaveLength(2);
    expect(result.code.startsWith('import {')).toBe(true);
  });

  it('never runs twice over its own output', () => {
    const once = rewrite('a.ts', 'const p = await res.json();')!;
    expect(rewrite('a.ts', once.code)).toBeNull();
  });

  it('leaves a file with no fetch point untouched', () => {
    expect(rewrite('a.ts', 'export const x = 1;')).toBeNull();
  });

  it('gives up on a file it cannot parse', () => {
    expect(rewrite('a.ts', 'const p = await res.json(;')).toBeNull();
  });

  it('produces a sourcemap', () => {
    const result = rewrite('a.ts', 'const p = await res.json();')!;
    expect(result.map.mappings.length).toBeGreaterThan(0);
    expect(result.map.sources).toContain('a.ts');
  });

  it('handles compiled .astro output', () => {
    const compiled = [
      'import { createComponent as $$createComponent } from "astro/runtime";',
      'const $$Index = $$createComponent(async ($$result) => {',
      '  const products = await (await fetch(API)).json();',
      '  return products;',
      '});',
    ].join('\n');
    expect(rewrite('/src/pages/index.astro', compiled)?.code).toContain(
      `${ENCODE_LOCAL}((await fetch(API)).json())`,
    );
  });

  it('handles TSX generics and JSX', () => {
    const code = 'const f = async <T,>(u: string): Promise<T> => (await fetch(u)).json();';
    expect(rewrite('a.tsx', code)?.wrapped).toBe(1);
  });
});

describe('file selection', () => {
  it.each([
    ['a.ts', 'ts'],
    ['a.tsx', 'tsx'],
    ['a.jsx', 'jsx'],
    ['a.mjs', 'js'],
    ['a.astro', 'js'],
    ['a.astro?astro&type=script', 'js'],
  ])('maps %s to %s', (id, lang) => {
    expect(langFor(id)).toBe(lang);
  });

  it('refuses a file type it cannot parse', () => {
    expect(langFor('a.css')).toBeNull();
    expect(langFor('a.md')).toBeNull();
  });

  it('treats a compiled single-file component as TypeScript', () => {
    expect(langFor('a.vue')).toBe('ts');
    expect(langFor('a.svelte')).toBe('ts');
  });

  it.each([
    ['a.vue', true],
    ['a.svelte', true],
    ['a.vue?vue&type=script', true],
    ['a.astro', false],
    ['a.tsx', false],
  ])('knows %s is a single-file component: %s', (id, expected) => {
    expect(isSfc(id)).toBe(expected);
  });

  it('pre-tests without parsing', () => {
    expect(mightMatch('const x = 1;', [])).toBe(false);
    expect(mightMatch('await res.json()', [])).toBe(true);
    expect(mightMatch('useQuery(Q)', compileSources(['useQuery']))).toBe(true);
    expect(mightMatch('client.query(Q)', compileSources(['client.query']))).toBe(true);
  });
});

describe('wildcard sources', () => {
  const wrapped = (code: string, sources: string[]) =>
    rewrite('a.ts', code, { sources: compileSources(sources) })?.wrapped ?? 0;

  it.each([
    ['client.*', 'const d = await client.query(Q);'],
    ['client.*', 'const d = await client.fetchAll(Q);'],
    ['use*Query', 'const d = useProductsQuery(Q);'],
    ['api.get*', 'const d = await api.getProducts();'],
    ['*.query', 'const d = await anything.query(Q);'],
  ])('pattern %s matches %s', (pattern, code) => {
    expect(wrapped(code, [pattern])).toBe(1);
  });

  it.each([
    ['client.*', 'const d = await client.a.b(Q);'],
    ['use*Query', 'const d = useProductsQueryX(Q);'],
    ['api.get*', 'const d = await api.setProducts();'],
  ])('pattern %s does not match %s', (pattern, code) => {
    expect(wrapped(code, [pattern])).toBe(0);
  });

  it('still matches a dotted pattern by its tail', () => {
    expect(wrapped('const d = await this.deps.client.query(Q);', ['client.query'])).toBe(1);
  });

  it('reports which rule wrapped what', () => {
    const result = rewrite(
      'a.ts',
      'const a = await res.json();\nconst b = await client.query(Q);',
      { sources: compileSources(['client.*']) },
    )!;
    expect(result.matched).toEqual({ '.json()': 1, 'client.*': 1 });
  });

  it('pre-tests a wildcard pattern by its longest literal run', () => {
    expect(mightMatch('useProductsQuery(Q)', compileSources(['use*Query']))).toBe(true);
    expect(mightMatch('somethingElse(Q)', compileSources(['use*Query']))).toBe(false);
    expect(mightMatch('http.get(u)', compileSources(['http.*']))).toBe(true);
  });
});
