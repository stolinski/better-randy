import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { json, error, type RequestHandler } from '@sveltejs/kit';

import { PresetSchema } from '$lib/platform/engine-schema';
import type { UserCompositionMeta } from '$lib/platform/persistence';
import { presetToWireFormat } from '$lib/platform/preset-pure';

const STORE_DIR = join(process.cwd(), 'user-compositions');

async function ensureStoreDir(): Promise<void> {
	await mkdir(STORE_DIR, { recursive: true });
}

/** Disk format wrapping the Preset so metadata stays out of the Preset JSON. */
interface StoredComposition {
	meta: { forkedFrom: string | null; savedAt: string };
	preset: unknown;
}

function isStoredComposition(value: unknown): value is StoredComposition {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v['meta'] === 'object' &&
		v['meta'] !== null &&
		typeof v['preset'] === 'object' &&
		v['preset'] !== null
	);
}

export const GET: RequestHandler = async () => {
	await ensureStoreDir();

	let entries: string[];
	try {
		entries = await readdir(STORE_DIR);
	} catch {
		entries = [];
	}

	const metas: UserCompositionMeta[] = [];

	for (const entry of entries) {
		if (!entry.endsWith('.json')) continue;
		const slug = entry.slice(0, -5);
		try {
			const raw = await readFile(join(STORE_DIR, entry), 'utf-8');
			const stored: unknown = JSON.parse(raw);
			if (!isStoredComposition(stored)) continue;
			const result = PresetSchema.safeParse(stored.preset);
			if (!result.success) continue;
			metas.push({
				slug,
				name: result.data.name,
				forkedFrom: stored.meta.forkedFrom,
				savedAt: stored.meta.savedAt
			});
		} catch {
			// skip unreadable entries
		}
	}

	metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
	return json(metas);
};

export const POST: RequestHandler = async ({ request }) => {
	await ensureStoreDir();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (typeof body !== 'object' || body === null || !('slug' in body) || !('preset' in body)) {
		error(400, 'Body must have { slug, preset }');
	}

	const { slug, preset, forkedFrom } = body as { slug: unknown; preset: unknown; forkedFrom?: unknown };

	if (typeof slug !== 'string' || !/^[a-z0-9_-]+$/.test(slug)) {
		error(400, 'slug must be lowercase alphanumeric/hyphen/underscore');
	}

	const result = PresetSchema.safeParse(preset);
	if (!result.success) {
		error(400, `Invalid preset: ${result.error.message}`);
	}

	const stored: StoredComposition = {
		meta: {
			forkedFrom: typeof forkedFrom === 'string' ? forkedFrom : null,
			savedAt: new Date().toISOString()
		},
		// Store the wire format (body as text), not the transformed parse output,
		// so GET can re-parse it through PresetSchema without a type mismatch.
		preset: presetToWireFormat(result.data)
	};

	await writeFile(join(STORE_DIR, `${slug}.json`), JSON.stringify(stored, null, '\t'), 'utf-8');
	return json({ slug }, { status: 201 });
};
