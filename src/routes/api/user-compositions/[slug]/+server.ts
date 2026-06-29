import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { json, error, type RequestHandler } from '@sveltejs/kit';

import { PresetSchema, type Preset } from '$lib/platform/engine-schema';

const STORE_DIR = join(process.cwd(), 'user-compositions');

/** Disk format wrapping the Preset so metadata stays out of the Preset JSON. */
interface StoredComposition {
	meta: { forkedFrom: string | null; savedAt: string };
	preset: Preset;
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

function slugPath(slug: string): string {
	return join(STORE_DIR, `${slug}.json`);
}

export const GET: RequestHandler = async ({ params }) => {
	const { slug } = params;
	if (!slug) error(400, 'Missing slug');

	let raw: string;
	try {
		raw = await readFile(slugPath(slug), 'utf-8');
	} catch {
		error(404, `User composition "${slug}" not found`);
	}

	const stored: unknown = JSON.parse(raw);
	if (!isStoredComposition(stored)) error(500, 'Corrupt user composition file');

	const result = PresetSchema.safeParse(stored.preset);
	if (!result.success) error(500, `Corrupt preset data: ${result.error.message}`);

	return json(result.data);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const { slug } = params;
	if (!slug) error(400, 'Missing slug');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const result = PresetSchema.safeParse(body);
	if (!result.success) error(400, `Invalid preset: ${result.error.message}`);

	// Preserve existing meta (forkedFrom) when updating.
	let existingMeta: StoredComposition['meta'] = { forkedFrom: null, savedAt: new Date().toISOString() };
	try {
		const raw = await readFile(slugPath(slug), 'utf-8');
		const stored: unknown = JSON.parse(raw);
		if (isStoredComposition(stored)) existingMeta = { ...stored.meta };
	} catch {
		// new file — use default meta
	}

	const stored: StoredComposition = {
		meta: { ...existingMeta, savedAt: new Date().toISOString() },
		preset: result.data
	};

	await writeFile(slugPath(slug), JSON.stringify(stored, null, '\t'), 'utf-8');
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { slug } = params;
	if (!slug) error(400, 'Missing slug');

	try {
		await unlink(slugPath(slug));
	} catch {
		error(404, `User composition "${slug}" not found`);
	}

	return new Response(null, { status: 204 });
};
