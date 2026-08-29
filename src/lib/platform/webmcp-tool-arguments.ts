/**
 * Where an agent's arguments stop being `unknown`
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §7).
 *
 * `document.modelContext` hands a tool handler whatever the caller sent. A
 * declared input schema says what a tool accepts; it is not a promise the
 * browser enforced it. So the trust boundary is this module, not the schema, and
 * every argument an operation receives passed through a reader here.
 *
 * A reader that cannot narrow raises `WebmcpArgumentError`, and
 * `runWebmcpToolOperation` turns it into the same corrective refusal every
 * operation returns: one code, the exact value rejected, and the alternatives.
 * A caller never has to tell an argument mistake from an operation refusal —
 * both arrive as the same document, and both name the way forward.
 *
 * Anything else a handler throws is a defect and propagates untouched. Dressing
 * a bug as a caller error would send an agent off correcting an argument that
 * was already right.
 */
import { compositionEditHistory } from './composition-edit-history';
import { isRecord } from '../utils/object';
import {
	refuseCompositionOperation,
	requireCompositionOperationRow
} from './composition-operation-preflight';

import type { CompositionOperationFailure } from './composition-operation-preflight';
import type { WebmcpOperationErrorCode } from './webmcp-operation-inventory';

/**
 * How much of a rejected argument a refusal quotes back. A caller that sent a
 * whole composition document as the wrong argument gets enough to recognize it,
 * not enough to push the refusal past its result budget.
 */
const REJECTED_ARGUMENT_CHARACTER_LIMIT = 120;

export interface WebmcpArgumentErrorDetails {
	rejected?: string;
	alternatives?: readonly string[];
}

/** A caller-correctable argument fault, raised before any operation runs. */
export class WebmcpArgumentError extends Error {
	readonly code: WebmcpOperationErrorCode;
	readonly rejected: string | null;
	readonly alternatives: readonly string[];

	constructor(
		code: WebmcpOperationErrorCode,
		message: string,
		details: WebmcpArgumentErrorDetails = {}
	) {
		super(message);
		this.name = 'WebmcpArgumentError';
		this.code = code;
		this.rejected = details.rejected ?? null;
		this.alternatives = details.alternatives ?? [];
	}
}

/** The rejected value, rendered short enough to quote and specific enough to recognize. */
function describeRejectedArgument(value: unknown): string {
	const rendered = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
	return rendered.length > REJECTED_ARGUMENT_CHARACTER_LIMIT
		? `${rendered.slice(0, REJECTED_ARGUMENT_CHARACTER_LIMIT)}…`
		: rendered;
}

function readArgumentRecord(args: unknown): Record<string, unknown> {
	if (!isRecord(args)) {
		throw new WebmcpArgumentError(
			'invalid_argument',
			'This tool takes a JSON object of named arguments.',
			{ rejected: describeRejectedArgument(args) }
		);
	}
	return args;
}

/** A required argument that names something: a slug, an id, a document body. */
export function readWebmcpStringArgument(args: unknown, name: string): string {
	const value = readArgumentRecord(args)[name];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new WebmcpArgumentError('invalid_argument', `"${name}" must be a non-empty string.`, {
			rejected: describeRejectedArgument(value)
		});
	}
	return value;
}

/**
 * An optional string. Empty text is kept rather than treated as absent: an
 * operation whose field is optional clears it with `''` and leaves it alone when
 * the argument never arrived, and collapsing the two would make one of those
 * unreachable.
 */
export function readWebmcpOptionalStringArgument(args: unknown, name: string): string | undefined {
	const value = readArgumentRecord(args)[name];
	if (value === undefined) return undefined;
	if (typeof value !== 'string') {
		throw new WebmcpArgumentError('invalid_argument', `"${name}" must be a string.`, {
			rejected: describeRejectedArgument(value)
		});
	}
	return value;
}

export function readWebmcpOptionalNumberArgument(args: unknown, name: string): number | undefined {
	const value = readArgumentRecord(args)[name];
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new WebmcpArgumentError('invalid_argument', `"${name}" must be a finite number.`, {
			rejected: describeRejectedArgument(value)
		});
	}
	return value;
}

export function readWebmcpBooleanArgument(args: unknown, name: string): boolean {
	const value = readArgumentRecord(args)[name];
	if (typeof value !== 'boolean') {
		throw new WebmcpArgumentError('invalid_argument', `"${name}" must be true or false.`, {
			rejected: describeRejectedArgument(value)
		});
	}
	return value;
}

/**
 * The Composition revision the caller observed. Only its type is decided here;
 * whether it is a usable integer and whether it is still current belong to the
 * revision guard, which answers with the revision that *is* current.
 */
export function readWebmcpObservedRevisionArgument(args: unknown): number {
	const value = readArgumentRecord(args).expectedRevision;
	if (typeof value !== 'number') {
		throw new WebmcpArgumentError(
			'invalid_argument',
			'Supply the Composition revision you last observed as "expectedRevision".',
			{ rejected: describeRejectedArgument(value) }
		);
	}
	return value;
}

/**
 * A required argument drawn from a closed set. Narrowing against the same typed
 * list the operation validates with is what lets a handler hand an operation a
 * literal rather than a string it would have to re-check.
 */
export function readWebmcpLiteralArgument<TMember extends string>(
	args: unknown,
	name: string,
	members: readonly TMember[]
): TMember {
	const value = readArgumentRecord(args)[name];
	const match = members.find((member) => member === value);
	if (match === undefined) {
		throw new WebmcpArgumentError(
			'unsupported_variant',
			`"${name}" is not one this engine accepts.`,
			{
				rejected: describeRejectedArgument(value),
				alternatives: members
			}
		);
	}
	return match;
}

/** The same closed set, for an argument the caller may leave out entirely. */
export function readWebmcpOptionalLiteralArgument<TMember extends string>(
	args: unknown,
	name: string,
	members: readonly TMember[]
): TMember | undefined {
	if (readArgumentRecord(args)[name] === undefined) return undefined;
	return readWebmcpLiteralArgument(args, name, members);
}

/**
 * A JSON document sent as text. Interchange travels as the string the export
 * operation returns, so a caller round-trips a composition through the two tools
 * without reshaping it, and a body that is not JSON is named as such before any
 * schema has an opinion about it.
 */
export function readWebmcpJsonArgument(args: unknown, name: string): unknown {
	const text = readWebmcpStringArgument(args, name);
	try {
		return JSON.parse(text) as unknown;
	} catch (cause) {
		throw new WebmcpArgumentError(
			'invalid_argument',
			`"${name}" must be JSON text: ${cause instanceof Error ? cause.message : 'it did not parse'}.`,
			{ rejected: describeRejectedArgument(text) }
		);
	}
}

/**
 * Run one tool handler, answering an argument fault with the operation's own
 * refusal shape. The operation itself is never entered when an argument does not
 * narrow, so a rejected call leaves the composition untouched by construction.
 */
export async function runWebmcpToolOperation<TOutcome>(
	operationId: string,
	run: () => TOutcome | Promise<TOutcome>
): Promise<TOutcome | CompositionOperationFailure> {
	try {
		return await run();
	} catch (cause) {
		if (!(cause instanceof WebmcpArgumentError)) throw cause;
		return refuseCompositionOperation(
			requireCompositionOperationRow(operationId),
			compositionEditHistory.revision,
			cause.code,
			cause.message,
			{ rejected: cause.rejected, alternatives: cause.alternatives }
		);
	}
}
