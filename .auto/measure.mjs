import { readFile, readdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://localhost:7263';
const names = (await readdir(new URL('../src/lib/presets/', import.meta.url)))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5))
  .sort();
const builtinSample = names.filter((_, index) => index % 4 === 0);
const normalPaths = names.map((slug) => `/p/${encodeURIComponent(slug)}`);
const paths = [
  ...normalPaths,
  ...builtinSample.map((slug) => `/p/${encodeURIComponent(slug)}?source=builtin`),
  ...normalPaths
];

const results = [];
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}
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

// Exercise the real autosave/read race on one valid, disposable User composition.
// Broad corpus coverage above remains the majority of requests, so this does not
// optimize for a synthetic route at the expense of normal preset paths.
const probeSlug = 'autoresearch-load-reliability-probe';
const blankPreset = JSON.parse(
  await readFile(new URL('../src/lib/presets/blank.json', import.meta.url), 'utf8')
);
const setupResponse = await fetch(`${baseUrl}/api/user-compositions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: probeSlug, preset: blankPreset, forkedFrom: 'blank' })
});
if (!setupResponse.ok) throw new Error(`Probe setup failed: ${setupResponse.status}`);
let operationFailures = 0;
try {
  const stressOperations = Array.from({ length: 48 }, async (_, index) => {
    if (index % 3 === 0) {
      const preset = {
        ...blankPreset,
        name: `Load reliability probe ${index}`,
        description: `${index}:${'reliable autosave '.repeat(512)}`
      };
      const response = await fetch(`${baseUrl}/api/user-compositions/${probeSlug}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(preset)
      });
      if (!response.ok) operationFailures++;
      return;
    }

    const path = `/p/${probeSlug}`;
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
  });
  await Promise.all(stressOperations);
} finally {
  const cleanupResponse = await fetch(`${baseUrl}/api/user-compositions/${probeSlug}`, { method: 'DELETE' });
  if (!cleanupResponse.ok) operationFailures++;
}

// A broken optional User override must not make its valid built-in Preset unavailable.
// Select a disposable built-in slug without an existing override, publish it through
// the real API so the filename index stays authoritative, then corrupt only its file.
const metadataResponse = await fetch(`${baseUrl}/api/user-compositions?view=cards`);
if (!metadataResponse.ok) throw new Error(`Fault probe metadata failed: ${metadataResponse.status}`);
const userCompositionMetadata = await metadataResponse.json();
const occupiedSlugs = new Set(userCompositionMetadata.map((entry) => entry.slug));
const corruptOverrideSlug = names.find((slug) => !occupiedSlugs.has(slug));
if (!corruptOverrideSlug) throw new Error('No disposable built-in slug is available for fault probing.');
const corruptOverridePreset = JSON.parse(
  await readFile(new URL(`../src/lib/presets/${corruptOverrideSlug}.json`, import.meta.url), 'utf8')
);
const corruptSetupResponse = await fetch(`${baseUrl}/api/user-compositions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    slug: corruptOverrideSlug,
    preset: corruptOverridePreset,
    forkedFrom: corruptOverrideSlug
  })
});
if (!corruptSetupResponse.ok) {
  throw new Error(`Corrupt override setup failed: ${corruptSetupResponse.status}`);
}
try {
  await writeFile(
    new URL(`../user-compositions/${corruptOverrideSlug}.json`, import.meta.url),
    '{"truncated":',
    'utf8'
  );
  const path = `/p/${encodeURIComponent(corruptOverrideSlug)}`;
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
} finally {
  const cleanupResponse = await fetch(`${baseUrl}/api/user-compositions/${corruptOverrideSlug}`, {
    method: 'DELETE'
  });
  if (!cleanupResponse.ok) operationFailures++;
}

const durations = results.map((result) => result.ms).sort((a, b) => a - b);
const failures = results.filter((result) => result.broken);
const totalFailures = failures.length + operationFailures;
const normalDurations = results.filter((result) => !result.path.includes('?source=builtin')).map((result) => result.ms);
const builtinDurations = results.filter((result) => result.path.includes('?source=builtin')).map((result) => result.ms);
const p95 = percentile(durations, 0.95);
const normalP95 = percentile(normalDurations, 0.95);
const builtinP95 = percentile(builtinDurations, 0.95);
const mean = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
const score = p95 + totalFailures * 10_000;
for (const failure of failures.slice(0, 10)) console.error('FAILED', failure);
console.log(`METRIC load_score_ms=${score.toFixed(3)}`);
console.log(`METRIC p95_ms=${p95.toFixed(3)}`);
console.log(`METRIC mean_ms=${mean.toFixed(3)}`);
console.log(`METRIC normal_p95_ms=${normalP95.toFixed(3)}`);
console.log(`METRIC builtin_p95_ms=${builtinP95.toFixed(3)}`);
console.log(`METRIC failures=${totalFailures}`);
console.log(`METRIC operation_failures=${operationFailures}`);
console.log(`METRIC requests=${results.length}`);
