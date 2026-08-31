// Pack-matrix render sweep (ADR-0039 §6, dex hpc3lrk0) — the affirmative
// pack-neutral gate: "every listed preset must LOOK GOOD under every catalog
// pack — verified by a pack-matrix render sweep (every deliverable × every
// pack, judged at human scale), not just the pixel-diff lock."
//
// This harness produces the evidence for that human judgment: it drives the
// flag-enabled Chrome on CDP port 9223 through scripts/cdp-capture.mjs once
// per (deliverable × catalog pack), capturing the native-resolution frame at
// mid-piece, then assembles a contact-sheet HTML (one row per preset, one
// column per pack, cells downscaled for at-a-glance judging, each linking its
// native capture). Judging is Scott's, live — the sweep is machine evidence
// collection, not a verdict (the meaningfulness gate stays the Calibration
// Trio; docs/packs/authoring-playbook.md §5).
//
// Output lands in .tmp-critique/pack-matrix/ (NOT committed — ~170 native 4K
// captures; the committed artifacts are this script and the run's summary
// verdicts wherever the judging session records them):
//   .tmp-critique/pack-matrix/<slug>/<pack>/p0.50.png   native capture
//   .tmp-critique/pack-matrix/cells/<slug>--<pack>.png  960-wide cell
//   .tmp-critique/pack-matrix/index.html                the contact sheet
//   .tmp-critique/pack-matrix/summary.json              capture status map
//
// Usage:
//   node scripts/pack-matrix-sweep.mjs                 # all deliverables
//   node scripts/pack-matrix-sweep.mjs quote-magnify   # one slug
//   RESWEEP=1 node scripts/pack-matrix-sweep.mjs       # ignore existing captures
//
// The sweep is resumable: a (slug × pack) whose native capture already exists
// is skipped, so a killed run continues where it stopped. Set RESWEEP=1 after
// pipeline/pack changes to force full re-capture.
//
// Requires the 9223 harness (scripts/launch-cdp-chrome.sh) and the dev server.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const presetsDir = resolve(repoRoot, 'src/lib/presets');
const outRoot = resolve(repoRoot, '.tmp-critique/pack-matrix');
const cellsDir = resolve(outRoot, 'cells');
const CATALOG_PACKS = ['syntax', 'editorial-mono', 'crt-terminal', 'clean-light'];
const CELL_WIDTH = 960;

const onlySlug = process.argv[2] ?? null;

const deliverables = readdirSync(presetsDir)
	.filter((file) => file.endsWith('.json'))
	.map((file) => {
		const preset = JSON.parse(readFileSync(resolve(presetsDir, file), 'utf8'));
		return { slug: file.replace(/\.json$/, ''), kind: preset.kind ?? 'deliverable' };
	})
	.filter((entry) => entry.kind !== 'fixture')
	.filter((entry) => onlySlug === null || entry.slug === onlySlug);

if (deliverables.length === 0) {
	console.error(onlySlug ? `No deliverable named "${onlySlug}".` : 'No deliverables found.');
	process.exit(2);
}

mkdirSync(cellsDir, { recursive: true });

/** Box-average downscale to CELL_WIDTH, preserving aspect. */
function writeCell(nativePath, cellPath) {
	const src = PNG.sync.read(readFileSync(nativePath));
	const scale = src.width / CELL_WIDTH;
	const outW = CELL_WIDTH;
	const outH = Math.round(src.height / scale);
	const out = new PNG({ width: outW, height: outH });
	const box = Math.max(1, Math.floor(scale));
	for (let y = 0; y < outH; y++) {
		for (let x = 0; x < outW; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let n = 0;
			const sx0 = Math.min(src.width - 1, Math.floor(x * scale));
			const sy0 = Math.min(src.height - 1, Math.floor(y * scale));
			for (let dy = 0; dy < box; dy++) {
				for (let dx = 0; dx < box; dx++) {
					const sx = Math.min(src.width - 1, sx0 + dx);
					const sy = Math.min(src.height - 1, sy0 + dy);
					const si = (sy * src.width + sx) * 4;
					r += src.data[si];
					g += src.data[si + 1];
					b += src.data[si + 2];
					a += src.data[si + 3];
					n++;
				}
			}
			const di = (y * outW + x) * 4;
			out.data[di] = r / n;
			out.data[di + 1] = g / n;
			out.data[di + 2] = b / n;
			out.data[di + 3] = a / n;
		}
	}
	writeFileSync(cellPath, PNG.sync.write(out));
}

