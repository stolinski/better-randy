import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { json, error, type RequestHandler } from '@sveltejs/kit';

import {
	addUserCompositionFileToIndex,
	removeUserCompositionFileFromIndex
} from '$lib/platform/user-composition-file-index.server';
import { writeUserCompositionFileAtomically } from '$lib/platform/user-composition-file-write.server';
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

const USER_COMPOSITION_STORE_DIR = join(process.cwd(), 'user-compositions');

/**
 * Disk format wrapping the serialized preset so metadata stays out of the
 * Preset JSON. `preset` holds the WIRE format (e.g. `surface.content.body` as a
 * text string), not the parsed runtime Preset — `PresetSchema` is a transform
 * schema (string → AnnotationBody), so the disk must store its INPUT shape for
 * GET to re-parse it. Hence `unknown`, written via `presetToWireFormat`.
 */
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

function userCompositionPathForSlug(slug: string): string {
	return join(USER_COMPOSITION_STORE_DIR, `${slug}.json`);
}

export const GET: RequestHandler = async ({ params }) => {
	const { slug } = params;
	if (!slug) error(400, 'Missing slug');

	// "No fork of this slug" is a normal answer, not an error — return 200 null
	// so clients can tell absence apart from a real failure. Only ENOENT means
	// absent; any other read failure must surface as a 500.
	let raw: string;
	try {
		raw = await readFile(userCompositionPathForSlug(slug), 'utf-8');
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') {
			return json(null);
		}
		error(500, `Failed to read user composition "${slug}"`);
	}

	const storedUserComposition: unknown = JSON.parse(raw);
	if (!isStoredUserComposition(storedUserComposition)) {
		error(500, 'Corrupt user composition file');
	}

	const result = PresetIngressSchema.safeParse(storedUserComposition.preset);
	if (!result.success) error(500, `Corrupt preset data: ${result.error.message}`);
	const semanticIssues = validatePresetSemantics(result.data);
	if (semanticIssues.length > 0) {
		error(500, `Corrupt preset data:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}
	// The API is an interchange boundary: GET returns the same standalone wire
	// Stored compositions remain readable when immutable media goes missing so
	// the GUI can surface the decoder error and let the author replace or remove
	// a referenced asset. New writes below still reject unavailable media.
	return json(presetToWireFormat(result.data));
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

	const result = PresetIngressSchema.safeParse(body);
	if (!result.success) error(400, `Invalid preset: ${result.error.message}`);
	const semanticIssues = validatePresetSemantics(result.data);
	if (semanticIssues.length > 0) {
		error(400, `Invalid preset:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}
	try {
		assertUserCompositionMediaReady(await inspectUserCompositionMedia(result.data));
	} catch (cause) {
		error(422, cause instanceof Error ? cause.message : 'Referenced media asset is unavailable');
	}

	// Preserve existing meta (forkedFrom) when updating.
	let existingMeta: StoredUserComposition['meta'] = {
		forkedFrom: null,
		savedAt: new Date().toISOString()
	};
	try {
		const raw = await readFile(userCompositionPathForSlug(slug), 'utf-8');
		const storedUserComposition: unknown = JSON.parse(raw);
		if (isStoredUserComposition(storedUserComposition)) {
			existingMeta = { ...storedUserComposition.meta };
		}
	} catch {
		// new file — use default meta
	}

	const storedUserComposition: StoredUserComposition = {
		meta: { ...existingMeta, savedAt: new Date().toISOString() },
		// Store the wire format (body as text), not the transformed parse output,
		// so GET can re-parse it through PresetSchema without a type mismatch.
		preset: presetToWireFormat(result.data)
	};

	await writeUserCompositionFileAtomically(
		userCompositionPathForSlug(slug),
		JSON.stringify(storedUserComposition, null, '\t')
	);
	await addUserCompositionFileToIndex(slug);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { slug } = params;
	if (!slug) error(400, 'Missing slug');

	try {
		await unlink(userCompositionPathForSlug(slug));
	} catch {
		error(404, `User composition "${slug}" not found`);
	}
	await removeUserCompositionFileFromIndex(slug);

	return new Response(null, { status: 204 });
};
