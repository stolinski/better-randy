import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	readWebmcpToolExposure,
	startWebmcpToolController,
	WEBMCP_INTERNAL_ONLY_FAMILIES,
	WebmcpToolController
} from './webmcp-tool-controller.ts';
import { userCompositionStore } from './user-composition-store';
import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_RESULT_CHARACTER_BUDGET
} from './webmcp-operation-inventory.ts';

import type {
	WebmcpExposureView,
	WebmcpModelContextHost,
	WebmcpToolCallResult,
	WebmcpToolDefinition,
	WebmcpToolDescriptor
} from './webmcp-tool-controller.ts';
import type { UserCompositionMeta } from './user-composition-store';
import type { WebmcpCompositionPreconditions } from './webmcp-tool-preconditions.ts';

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

/**
 * A `document.modelContext` that honours the registration signal the way the
 * measured surface does, so the lifecycle assertions read `getTools()` — the
 * ADR-0054 §5 authority — rather than the controller's own bookkeeping.
 */
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

	describe(name: string): WebmcpToolDescriptor | undefined {
		return this.#tools.get(name);
	}
}

const CLOSED_PAGE: WebmcpCompositionPreconditions = {
	always: true,
	'composition-open': false,
	'composition-editable': false,
	'forked-from-starter': false,
	'undo-available': false,
	'redo-available': false,
	'overlay-present': false,
	'effect-present': false,
	'mark-present': false,
	'text-animation-present': false,
	'diagram-present': false,
	'chart-present': false,
	'captions-present': false,
	'chat-surface-active': false,
	'checklist-surface-active': false,
	'orientation-override-present': false,
	'keyframe-channel-present': false,
	'cascade-anchor-present': false,
	'transition-present': false,
	'audio-cue-present': false,
	'media-permitted': false,
	'media-entry-present': false,
	'video-clip-present': false
};

const OPEN_COMPOSITION: WebmcpCompositionPreconditions = {
	...CLOSED_PAGE,
	'composition-open': true,
	'composition-editable': true
};

