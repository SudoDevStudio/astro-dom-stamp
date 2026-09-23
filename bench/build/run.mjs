import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const here = new URL('./project/', import.meta.url).pathname;
const RUNS = 5;

function time(label, off) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    rmSync(here + 'dist', { recursive: true, force: true });
    rmSync(here + 'node_modules/.vite', { recursive: true, force: true });
    const start = performance.now();
    execFileSync('npx', ['astro', 'build'], {
      cwd: here,
      stdio: 'pipe',
      env: { ...process.env, ADS_OFF: off ? 'true' : '' },
    });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[samples.length >> 1];
  console.log(`  ${label.padEnd(24)} median ${(median / 1000).toFixed(2)} s   of ${samples.map((s) => (s / 1000).toFixed(2)).join(', ')}`);
  return median;
}

console.log(`Build time over ${RUNS} runs each`);
const off = time('without the plugin', true);
const on = time('with the edit transform', false);
console.log(`\nTransform adds ${(((on / off) - 1) * 100).toFixed(1)}% to build time.`);
