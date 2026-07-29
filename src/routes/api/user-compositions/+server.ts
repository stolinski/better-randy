import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { json, error, type RequestHandler } from '@sveltejs/kit';

import { PresetIngressSchema } from '$lib/platform/preset-ingress';
import { presetToWireFormat } from '$lib/platform/preset-pure';
import {
	formatPresetSemanticIssues,
	validatePresetSemantics
} from '$lib/platform/preset-validation';
import {
	assertUserCompositionMediaReady,
	inspectUserCompositionMedia
} from '$lib/platform/user-composition-media.server';
import type { UserCompositionMeta } from '$lib/platform/user-composition-store';

const USER_COMPOSITION_STORE_DIR = join(process.cwd(), 'user-compositions');

async function ensureUserCompositionStoreDirectory(): Promise<void> {
	await mkdir(USER_COMPOSITION_STORE_DIR, { recursive: true });
}

/** Disk format wrapping the Preset so metadata stays out of the Preset JSON. */
interface StoredUserComposition {
	meta: { forkedFrom: string | null; savedAt: string };
	preset: unknown;
}

function isStoredUserComposition(value: unknown): value is StoredUserComposition {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	const meta = v['meta'];
	return (
		typeof meta === 'object' &&
		meta !== null &&
		'forkedFrom' in meta &&
		'savedAt' in meta &&
		(meta.forkedFrom === null || typeof meta.forkedFrom === 'string') &&
		typeof meta.savedAt === 'string' &&
		typeof v['preset'] === 'object' &&
		v['preset'] !== null
	);
}

export const GET: RequestHandler = async () => {
	await ensureUserCompositionStoreDirectory();

	let entries: string[];
	try {
		entries = await readdir(USER_COMPOSITION_STORE_DIR);
	} catch {
		entries = [];
	}

	const userCompositionMetadata: UserCompositionMeta[] = [];

	for (const entry of entries) {
		if (!entry.endsWith('.json')) continue;
		const userCompositionSlug = entry.slice(0, -5);
		try {
			const raw = await readFile(join(USER_COMPOSITION_STORE_DIR, entry), 'utf-8');
			const storedUserComposition: unknown = JSON.parse(raw);
			if (!isStoredUserComposition(storedUserComposition)) continue;
			const result = PresetIngressSchema.safeParse(storedUserComposition.preset);
			if (!result.success) continue;
			if (validatePresetSemantics(result.data).length > 0) continue;
			const mediaInspection = await inspectUserCompositionMedia(result.data);
			userCompositionMetadata.push({
				slug: userCompositionSlug,
				name: result.data.name,
				forkedFrom: storedUserComposition.meta.forkedFrom,
				savedAt: storedUserComposition.meta.savedAt,
				media: result.data.state.media,
				mediaStatus: mediaInspection.status,
				...(mediaInspection.issues.length > 0 ? { mediaIssues: mediaInspection.issues } : {})
			});
		} catch {
			// skip unreadable entries
		}
	}

	userCompositionMetadata.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
	return json(userCompositionMetadata);
};

export const POST: RequestHandler = async ({ request }) => {
	await ensureUserCompositionStoreDirectory();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (typeof body !== 'object' || body === null || !('slug' in body) || !('preset' in body)) {
		error(400, 'Body must have { slug, preset }');
	}

	const { slug, preset, forkedFrom } = body as {
		slug: unknown;
		preset: unknown;
		forkedFrom?: unknown;
	};

	if (typeof slug !== 'string' || !/^[a-z0-9_-]+$/.test(slug)) {
		error(400, 'slug must be lowercase alphanumeric/hyphen/underscore');
	}

	const result = PresetIngressSchema.safeParse(preset);
	if (!result.success) {
		error(400, `Invalid preset: ${result.error.message}`);
	}
	const semanticIssues = validatePresetSemantics(result.data);
	if (semanticIssues.length > 0) {
		error(400, `Invalid preset:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}
	try {
		assertUserCompositionMediaReady(await inspectUserCompositionMedia(result.data));
	} catch (cause) {
		error(422, cause instanceof Error ? cause.message : 'Referenced media asset is unavailable');
	}

	const storedUserComposition: StoredUserComposition = {
		meta: {
			forkedFrom: typeof forkedFrom === 'string' ? forkedFrom : null,
			savedAt: new Date().toISOString()
		},
		// Store the wire format (body as text), not the transformed parse output,
		// so GET can re-parse it through PresetSchema without a type mismatch.
		preset: presetToWireFormat(result.data)
	};

	await writeFile(
		join(USER_COMPOSITION_STORE_DIR, `${slug}.json`),
		JSON.stringify(storedUserComposition, null, '\t'),
		'utf-8'
	);
	return json({ slug }, { status: 201 });
};
