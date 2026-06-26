/**
 * Identity registry — pairs registered Pipelines with their Identity Specs
 * (per ADR-0015), gating Pack-resolved dimensions per ADR-0019.
 *
 * The validator below is called at engine boot via
 * `validateIdentityRegistry`. It refuses to start when:
 *   - any Pipeline\'s Identity Spec dimension is neither
 *     `implementation`-declared nor `viaPack`-declared
 *   - the active Pack manifest does not resolve a `viaPack` Role any
 *     registered Pipeline references
 *
 * The registry pairs Pipeline `type` strings (or annotation `style` strings)
 * with their Identity Spec. Keeping the pairing here, separate from the
 * Pipeline renderer modules themselves, avoids touching 23 `index.ts` files
 * just to add an import — each Pipeline\'s identity.ts can land
 * independently of its index.ts.
 */

import type { IdentitySpec } from './identity';
import { collectViaPackRoles } from './identity';
import type { PackManifest } from '$lib/platform/packs/types';

// Surfaces
import { newspaperIdentity } from '$lib/pipelines/surfaces/newspaper/identity';
import { paperIdentity } from '$lib/pipelines/surfaces/paper/identity';
import { plainIdentity } from '$lib/pipelines/surfaces/plain/identity';
import { chapterCardIdentity } from '$lib/pipelines/surfaces/chapter-card/identity';
import { pullquoteOnPhotoIdentity } from '$lib/pipelines/surfaces/pullquote-on-photo/identity';
import { titleSequenceIdentity } from '$lib/pipelines/surfaces/title-sequence/identity';
import { typeHeroIdentity } from '$lib/pipelines/surfaces/type-hero/identity';
import { webDocumentIdentity } from '$lib/pipelines/surfaces/web-document/identity';
import { imessageIdentity } from '$lib/pipelines/surfaces/imessage/identity';

// Blocks
import { paragraphIdentity } from '$lib/pipelines/blocks/paragraph/identity';

// Annotations
import { boxIdentity } from '$lib/pipelines/annotations/box/identity';
import { circleIdentity } from '$lib/pipelines/annotations/circle/identity';
import { highlightIdentity } from '$lib/pipelines/annotations/highlight/identity';
import { isolateIdentity } from '$lib/pipelines/annotations/isolate/identity';
import { liftOutIdentity } from '$lib/pipelines/annotations/lift-out/identity';
import { magnifyIdentity } from '$lib/pipelines/annotations/magnify/identity';
import { sideNoteIdentity } from '$lib/pipelines/annotations/side-note/identity';
import { strikeIdentity } from '$lib/pipelines/annotations/strike/identity';
import { tearOutIdentity } from '$lib/pipelines/annotations/tear-out/identity';
import { underlineIdentity } from '$lib/pipelines/annotations/underline/identity';

// Overlays
import { counterIdentity } from '$lib/pipelines/overlays/counter/identity';
import { cursorTrailIdentity } from '$lib/pipelines/overlays/cursor-trail/identity';
import { instanceStackIdentity } from '$lib/pipelines/overlays/instance-stack/identity';
import { lowerThirdIdentity } from '$lib/pipelines/overlays/lower-third/identity';
import { shaderFillIdentity } from '$lib/pipelines/overlays/shader-fill/identity';
import { text3dIdentity } from '$lib/pipelines/overlays/text-3d/identity';
import { washiTapeIdentity } from '$lib/pipelines/overlays/washi-tape/identity';
import { watermarkIdentity } from '$lib/pipelines/overlays/watermark/identity';

