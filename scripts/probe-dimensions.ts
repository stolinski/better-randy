import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function hasPngSignature(bytes: Uint8Array): boolean {
	if (bytes.length < PNG_SIGNATURE.length) return false;
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (bytes[i] !== PNG_SIGNATURE[i]) return false;
	}
	return true;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] << 24) |
		(bytes[offset + 1] << 16) |
		(bytes[offset + 2] << 8) |
		bytes[offset + 3]
	) >>> 0;
}

const [, , inputPath] = process.argv;

if (!inputPath) {
	console.error('usage: probe-dimensions.ts <path-to.png>');
	process.exit(2);
}

const absolutePath = resolve(process.cwd(), inputPath);
const bytes = await readFile(absolutePath);

if (!hasPngSignature(bytes)) {
	console.error(`not a PNG: ${absolutePath}`);
	process.exit(3);
}

// PNG layout after the 8-byte signature:
//   [4 bytes IHDR length] [4 bytes 'IHDR'] [4 bytes width] [4 bytes height] ...
// width starts at byte 16, height at byte 20.
const width = readUint32BigEndian(bytes, 16);
const height = readUint32BigEndian(bytes, 20);

console.log(JSON.stringify({ width, height }));
