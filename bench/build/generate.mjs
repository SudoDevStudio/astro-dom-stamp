import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('./project/', import.meta.url).pathname;
const count = Number(process.argv[2] ?? 1000);

rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, 'src/lib'), { recursive: true });
mkdirSync(join(root, 'src/pages'), { recursive: true });

// Every module carries a fetch point, so the transform has to parse all of them
// -- the worst case for build time, not the average.
for (let i = 0; i < count; i++) {
  writeFileSync(
    join(root, `src/lib/loader${i}.ts`),
    [
      `export interface Item${i} { id: string; title: string; blurb: string }`,
      `export async function load${i}(): Promise<Item${i}[]> {`,
      `  const res = await fetch('https://example.com/api/${i}');`,
      `  return (await res.json()) as Item${i}[];`,
      `}`,
      '',
    ].join('\n'),
  );
}

writeFileSync(
  join(root, 'src/lib/index.ts'),
  Array.from({ length: count }, (_, i) => `export { load${i} } from './loader${i}.ts';`).join('\n') + '\n',
);

writeFileSync(
  join(root, 'src/pages/index.astro'),
  [
    '---',
    "import * as loaders from '../lib/index.ts';",
    'const names = Object.keys(loaders);',
    '---',
    '<html lang="en"><body><ul>{names.map((n) => <li>{n}</li>)}</ul></body></html>',
    '',
  ].join('\n'),
);

writeFileSync(
  join(root, 'astro.config.mjs'),
  [
    "import { defineConfig } from 'astro/config';",
    "import node from '@astrojs/node';",
    "import astroDomStamp from '@sudodevstudio/astro-dom-stamp';",
    '',
    'export default defineConfig({',
    "  output: 'server',",
    "  adapter: node({ mode: 'standalone' }),",
    '  integrations:',
    "    process.env.ADS_OFF === 'true'",
    '      ? []',
    "      : [astroDomStamp({ read: ['id', 'uid', 'sku'], enabled: true })],",
    '});',
    '',
  ].join('\n'),
);

console.log(`Generated ${count} loader modules in ${root}`);
