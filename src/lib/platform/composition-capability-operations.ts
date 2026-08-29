/**
 * The `capability` family: what this engine can express, and the limits the
 * public demo enforces
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Both operations answer before anything exists, which is what makes them the
 * cold page's opening move: a caller who has just landed asks what the
 * vocabulary is and what the envelope is, then creates a composition. Neither
 * reads the open document, neither writes, and neither can fail on composition
 * state — which is why they return a receipt rather than an outcome union.
 *
 * Neither restates anything either. The vocabulary is the live registry read in
 * `webmcp-derived-tool-schemas`, and the limits are the ratified public export
 * envelope in `public-runtime-contract` plus the result budgets the operation
 * contract declares. A member offered here is a member an operation accepts,
 * because there is only one list.
 */
import { PUBLIC_EXPORT_RUNTIME_LIMITS } from './public-runtime-contract';
import { readWebmcpDerivedEnums } from './webmcp-derived-tool-schemas';
import { requireCompositionOperationRow } from './composition-operation-preflight';
import { STANDARD_TRANSPORT_RATES } from '../utils/composition-timing';
import {
	WEBMCP_RESULT_CHARACTER_BUDGET,
	WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
} from './webmcp-operation-inventory';

import type { WebmcpDerivedEnumName } from './webmcp-derived-tool-schemas';

/** How many members one vocabulary section names before it reports only the total. */
export const CAPABILITY_VOCABULARY_MEMBER_LIMIT = 64;

export interface InspectCapabilityVocabularyRequest {
	section: WebmcpDerivedEnumName;
}

/** One vocabulary, as the caller asked for it: one section per call. */
export interface CapabilityVocabularyReceipt {
	status: 'inspected';
	operationId: string;
	section: WebmcpDerivedEnumName;
	members: readonly string[];
	total: number;
	truncated: boolean;
}

/** Every bound that rejects work before it starts, in one read. */
export interface CapabilityLimitsReceipt {
	status: 'inspected';
	operationId: string;
	/** What a composition may declare before the public export lane refuses it. */
	transport: {
		maxDurationSeconds: number;
		maxFrameRate: number;
		maxFrameCount: number;
		/** The delivery rates every frame computation has an exact rational for. */
		rates: readonly number[];
	};
	/** What one export may produce and hold in flight. */
	output: {
		maxOutputBytes: number;
		maxFrameBytes: number;
		maxAudioBytes: number;
	};
	/** How many export sessions may run at once, and how long each one lives. */
	exportSession: {
		maxConcurrent: number;
		idleTimeoutMs: number;
		maxLifetimeMs: number;
	};
	/** What a tool result may return before it fails rather than truncating. */
	result: {
		characterBudget: number;
		wholeDocumentCharacterBudget: number;
	};
}

/**
 * List one section of the registered vocabulary. One section per call keeps the
 * whole engine's expressive range readable inside a result budget, and keeps an
 * agent from paying for the Effect registry when it wanted the Starter list.
 */
export function runInspectCapabilityVocabularyOperation(
	request: InspectCapabilityVocabularyRequest
): CapabilityVocabularyReceipt {
	const row = requireCompositionOperationRow('capability.inspect-vocabulary');
	const members = readWebmcpDerivedEnums()[request.section];

	return {
		status: 'inspected',
		operationId: row.id,
		section: request.section,
		members: members.slice(0, CAPABILITY_VOCABULARY_MEMBER_LIMIT),
		total: members.length,
		truncated: members.length > CAPABILITY_VOCABULARY_MEMBER_LIMIT
	};
}

/**
 * Report the limits that reject work before it starts. An agent that reads this
 * first authors a piece the export lane will actually take, rather than
 * discovering a 40-second duration at the end of a render.
 */
export function runInspectCapabilityLimitsOperation(): CapabilityLimitsReceipt {
	const row = requireCompositionOperationRow('capability.inspect-limits');

	return {
		status: 'inspected',
		operationId: row.id,
		transport: {
			maxDurationSeconds: PUBLIC_EXPORT_RUNTIME_LIMITS.maxDurationSeconds,
			maxFrameRate: PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameRate,
			maxFrameCount: PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameCount,
			rates: STANDARD_TRANSPORT_RATES
		},
		output: {
			maxOutputBytes: PUBLIC_EXPORT_RUNTIME_LIMITS.maxOutputBytes,
			maxFrameBytes: PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes,
			maxAudioBytes: PUBLIC_EXPORT_RUNTIME_LIMITS.maxAudioBytes
		},
		exportSession: {
			maxConcurrent: PUBLIC_EXPORT_RUNTIME_LIMITS.maxConcurrentSessions,
			idleTimeoutMs: PUBLIC_EXPORT_RUNTIME_LIMITS.sessionIdleTimeoutMs,
			maxLifetimeMs: PUBLIC_EXPORT_RUNTIME_LIMITS.sessionMaxLifetimeMs
		},
		result: {
			characterBudget: WEBMCP_RESULT_CHARACTER_BUDGET,
			wholeDocumentCharacterBudget: WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
		}
	};
}
