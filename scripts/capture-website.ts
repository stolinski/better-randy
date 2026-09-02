import {
	captureWebsite,
	captureWebsiteToFile
} from '../src/lib/platform/website-capture.server.ts';

// Author a website capture.
//   node --experimental-strip-types scripts/capture-website.ts <url>
//     → into the local user-asset store (what the GUI does); prints the result JSON.
//   node --experimental-strip-types scripts/capture-website.ts <url> --out <path> [--scale 2] [--height 2560]
//     → into a file for the bundled capture registry (src/lib/platform/capture-assets.ts,
//       ADR-0057): a 1440 CSS px wide viewport, `--height` CSS px tall, at `--scale`
//       device pixels per CSS px. Register the slug, size, source, and date by hand.
const [url, ...rest] = process.argv.slice(2);
if (!url) {
	throw new TypeError(
		'Usage: node --experimental-strip-types scripts/capture-website.ts <url> [--out <path>] [--scale <n>] [--height <css px>]'
	);
}

function option(name: string): string | undefined {
	const index = rest.indexOf(name);
	return index >= 0 ? rest[index + 1] : undefined;
}

function numericOption(name: string): number | undefined {
	const value = option(name);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new TypeError(`${name} expects a positive number, received "${value}"`);
	}
	return parsed;
}

const outputPath = option('--out');
const result = outputPath
	? await captureWebsiteToFile(url, outputPath, {
			deviceScaleFactor: numericOption('--scale'),
			viewportHeight: numericOption('--height')
		})
	: await captureWebsite(url);
process.stdout.write(`${JSON.stringify(result)}\n`);
