import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { applyPreset } from './preset';
import { COMPOSITION_ORIENTATIONS } from './composition-transport-operations';
import { compositionEditHistory } from './composition-edit-history';
import { compositionMeta } from './composition-meta.svelte';
import { engineState, transitionState } from './engine-state.svelte';
import { listWebmcpToolDefinitions } from './webmcp-tool-definitions';
import { parsePresetIngress } from './preset-ingress';
import { readWebmcpCompositionPreconditions } from './webmcp-tool-preconditions';
import { userCompositionStore } from './user-composition-store';
import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_OPERATION_INVENTORY
} from './webmcp-operation-inventory';
import { WEBMCP_INTERNAL_ONLY_FAMILIES, WebmcpToolController } from './webmcp-tool-controller';

import type { UserCompositionMeta } from './user-composition-store';
import type {
	WebmcpModelContextHost,
	WebmcpToolCallResult,
	WebmcpToolDescriptor
} from './webmcp-tool-controller';
import type { WebmcpOperationFamilyName, WebmcpOperationRow } from './webmcp-operation-inventory';

vi.mock('./user-composition-store', () => ({
	userCompositionStore: {
		listUserCompositions: vi.fn(),
		loadUserComposition: vi.fn(),
		forkUserComposition: vi.fn(),
		saveUserComposition: vi.fn(),
		deleteUserComposition: vi.fn()
	}
}));

const sessionStore = vi.mocked(userCompositionStore);

/** The families this exposure leaf ships. Later leaves add their own. */
const EXPOSED_FAMILIES: readonly WebmcpOperationFamilyName[] = [
	'capability',
	'composition',
	'session',
	'transport'
];

/**
 * Every module that turns an agent's call into an operation call. None of them
 * may reach past the operation layer into engine state.
 */
const WEBMCP_FAMILY_TOOL_MODULES = [
	'src/lib/platform/webmcp-capability-tools.ts',
	'src/lib/platform/webmcp-composition-tools.ts',
	'src/lib/platform/webmcp-session-tools.ts',
	'src/lib/platform/webmcp-transport-tools.ts'
];

/** What a tool module reaching past the operation layer would have to name. */
const FORBIDDEN_TOOL_LAYER_REACHES = [
	'engine-state.svelte',
	'preset-base.svelte',
	'composition-workspace-focus',
	'runCompositionEditTransaction'
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

class FakeModelContext implements WebmcpModelContextHost {
	readonly #tools = new Map<string, WebmcpToolDescriptor>();

	registerTool(descriptor: WebmcpToolDescriptor): void {
		this.#tools.set(descriptor.name, descriptor);
		descriptor.signal.addEventListener('abort', () => this.#tools.delete(descriptor.name), {
			once: true
		});
	}

	getTools(): Iterable<{ name: string }> {
		return [...this.#tools.values()].map((descriptor) => ({ name: descriptor.name }));
	}

	call(name: string, args: unknown): Promise<WebmcpToolCallResult> {
		const descriptor = this.#tools.get(name);
		if (!descriptor) throw new Error(`No registered tool named ${name}`);
		return descriptor.execute(args);
	}
}

function rowFor(operationId: string): WebmcpOperationRow {
	const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === operationId);
	if (!row) throw new Error(`The inventory declares no ${operationId}`);
	return row;
}

function exposedRows(): readonly WebmcpOperationRow[] {
	return listWebmcpToolDefinitions().map((definition) => rowFor(definition.operationId));
}

function toolNamesRegisteredFor(precondition: WebmcpOperationRow['precondition']): string[] {
	return exposedRows()
		.filter((row) => row.precondition === precondition)
		.map((row) => row.toolName)
		.sort();
}

function startController(host: WebmcpModelContextHost): WebmcpToolController {
	return new WebmcpToolController({
		host,
		definitions: listWebmcpToolDefinitions(),
		lifetime: new AbortController().signal
	});
}