export const IDENTITY_REGISTRY: Readonly<Record<string, IdentitySpec>> = {
	// Surfaces
	'surface:newspaper': newspaperIdentity,
	'surface:paper': paperIdentity,
	'surface:plain': plainIdentity,
	'surface:chapter-card': chapterCardIdentity,
	'surface:pullquote-on-photo': pullquoteOnPhotoIdentity,
	'surface:title-sequence': titleSequenceIdentity,
	'surface:type-hero': typeHeroIdentity,
	'surface:web-document': webDocumentIdentity,
	'surface:imessage': imessageIdentity,

	// Blocks
	'block:paragraph': paragraphIdentity,

	// Annotations (keyed by style)
	'annotation:box': boxIdentity,
	'annotation:circle': circleIdentity,
	'annotation:highlight': highlightIdentity,
	'annotation:isolate': isolateIdentity,
	'annotation:lift-out': liftOutIdentity,
	'annotation:magnify': magnifyIdentity,
	'annotation:side-note': sideNoteIdentity,
	'annotation:strike': strikeIdentity,
	'annotation:tear-out': tearOutIdentity,
	'annotation:underline': underlineIdentity,

	// Overlays
	'overlay:counter': counterIdentity,
	'overlay:cursor-trail': cursorTrailIdentity,
	'overlay:instance-stack': instanceStackIdentity,
	'overlay:lower-third': lowerThirdIdentity,
	'overlay:text-3d': text3dIdentity,
	'overlay:shader-fill': shaderFillIdentity,
	'overlay:washi-tape': washiTapeIdentity,
	'overlay:watermark': watermarkIdentity
};

export interface IdentityValidationError {
	pipeline: string;
	kind: 'unimplemented-dimension' | 'both-impl-and-via-pack' | 'missing-pack-role';
	dimension?: string;
	role?: string;
	message: string;
}

/**
 * Validate every registered Identity Spec against the active Pack manifest.
 * Returns the list of errors; empty list means valid. The engine boot path
 * should refuse to start if this returns a non-empty list.
 *
 * Per ADR-0019, a dimension must declare exactly one of `implementation` or
 * `viaPack`. The shared type already enforces this at the type level
 * (`& ({ implementation; viaPack?: never } | { implementation?: never;
 * viaPack })`); the runtime check catches dimensions that bypassed the type
 * via `as` casts.
 */
export function validateIdentityRegistry(
	manifest: PackManifest
): readonly IdentityValidationError[] {
	const errors: IdentityValidationError[] = [];

	for (const [pipelineKey, spec] of Object.entries(IDENTITY_REGISTRY)) {
		for (const dim of spec.dimensions) {
			const hasImpl = dim.implementation !== undefined;
			const hasViaPack = dim.viaPack !== undefined;

			if (!hasImpl && !hasViaPack) {
				errors.push({
					pipeline: pipelineKey,
					kind: 'unimplemented-dimension',
					dimension: dim.name,
					message: `Pipeline ${pipelineKey} dimension "${dim.name}" declares neither implementation nor viaPack.`
				});
				continue;
			}

			if (hasImpl && hasViaPack) {
				errors.push({
					pipeline: pipelineKey,
					kind: 'both-impl-and-via-pack',
					dimension: dim.name,
					message: `Pipeline ${pipelineKey} dimension "${dim.name}" declares both implementation and viaPack; exactly one is allowed.`
				});
			}
		}

		for (const role of collectViaPackRoles(spec)) {
			if (!(role in manifest.roles)) {
				errors.push({
					pipeline: pipelineKey,
					kind: 'missing-pack-role',
					role,
					message: `Pack "${manifest.slug}" does not resolve Role "${role}" referenced by ${pipelineKey}.`
				});
			}
		}
	}

	return errors;
}

/**
 * Assert that the identity registry validates against the active Pack.
 * Throws a single aggregated error if validation fails. Called at engine
 * boot.
 */
export function assertIdentityRegistryValid(manifest: PackManifest): void {
	const errors = validateIdentityRegistry(manifest);
	if (errors.length === 0) {
		return;
	}
	const summary = errors.map((e) => `  - ${e.message}`).join('\n');
	throw new Error(
		`Identity registry validation failed against Pack "${manifest.slug}" (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${summary}`
	);
}
