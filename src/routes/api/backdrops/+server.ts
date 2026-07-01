import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { json, type RequestHandler } from '@sveltejs/kit';

// Reference stills live in static/ so Vite serves them at /backdrops/<file>.
// The folder is read per-request — dropping a still in makes it pickable
// without a rebuild or a hardcoded asset list.
const BACKDROPS_DIR = join(process.cwd(), 'static', 'backdrops');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

export const GET: RequestHandler = async () => {
	let entries: string[];
	try {
		entries = await readdir(BACKDROPS_DIR);
	} catch {
		entries = [];
	}

	const files = entries.filter((file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase())).sort();

	// Version each URL with the file's mtime so a still replaced (or re-dropped
	// mid-write) under the same name is refetched instead of served from the
	// browser's cache of the old bytes.
	const backdrops = await Promise.all(
		files.map(async (file) => {
			const { mtimeMs } = await stat(join(BACKDROPS_DIR, file));
			return {
				name: file.slice(0, file.length - extname(file).length),
				url: `/backdrops/${encodeURIComponent(file)}?v=${Math.round(mtimeMs)}`
			};
		})
	);

	return json(backdrops);
};
