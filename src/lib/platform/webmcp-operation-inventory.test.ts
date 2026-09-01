import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_FORBIDDEN_TOOL_NAME_FRAGMENTS,
	WEBMCP_OPERATION_ERROR_CODES,
	WEBMCP_OPERATION_FAMILIES,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH,
	WEBMCP_TOOL_NAME_MAX_LENGTH,
	WEBMCP_TOOL_NAME_PATTERN
} from './webmcp-operation-inventory.ts';

import type {
	WebmcpOperationFamilyName,
	WebmcpOperationPrecondition
} from './webmcp-operation-inventory.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const familiesByName = new Map<
	WebmcpOperationFamilyName,
	(typeof WEBMCP_OPERATION_FAMILIES)[number]
>(WEBMCP_OPERATION_FAMILIES.map((family) => [family.name, family]));

describe('WebMCP operation families', () => {
	it('declares each family once with a matching tool-name prefix', () => {
		const names = WEBMCP_OPERATION_FAMILIES.map((family) => family.name);
		expect(new Set(names).size).toBe(names.length);
		for (const family of WEBMCP_OPERATION_FAMILIES) {
			expect(family.toolNamePrefix).toBe(`gfx_${family.name}_`);
			expect(family.domain.length).toBeGreaterThan(0);
		}
	});

	it('never lets two families own the same composition pointer', () => {
		const owners = new Map<string, WebmcpOperationFamilyName>();
		for (const family of WEBMCP_OPERATION_FAMILIES) {
			for (const owned of family.ownedPaths) {
				const existing = owners.get(owned.pointer);
				expect(
					existing,
					`${owned.pointer} is claimed by both ${existing} and ${family.name}`
				).toBeUndefined();
				owners.set(owned.pointer, family.name);
			}
		}
	});

	it('leaves no owned pointer without an operation that writes it', () => {
		const written = new Set(WEBMCP_OPERATION_INVENTORY.flatMap((row) => row.writes));
		for (const family of WEBMCP_OPERATION_FAMILIES) {
			for (const owned of family.ownedPaths) {
				expect(
					written.has(owned.pointer),
					`${family.name} claims ${owned.pointer} but no operation writes it`
				).toBe(true);
			}
		}
	});

	it('gives a family with no owned pointers only non-writing operations', () => {
		for (const family of WEBMCP_OPERATION_FAMILIES.filter(
			(entry) => entry.ownedPaths.length === 0
		)) {
			const writers = WEBMCP_OPERATION_INVENTORY.filter(
				(row) => row.family === family.name && row.effect === 'write'
			);
			expect(
				writers.map((row) => row.id),
				`${family.name} owns nothing but writes`
			).toEqual([]);
		}
	});

	it('gives every family at least one operation', () => {
		for (const family of WEBMCP_OPERATION_FAMILIES) {
			const rows = WEBMCP_OPERATION_INVENTORY.filter((row) => row.family === family.name);
			expect(rows.length, `${family.name} has no operations`).toBeGreaterThan(0);
		}
	});
});