const SESSION_ENTRY: UserCompositionMeta = {
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

function readPayload(result: WebmcpToolCallResult): Record<string, unknown> {
	return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

function definition(
	operationId: string,
	run: WebmcpToolDefinition['run'] = async () => ({ status: 'applied', operationId })
): WebmcpToolDefinition {
	return {
		operationId,
		inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
		run
	};
}

function toolNameFor(operationId: string): string {
	const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === operationId);
	if (!row) throw new Error(`The inventory declares no ${operationId}`);
	return row.toolName;
}

function exposedView(host: WebmcpModelContextHost): WebmcpExposureView {
	const view = {
		document: { modelContext: host },
		isSecureContext: true,
		origin: 'https://gfx.computer',
		top: null as unknown,
		self: null as unknown
	};
	view.top = view;
	view.self = view;
	return view;
}

beforeEach(() => {
	vi.clearAllMocks();
	sessionStore.listUserCompositions.mockResolvedValue([]);
});

describe('WebMCP exposure', () => {
	it('stays inert with no modelContext, and says so without noise', () => {
		const view = exposedView(new FakeModelContext());
		view.document = {};
		expect(readWebmcpToolExposure(view)).toEqual({
			host: null,
			refusal: 'model-context-absent'
		});
	});

	it('refuses an insecure context, a frame, and an opaque origin', () => {
		const host = new FakeModelContext();

		expect(readWebmcpToolExposure({ ...exposedView(host), isSecureContext: false }).refusal).toBe(
			'insecure-context'
		);
		expect(readWebmcpToolExposure({ ...exposedView(host), top: {} }).refusal).toBe(
			'framed-document'
		);
		expect(readWebmcpToolExposure({ ...exposedView(host), origin: 'null' }).refusal).toBe(
			'opaque-origin'
		);
	});

	it('starts no controller where it may not expose tools, leaving the GUI untouched', () => {
		const view = exposedView(new FakeModelContext());
		view.document = {};
		const controller = startWebmcpToolController({
			view,
			definitions: [definition('composition.create-blank')],
			lifetime: new AbortController().signal
		});
		expect(controller).toBeNull();
	});
});

describe('WebMCP tool registration', () => {
	it('registers only the tools that can succeed on a cold page', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('composition.create-blank'),
				definition('composition.inspect'),
				definition('layer.remove-overlay')
			],
			lifetime: new AbortController().signal
		});

		const summary = await controller.synchronize(CLOSED_PAGE, '/');
		expect(summary.registered).toEqual([toolNameFor('composition.create-blank')]);
		expect(summary.added).toEqual([toolNameFor('composition.create-blank')]);
	});

	it('adds and drops tools as the composition gains and loses an Overlay', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [definition('composition.inspect'), definition('layer.remove-overlay')],
			lifetime: new AbortController().signal
		});

		await controller.synchronize(OPEN_COMPOSITION, '/p/lower-third');
		expect([...host.getTools()].map((tool) => tool.name)).toEqual([
			toolNameFor('composition.inspect')
		]);

		const withOverlay = await controller.synchronize(
			{ ...OPEN_COMPOSITION, 'overlay-present': true },
			'/p/lower-third'
		);
		expect(withOverlay.registered).toContain(toolNameFor('layer.remove-overlay'));

		const withoutOverlay = await controller.synchronize(OPEN_COMPOSITION, '/p/lower-third');
		expect(withoutOverlay.removed).toEqual([toolNameFor('layer.remove-overlay')]);
		expect(withoutOverlay.registered).not.toContain(toolNameFor('layer.remove-overlay'));
	});

	it('registers a session tool only once the browser session holds a composition', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [definition('session.delete-composition')],
			lifetime: new AbortController().signal
		});

		await controller.synchronize(CLOSED_PAGE, '/');
		expect([...host.getTools()]).toEqual([]);

		sessionStore.listUserCompositions.mockResolvedValue([SESSION_ENTRY]);
		const summary = await controller.synchronize(CLOSED_PAGE, '/');
		expect(summary.registered).toEqual([toolNameFor('session.delete-composition')]);
	});

	it('ends every registration on a route change before deciding the next set', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [definition('composition.create-blank')],
			lifetime: new AbortController().signal
		});

		await controller.synchronize(CLOSED_PAGE, '/');
		const moved = await controller.synchronize(CLOSED_PAGE, '/p/lower-third');

		expect(moved.removed).toEqual([toolNameFor('composition.create-blank')]);
		expect(moved.added).toEqual([toolNameFor('composition.create-blank')]);
		expect(moved.registered).toEqual([toolNameFor('composition.create-blank')]);
		expect(moved.routeId).toBe('/p/lower-third');
	});

	it('unregisters everything when the page tears down', async () => {
		const host = new FakeModelContext();
		const lifetime = new AbortController();
		const controller = new WebmcpToolController({
			host,
			definitions: [definition('composition.create-blank')],
			lifetime: lifetime.signal
		});

		await controller.synchronize(CLOSED_PAGE, '/');
		lifetime.abort();

		expect([...host.getTools()]).toEqual([]);
		expect(controller.registeredToolNames).toEqual([]);
	});

	it('refuses a definition for an internal-only family outright', () => {
		const internalRows = WEBMCP_OPERATION_INVENTORY.filter((row) =>
			WEBMCP_INTERNAL_ONLY_FAMILIES.includes(row.family)
		);
		expect(internalRows.length).toBeGreaterThan(0);

		for (const row of internalRows) {
			expect(
				() =>
					new WebmcpToolController({
						host: new FakeModelContext(),
						definitions: [definition(row.id)],
						lifetime: new AbortController().signal
					}),
				`${row.id} must have no WebMCP tool`
			).toThrow(/internal-only/);
		}
	});

	it('rejects a definition that names no inventory row', () => {
		expect(
			() =>
				new WebmcpToolController({
					host: new FakeModelContext(),
					definitions: [definition('composition.set-everything')],
					lifetime: new AbortController().signal
				})
		).toThrow(/composition.set-everything/);
	});

	it('keeps a cold page inside the ceiling with every exposable row defined', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: WEBMCP_OPERATION_INVENTORY.filter(
				(row) => !WEBMCP_INTERNAL_ONLY_FAMILIES.includes(row.family)
			).map((row) => definition(row.id)),
			lifetime: new AbortController().signal
		});

		const summary = await controller.synchronize(CLOSED_PAGE, '/');
		expect(summary.registered.length).toBeLessThanOrEqual(WEBMCP_ALWAYS_REGISTERED_CEILING);
		expect(summary.registered).toContain(toolNameFor('composition.create-blank'));
	});

	it('names the tool and its description from the inventory row, never the definition', async () => {
		const host = new FakeModelContext();
		const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === 'composition.create-blank');
		const controller = new WebmcpToolController({
			host,
			definitions: [definition('composition.create-blank')],
			lifetime: new AbortController().signal
		});

		await controller.synchronize(CLOSED_PAGE, '/');
		expect(host.describe(row?.toolName ?? '')?.description).toBe(row?.summary);
	});
});

