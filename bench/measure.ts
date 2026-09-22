export interface Measurement {
  label: string;
  runs: number;
  medianMs: number;
  meanMs: number;
  minMs: number;
}

export function measure(label: string, run: () => void, runs = 30, warmup = 5): Measurement {
  for (let i = 0; i < warmup; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    runs,
    medianMs: samples[samples.length >> 1]!,
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    minMs: samples[0]!,
  };
}

export function report(title: string, rows: Measurement[]): void {
  console.log(`\n${title}`);
  const width = Math.max(...rows.map((r) => r.label.length));
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(width)}  median ${row.medianMs.toFixed(2)} ms` +
        `   mean ${row.meanMs.toFixed(2)} ms   min ${row.minMs.toFixed(2)} ms`,
    );
  }
}

export const bytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
