import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Server-side poster store: rendered stills of each composition's settled
 * frame, keyed by content hash (see ./posters for the client side). Blobs live
 * in a gitignored cache dir — regenerable, never committed.
 */
export const POSTER_STORE_DIR = join(process.cwd(), '.posters');

export function posterPathForKey(key: string): string {
	return join(POSTER_STORE_DIR, `${key}.webp`);
}

/**
 * Content keys of every poster the store currently holds. The homepage load
 * hands this to the listing so cards KNOW which posters exist instead of
 * discovering absence through per-card 404s (console noise on every
 * not-yet-captured composition). Empty before the first capture-on-view.
 */
export async function listPosterKeys(): Promise<string[]> {
	try {
		const files = await readdir(POSTER_STORE_DIR);
		return files
			.filter((file) => file.endsWith('.webp'))
			.map((file) => file.slice(0, -'.webp'.length));
	} catch {
		return [];
	}
}