describe('WebMCP tool calls', () => {
	it('returns the operation receipt as the tool result', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('composition.create-blank', async () => ({
					status: 'applied',
					slug: 'untitled',
					revision: 0
				}))
			],
			lifetime: new AbortController().signal
		});
		await controller.synchronize(CLOSED_PAGE, '/');

		const result = await host.call(toolNameFor('composition.create-blank'), {});
		expect(result.isError).toBe(false);
		expect(readPayload(result)).toMatchObject({ status: 'applied', slug: 'untitled' });
	});

	it('marks a refusal as an error without rewriting it', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('composition.create-blank', async () => ({
					status: 'failed',
					code: 'storage_unavailable',
					message: 'This browser session could not reach its composition store.'
				}))
			],
			lifetime: new AbortController().signal
		});
		await controller.synchronize(CLOSED_PAGE, '/');

		const result = await host.call(toolNameFor('composition.create-blank'), {});
		expect(result.isError).toBe(true);
		expect(readPayload(result).code).toBe('storage_unavailable');
	});

	it('resolves a call as cancelled when its tool is unregistered mid flight', async () => {
		const host = new FakeModelContext();
		let release: (value: unknown) => void = () => {};
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('layer.remove-overlay', () => {
					return new Promise<unknown>((resolve) => {
						release = resolve;
					});
				})
			],
			lifetime: new AbortController().signal
		});

		await controller.synchronize(
			{ ...OPEN_COMPOSITION, 'overlay-present': true },
			'/p/lower-third'
		);
		const call = host.call(toolNameFor('layer.remove-overlay'), {});

		await controller.synchronize(OPEN_COMPOSITION, '/p/lower-third');
		release({ status: 'applied' });

		const payload = readPayload(await call);
		expect(payload).toMatchObject({ status: 'cancelled', code: 'cancelled' });
	});

	it('fails a result that overruns its budget rather than truncating it', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('composition.inspect', async () => ({
					status: 'applied',
					overlays: 'x'.repeat(WEBMCP_RESULT_CHARACTER_BUDGET)
				}))
			],
			lifetime: new AbortController().signal
		});
		await controller.synchronize(OPEN_COMPOSITION, '/p/lower-third');

		const result = await host.call(toolNameFor('composition.inspect'), {});
		expect(result.isError).toBe(true);
		expect(readPayload(result)).toMatchObject({
			code: 'limit_exceeded',
			alternatives: [String(WEBMCP_RESULT_CHARACTER_BUDGET)]
		});
	});

	it('lets the whole-document read past the default budget', async () => {
		const host = new FakeModelContext();
		const controller = new WebmcpToolController({
			host,
			definitions: [
				definition('composition.export-json', async () => ({
					status: 'applied',
					document: 'x'.repeat(WEBMCP_RESULT_CHARACTER_BUDGET)
				}))
			],
			lifetime: new AbortController().signal
		});
		await controller.synchronize(OPEN_COMPOSITION, '/p/lower-third');

		const result = await host.call(toolNameFor('composition.export-json'), {});
		expect(result.isError).toBe(false);
	});
});