describe('WebMCP operation inventory', () => {
	it('keeps operation ids and tool names unique and within budget', () => {
		const ids = WEBMCP_OPERATION_INVENTORY.map((row) => row.id);
		const toolNames = WEBMCP_OPERATION_INVENTORY.map((row) => row.toolName);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(toolNames).size).toBe(toolNames.length);

		for (const row of WEBMCP_OPERATION_INVENTORY) {
			expect(row.toolName).toMatch(WEBMCP_TOOL_NAME_PATTERN);
			expect(row.toolName.length).toBeLessThanOrEqual(WEBMCP_TOOL_NAME_MAX_LENGTH);
			expect(row.summary.length).toBeLessThanOrEqual(WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH);
			expect(row.summary.endsWith('.')).toBe(true);
		}
	});

	it('names each tool for its family and its operation id', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY) {
			const family = familiesByName.get(row.family);
			expect(family, `${row.id} names an unknown family`).toBeDefined();
			expect(row.toolName.startsWith(family?.toolNamePrefix ?? '')).toBe(true);
			expect(row.id.startsWith(`${row.family}.`)).toBe(true);
		}
	});

	it('rejects UI actuation and raw patching verbs in tool names', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY) {
			for (const fragment of WEBMCP_FORBIDDEN_TOOL_NAME_FRAGMENTS) {
				expect(
					row.toolName.includes(fragment),
					`${row.toolName} contains the forbidden fragment ${fragment}`
				).toBe(false);
			}
		}
	});

	it('writes only pointers its own family owns', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY) {
			const owned = new Set(
				(familiesByName.get(row.family)?.ownedPaths ?? []).map((path) => path.pointer)
			);
			for (const pointer of row.writes) {
				expect(
					owned.has(pointer),
					`${row.id} writes ${pointer}, which ${row.family} does not own`
				).toBe(true);
			}
		}
	});

	it('holds every write to the transaction contract', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY.filter((entry) => entry.effect === 'write')) {
			expect(row.writes.length, `${row.id} writes nothing`).toBeGreaterThan(0);
			expect(row.requiresExpectedRevision, `${row.id} skips the revision check`).toBe(true);
			expect(row.undoable, `${row.id} is not undoable`).toBe(true);
			expect(row.focus.length, `${row.id} moves no visible focus`).toBeGreaterThan(0);
		}
	});

	it('keeps every non-write kind out of the composition body', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY.filter((entry) => entry.effect !== 'write')) {
			expect(row.writes, `${row.id} writes composition pointers`).toEqual([]);
			expect(row.undoable, `${row.id} claims an undo entry`).toBe(false);
		}
	});

	it('leaves read operations free of revision checks and focus moves', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY.filter((entry) => entry.effect === 'read')) {
			expect(row.requiresExpectedRevision, `${row.id} demands a revision`).toBe(false);
			expect(row.focus, `${row.id} moves focus`).toEqual([]);
		}
	});

	it('requires the observed revision before destroying or delivering work', () => {
		for (const id of [
			'composition.revert-to-starter',
			'session.delete-composition',
			'composition.undo',
			'composition.redo',
			'delivery.export-video'
		]) {
			const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === id);
			expect(row?.requiresExpectedRevision, `${id} skips the revision check`).toBe(true);
		}
	});

	it('makes every long-running operation cancellable', () => {
		for (const id of [
			'verification.render-frame',
			'verification.inspect-readable-text',
			'delivery.export-video',
			'media.add-library-entry'
		]) {
			const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === id);
			expect(row?.cancellable, `${id} cannot be cancelled`).toBe(true);
		}
	});

	it('keeps the cold-page tool list short', () => {
		const always = WEBMCP_OPERATION_INVENTORY.filter((row) => row.precondition === 'always');
		expect(always.length).toBeLessThanOrEqual(WEBMCP_ALWAYS_REGISTERED_CEILING);
	});

	it('uses every declared precondition at least once', () => {
		const used = new Set<WebmcpOperationPrecondition>(
			WEBMCP_OPERATION_INVENTORY.map((row) => row.precondition)
		);
		const declared: readonly WebmcpOperationPrecondition[] = [
			'always',
			'composition-open',
			'composition-editable',
			'forked-from-starter',
			'session-composition-present',
			'user-pack-store-served',
			'user-pack-present',
			'undo-available',
			'redo-available',
			'overlay-present',
			'effect-present',
			'mark-present',
			'text-animation-present',
			'diagram-present',
			'chart-present',
			'captions-present',
			'chat-surface-active',
			'checklist-surface-active',
			'orientation-override-present',
			'keyframe-channel-present',
			'cascade-anchor-present',
			'transition-present',
			'audio-cue-present',
			'media-permitted',
			'media-entry-present',
			'video-clip-present'
		];
		for (const precondition of declared) {
			expect(used.has(precondition), `${precondition} is declared but unused`).toBe(true);
		}
	});

	it('keeps the internal-only disposition to rendered verification', () => {
		const internal = WEBMCP_OPERATION_INVENTORY.filter((row) => row.exposure === 'internal-only');
		expect(internal.map((row) => row.id)).toEqual([
			'verification.render-frame',
			'verification.inspect-readable-text'
		]);
		// An unexposed row is still a decision a person can make, so it still names
		// its GUI surface — the disposition narrows the transport, not the parity.
		for (const row of internal) {
			expect(row.guiSurface.length, `${row.id} names no GUI surface`).toBeGreaterThan(0);
		}
	});

	it('anchors every row to a GUI surface that exists', () => {
		for (const row of WEBMCP_OPERATION_INVENTORY) {
			expect(
				existsSync(resolve(repoRoot, row.guiSurface)),
				`${row.id} names a missing GUI surface: ${row.guiSurface}`
			).toBe(true);
		}
	});

	it('covers the full create-to-export arc', () => {
		const ids = new Set(WEBMCP_OPERATION_INVENTORY.map((row) => row.id));
		for (const id of [
			'capability.inspect-vocabulary',
			'composition.create-blank',
			'composition.create-from-starter',
			'composition.inspect',
			'layer.set-surface',
			'content.set-surface-content',
			'placement.set-overlay-placement',
			'appearance.set-pack',
			'motion.set-keyframe-channel',
			'sound.set-cue',
			'playhead.seek-frame',
			'validation.inspect-findings',
			'verification.render-frame',
			'delivery.export-video'
		]) {
			expect(ids.has(id), `the inventory is missing ${id}`).toBe(true);
		}
	});
});

describe('WebMCP error codes', () => {
	it('keeps the corrective code list unique and snake case', () => {
		expect(new Set(WEBMCP_OPERATION_ERROR_CODES).size).toBe(WEBMCP_OPERATION_ERROR_CODES.length);
		for (const code of WEBMCP_OPERATION_ERROR_CODES) {
			expect(code).toMatch(/^[a-z][a-z_]*$/);
		}
	});
});