function readPayload(result: WebmcpToolCallResult): Record<string, unknown> {
	return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

const sessionEntry: UserCompositionMeta = {
	slug: 'untitled',
	name: 'Untitled',
	forkedFrom: null,
	savedAt: '2026-08-29T12:00:00.000Z',
	posterKey: null,
	durationSeconds: 6,
	surfaceType: 'plain',
	media: { assets: [], videoTrack: { clips: [] } },
	mediaStatus: 'ready'
};

beforeEach(() => {
	vi.clearAllMocks();
	sessionStore.listUserCompositions.mockResolvedValue([]);
	transitionState.capturing = false;
	applyPreset(parsePresetIngress(blankPresetJson));
	compositionMeta.isUserComposition = false;
	compositionMeta.userCompositionSlug = null;
	compositionMeta.forkedFrom = null;
});

describe('WebMCP tool definitions', () => {
	it('exposes the composition, session, transport, and capability families', () => {
		const families = new Set(exposedRows().map((row) => row.family));
		expect([...families].sort()).toEqual([...EXPOSED_FAMILIES].sort());
	});

	it('exposes every row of a family it exposes at all, exactly once', () => {
		const definitions = listWebmcpToolDefinitions();
		const exposedIds = definitions.map((definition) => definition.operationId);
		expect(new Set(exposedIds).size, 'a row is exposed twice').toBe(exposedIds.length);

		const declared = WEBMCP_OPERATION_INVENTORY.filter((row) =>
			EXPOSED_FAMILIES.includes(row.family)
		).map((row) => row.id);
		expect(exposedIds.slice().sort()).toEqual(declared.slice().sort());
	});

	it('exposes no internal-only family', () => {
		for (const row of exposedRows()) {
			expect(
				WEBMCP_INTERNAL_ONLY_FAMILIES.includes(row.family),
				`${row.id} exposes an internal-only family`
			).toBe(false);
		}
	});

	it('gives every tool a closed schema whose required arguments it declares', () => {
		for (const definition of listWebmcpToolDefinitions()) {
			const schema = definition.inputSchema;
			expect(schema.additionalProperties, `${definition.operationId} accepts stray arguments`).toBe(
				false
			);
			for (const name of schema.required) {
				expect(
					Object.hasOwn(schema.properties, name),
					`${definition.operationId} requires an undeclared "${name}"`
				).toBe(true);
			}
		}
	});

	it('asks for the observed revision exactly when the row requires one', () => {
		for (const definition of listWebmcpToolDefinitions()) {
			const row = rowFor(definition.operationId);
			const asks = Object.hasOwn(definition.inputSchema.properties, 'expectedRevision');
			expect(asks, `${row.id} disagrees with its revision requirement`).toBe(
				row.requiresExpectedRevision
			);
			if (asks) {
				expect(definition.inputSchema.required).toContain('expectedRevision');
			}
		}
	});

	it('never reaches past the operation layer into engine state', () => {
		for (const modulePath of WEBMCP_FAMILY_TOOL_MODULES) {
			const source = readFileSync(resolve(repoRoot, modulePath), 'utf8');
			for (const reach of FORBIDDEN_TOOL_LAYER_REACHES) {
				expect(source.includes(reach), `${modulePath} reaches for ${reach}`).toBe(false);
			}
		}
	});
});

describe('WebMCP state-aware discovery', () => {
	it('offers a landing visitor discovery and the ways to start, and nothing else', async () => {
		const host = new FakeModelContext();
		const controller = startController(host);

		const summary = await controller.synchronize(readWebmcpCompositionPreconditions(), '/');

		expect(summary.registered.slice().sort()).toEqual(toolNamesRegisteredFor('always'));
	});

	it('adds the session catalog once the session holds work, still inside the ceiling', async () => {
		sessionStore.listUserCompositions.mockResolvedValue([sessionEntry]);
		const host = new FakeModelContext();
		const controller = startController(host);

		const summary = await controller.synchronize(readWebmcpCompositionPreconditions(), '/');

		expect(summary.registered.slice().sort()).toEqual(
			[
				...toolNamesRegisteredFor('always'),
				...toolNamesRegisteredFor('session-composition-present')
			].sort()
		);
		expect(summary.registered.length).toBeLessThanOrEqual(WEBMCP_ALWAYS_REGISTERED_CEILING);
	});

	it('hides the shared history until there is an edit to replay', async () => {
		compositionMeta.userCompositionSlug = 'untitled';
		compositionMeta.isUserComposition = true;
		const host = new FakeModelContext();
		const controller = startController(host);
		const open = readWebmcpCompositionPreconditions();

		const withoutHistory = await controller.synchronize(open, '/p/untitled');
		expect(withoutHistory.registered).not.toContain(rowFor('composition.undo').toolName);

		const withHistory = await controller.synchronize(
			{ ...open, 'undo-available': true },
			'/p/untitled'
		);
		expect(withHistory.added).toEqual([rowFor('composition.undo').toolName]);
	});
});

describe('WebMCP tool calls', () => {
	it('answers a cold-page vocabulary call from the live registry', async () => {
		const host = new FakeModelContext();
		const controller = startController(host);
		await controller.synchronize(readWebmcpCompositionPreconditions(), '/');

		const result = await host.call(rowFor('capability.inspect-vocabulary').toolName, {
			section: 'delivery-orientation'
		});

		expect(result.isError).toBe(false);
		expect(readPayload(result)).toMatchObject({
			status: 'inspected',
			section: 'delivery-orientation',
			members: COMPOSITION_ORIENTATIONS
		});
	});

	it('applies a real edit and returns the receipt the caller continues from', async () => {
		compositionMeta.userCompositionSlug = 'untitled';
		compositionMeta.isUserComposition = true;
		const host = new FakeModelContext();
		const controller = startController(host);
		await controller.synchronize(readWebmcpCompositionPreconditions(), '/p/untitled');

		const result = await host.call(rowFor('transport.set-orientation').toolName, {
			expectedRevision: compositionEditHistory.revision,
			orientation: 'vertical'
		});

		expect(result.isError).toBe(false);
		expect(readPayload(result)).toMatchObject({
			status: 'applied',
			operationId: 'transport.set-orientation',
			revision: compositionEditHistory.revision,
			focus: { target: 'composition-root' }
		});
		expect(engineState.transport.orientation).toBe('vertical');
	});
});

describe('WebMCP tool arguments', () => {
	beforeEach(() => {
		compositionMeta.userCompositionSlug = 'untitled';
		compositionMeta.isUserComposition = true;
	});

	it('names the variants an unsupported one should have been', async () => {
		const host = new FakeModelContext();
		const controller = startController(host);
		await controller.synchronize(readWebmcpCompositionPreconditions(), '/p/untitled');

		const result = await host.call(rowFor('transport.set-orientation').toolName, {
			expectedRevision: 0,
			orientation: 'diagonal'
		});

		expect(result.isError).toBe(true);
		expect(readPayload(result)).toMatchObject({
			code: 'unsupported_variant',
			rejected: 'diagonal',
			alternatives: COMPOSITION_ORIENTATIONS
		});
	});

	it('answers a call that sent no argument object at all', async () => {
		const host = new FakeModelContext();
		const controller = startController(host);
		await controller.synchronize(readWebmcpCompositionPreconditions(), '/p/untitled');

		const result = await host.call(rowFor('transport.set-orientation').toolName, 'horizontal');

		expect(result.isError).toBe(true);
		expect(readPayload(result).code).toBe('invalid_argument');
	});

	it('refuses a JSON import body that is not JSON, without importing anything', async () => {
		const host = new FakeModelContext();
		const controller = startController(host);
		await controller.synchronize(readWebmcpCompositionPreconditions(), '/p/untitled');

		const result = await host.call(rowFor('composition.import-json').toolName, {
			document: 'not a composition'
		});

		expect(readPayload(result)).toMatchObject({ code: 'invalid_argument' });
		expect(sessionStore.forkUserComposition).not.toHaveBeenCalled();
	});
});
