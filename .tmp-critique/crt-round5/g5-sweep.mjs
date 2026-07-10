// G5 avg-ink sweep — dilated ink-mask method (avg-ink-contrast.mjs) with
// region jitter, over the three small-text voices at three frames.
import { execFileSync } from 'node:child_process';

const B = '.tmp-baselines/show-open-in-focus-crt';
const SPECS = [
	['p0.35', 'SEASON-TWO', 430, 1074, 360, 42],
	['p0.35', 'EPISODE-07', 425, 1572, 350, 42],
	['p0.35', 'PREMIERES', 410, 1748, 870, 65],
	['p0.50', 'SEASON-TWO', 395, 1082, 415, 42],
	['p0.50', 'EPISODE-07', 385, 1580, 375, 45],
	['p0.50', 'PREMIERES', 380, 1770, 890, 62],
	['p0.75', 'SEASON-TWO', 335, 1080, 410, 48],
	['p0.75', 'EPISODE-07', 330, 1600, 380, 48],
	['p0.75', 'PREMIERES', 320, 1790, 915, 72]
];
const JITTER = [
	[0, 0],
	[8, 0],
	[-8, 0],
	[0, 6],
	[0, -6]
];

for (const [frame, name, x, y, w, h] of SPECS) {
	let worst = null;
	const ratios = [];
	for (const [dx, dy] of JITTER) {
		const out = execFileSync('node', [
			'.tmp-baselines/avg-ink-contrast.mjs',
			`${B}/${frame}.png`,
			String(x + dx),
			String(y + dy),
			String(w),
			String(h)
		]);
		const r = JSON.parse(out.toString());
		ratios.push(r.ratio);
		if (!worst || r.ratio < worst.ratio) worst = { ...r, dx, dy };
	}
	console.log(
		`${frame} ${name}: ratios=[${ratios.join(', ')}] worst=${worst.ratio} (dx=${worst.dx},dy=${worst.dy}) inkLum=${worst.avgInkRelLum} ground=${worst.groundRelLum} inkFrac=${worst.inkFrac}`
	);
}
