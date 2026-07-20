import { captureWebsite } from '../src/lib/platform/website-capture.server.ts';

const url = process.argv[2];
if (!url) {
	throw new TypeError('Usage: node --experimental-strip-types scripts/capture-website.ts <url>');
}

const result = await captureWebsite(url);
process.stdout.write(`${JSON.stringify(result)}\n`);
