import { readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://localhost:7263';
const names = (await readdir(new URL('../src/lib/presets/', import.meta.url)))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5))
  .sort();
const builtinSample = names.filter((_, index) => index % 4 === 0);
const paths = [
  ...names.map((slug) => `/p/${encodeURIComponent(slug)}`),
  ...builtinSample.map((slug) => `/p/${encodeURIComponent(slug)}?source=builtin`)
];

const results = [];
let cursor = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (cursor < paths.length) {
    const index = cursor++;
    const path = paths[index];
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { accept: 'text/html', 'user-agent': 'supers-autoresearch-preset-load/1' },
        signal: AbortSignal.timeout(10_000)
      });
      const body = await response.text();
      const broken = !response.ok || body.includes("Couldn't load composition") || body.includes('Preset not found');
      results.push({ path, ms: performance.now() - started, broken, status: response.status });
    } catch (error) {
      results.push({ path, ms: performance.now() - started, broken: true, status: 0, error: String(error) });
    }
  }
});
await Promise.all(workers);

const durations = results.map((result) => result.ms).sort((a, b) => a - b);
const failures = results.filter((result) => result.broken);
const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0;
const mean = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
const score = p95 + failures.length * 10_000;
for (const failure of failures.slice(0, 10)) console.error('FAILED', failure);
console.log(`METRIC load_score_ms=${score.toFixed(3)}`);
console.log(`METRIC p95_ms=${p95.toFixed(3)}`);
console.log(`METRIC mean_ms=${mean.toFixed(3)}`);
console.log(`METRIC failures=${failures.length}`);
console.log(`METRIC requests=${results.length}`);