const summary = { generatedAt: new Date().toISOString(), packs: CATALOG_PACKS, rows: {} };

for (const [index, { slug }] of deliverables.entries()) {
	summary.rows[slug] = {};
	for (const pack of CATALOG_PACKS) {
		const outDir = resolve(outRoot, slug, pack);
		const label = `${slug} × ${pack}`;
		process.stdout.write(`[${index + 1}/${deliverables.length}] ${label.padEnd(56)}`);
		const existingNative = resolve(outDir, 'p0.50.png');
		const cellPath = resolve(cellsDir, `${slug}--${pack}.png`);
		if (process.env.RESWEEP !== '1' && existsSync(existingNative)) {
			if (!existsSync(cellPath)) writeCell(existingNative, cellPath);
			summary.rows[slug][pack] = 'OK';
			console.log('OK (kept)');
			continue;
		}
		const capture = spawnSync('node', [resolve(here, 'cdp-capture.mjs'), slug], {
			cwd: repoRoot,
			env: {
				...process.env,
				CDP_PACK: pack,
				CDP_SAMPLES: '0.5',
				CDP_OUTDIR: outDir
			},
			encoding: 'utf8',
			timeout: 180_000
		});
		const nativePath = resolve(outDir, 'p0.50.png');
		let status;
		if (capture.status === 0) {
			try {
				writeCell(nativePath, resolve(cellsDir, `${slug}--${pack}.png`));
				status = 'OK';
			} catch (error) {
				status = `FAIL cell: ${error instanceof Error ? error.message : String(error)}`;
			}
		} else {
			const tail = (capture.stdout ?? '').trim().split('\n').at(-1) ?? '';
			status = `FAIL capture: ${tail || capture.stderr?.trim().split('\n').at(-1) || 'unknown'}`;
		}
		summary.rows[slug][pack] = status;
		console.log(status);
	}
}

const rowsHtml = Object.entries(summary.rows)
	.map(([slug, packs]) => {
		const cells = CATALOG_PACKS.map((pack) => {
			if (packs[pack] !== 'OK') {
				return `<td class="miss">${packs[pack]}</td>`;
			}
			return `<td><a href="${slug}/${pack}/p0.50.png"><img loading="lazy" src="cells/${slug}--${pack}.png" alt="${slug} under ${pack}"></a></td>`;
		}).join('');
		return `<tr><th>${slug}</th>${cells}</tr>`;
	})
	.join('\n');

writeFileSync(
	resolve(outRoot, 'index.html'),
	`<!doctype html>
<meta charset="utf-8">
<title>Pack-matrix sweep — every deliverable × every pack</title>
<style>
	body { background: #141414; color: #ddd; font: 13px/1.4 ui-monospace, monospace; margin: 24px; }
	table { border-collapse: collapse; }
	th { text-align: left; padding: 6px 10px; font-weight: 500; position: sticky; left: 0; background: #141414; }
	thead th { position: sticky; top: 0; z-index: 2; }
	td { padding: 4px; vertical-align: top; }
	td.miss { color: #f0453d; max-width: 240px; }
	img { display: block; width: 420px; height: auto; background: repeating-conic-gradient(#2a2a2a 0 25%, #222 0 50%) 0 0 / 16px 16px; }
</style>
<p>ADR-0039 §6 pack-matrix sweep — ${Object.keys(summary.rows).length} deliverables × ${CATALOG_PACKS.length} packs, mid-piece frame, native captures behind each cell. Judged live at human scale; this sheet is evidence, not a verdict.</p>
<table>
<thead><tr><th></th>${CATALOG_PACKS.map((pack) => `<th>${pack}</th>`).join('')}</tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>
`
);
writeFileSync(resolve(outRoot, 'summary.json'), `${JSON.stringify(summary, null, '\t')}\n`);

const failed = Object.values(summary.rows)
	.flatMap((packs) => Object.values(packs))
	.filter((status) => status !== 'OK').length;
console.log(
	`\nSweep complete — ${Object.keys(summary.rows).length} deliverables × ${CATALOG_PACKS.length} packs, ${failed} failed capture(s).`
);
console.log(`Contact sheet: ${resolve(outRoot, 'index.html')}`);
process.exit(failed > 0 ? 1 : 0);
