import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	appendCockpitEvent,
	inferSkillUses,
	readCockpitEvents,
	safeFactoryDimensions,
	serializedByteLength,
	sessionFingerprint,
	skillCatalogSnapshot,
	summarizeCockpit,
	type CockpitEvent,
	type SkillMetadata,
	type UsageSnapshot
} from './telemetry.ts';
import { buildAgentTelemetryPayload, emitAgentTelemetryWithSwamp } from './sentry.ts';

const EXTENSION_ID = 'factory-cockpit';
const OBSERVABILITY_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export default function factoryCockpit(pi: ExtensionAPI) {
	let skills: SkillMetadata[] = [];
	let batchEvents: CockpitEvent[] = [];
	let batchId = '';
	let batchActive = false;
	let requestBytes = 0;
	let toolCalls = 0;
	let toolErrors = 0;
	let toolDurationMs = 0;
	let inferredSkillUses = new Set<string>();
	const toolStartedAt = new Map<string, number>();
	let warned = false;

	function ledgerPath(cwd: string): string {
		return join(
			homedir(),
			'.prime',
			'agent',
			'telemetry',
			'factory-cockpit',
			`${sessionFingerprint(cwd)}.ndjson`
		);
	}

	function session(ctx: ExtensionContext): string {
		return sessionFingerprint(ctx.sessionManager.getSessionFile());
	}

	async function record(
		ctx: ExtensionContext,
		type: CockpitEvent['type'],
		payload: Record<string, unknown>
	): Promise<void> {
		try {
			const event: CockpitEvent = {
				schemaVersion: 1,
				timestamp: new Date().toISOString(),
				session: session(ctx),
				factory: safeFactoryDimensions(process.env),
				type,
				payload
			};
			await appendCockpitEvent(ledgerPath(ctx.cwd), event);
			if (batchActive) batchEvents.push(event);
		} catch (error) {
			if (warned) return;
			warned = true;
			ctx.ui.notify(`Factory cockpit telemetry degraded: ${String(error)}`, 'warning');
		}
	}

	pi.on('before_agent_start', async (event, ctx) => {
		batchEvents = [];
		batchId = `${session(ctx)}:${Date.now()}`;
		batchActive = true;
		skills = (event.systemPromptOptions.skills ?? []) as SkillMetadata[];
		await record(ctx, 'skill-catalog', skillCatalogSnapshot(skills));
	});

	pi.on('turn_start', async () => {
		requestBytes = 0;
		toolCalls = 0;
		toolErrors = 0;
		toolDurationMs = 0;
		inferredSkillUses = new Set<string>();
		toolStartedAt.clear();
	});

	pi.on('before_provider_request', async (event) => {
		requestBytes += serializedByteLength(event.payload);
	});

	pi.on('tool_execution_start', async (event) => {
		toolCalls += 1;
		toolStartedAt.set(event.toolCallId, performance.now());
		for (const skill of inferSkillUses(event.args, skills)) inferredSkillUses.add(skill);
	});

	pi.on('tool_execution_end', async (event) => {
		if (event.isError) toolErrors += 1;
		const startedAt = toolStartedAt.get(event.toolCallId);
		if (startedAt !== undefined) toolDurationMs += Math.round(performance.now() - startedAt);
		toolStartedAt.delete(event.toolCallId);
	});

	pi.on('turn_end', async (event, ctx) => {
		if (event.message.role !== 'assistant') return;
		const usage = event.message.usage as UsageSnapshot;
		const context = ctx.getContextUsage();
		await record(ctx, 'turn', {
			turnIndex: event.turnIndex,
			provider: event.message.provider,
			model: event.message.responseModel ?? event.message.model,
			stopReason: event.message.stopReason,
			usage,
			requestBytes,
			contextTokens: context?.tokens ?? null,
			contextWindow: context?.contextWindow ?? null,
			toolCalls,
			toolErrors,
			toolDurationMs,
			skillUses: [...inferredSkillUses].sort()
		});

		const events = await readCockpitEvents(ledgerPath(ctx.cwd), session(ctx));
		const summary = summarizeCockpit(events);
		ctx.ui.setStatus(
			EXTENSION_ID,
			`factory ${formatTokens(summary.totalTokens)} · cache ${formatTokens(summary.cacheRead)} · ${formatCost(summary.totalCost)}`
		);
	});

	pi.on('agent_end', async (_event, ctx) => {
		const events = [...batchEvents];
		batchActive = false;
		if (process.env.FACTORY_COCKPIT_SENTRY === 'off') return;
		const result = await emitAgentTelemetryWithSwamp(
			OBSERVABILITY_REPO,
			buildAgentTelemetryPayload(batchId, events, {
				...process.env,
				FACTORY_PROJECT: process.env.FACTORY_PROJECT ?? basename(ctx.cwd)
			})
		);
		if (!result.ok) {
			ctx.ui.notify(
				`Factory cockpit Sentry emission degraded: ${result.error ?? result.status ?? 'unknown'}`,
				'warning'
			);
		}
	});

	pi.on('session_compact', async (event, ctx) => {
		await record(ctx, 'compaction', {
			tokensBefore: event.compactionEntry.tokensBefore,
			fromExtension: event.fromExtension
		});
	});

	pi.registerCommand('factory-cockpit', {
		description: 'Show token, cache, context, tool, compaction, and skill-routing telemetry',
		handler: async (args, ctx) => {
			if (args.trim() === 'hide') {
				ctx.ui.setWidget(EXTENSION_ID, undefined);
				return;
			}
			const currentSession = sessionFingerprint(ctx.sessionManager.getSessionFile());
			const events = await readCockpitEvents(ledgerPath(ctx.cwd), currentSession);
			const summary = summarizeCockpit(events);
			ctx.ui.setWidget(EXTENSION_ID, cockpitLines(summary), { placement: 'aboveEditor' });
			ctx.ui.notify(
				events.length === 0 ? 'No Factory cockpit telemetry yet.' : 'Factory cockpit updated.',
				'info'
			);
		}
	});

	pi.registerCommand('factory-skills', {
		description: 'Show visible skill metadata cost, inferred use, and overlapping routes',
		handler: async (_args, ctx) => {
			const currentSession = sessionFingerprint(ctx.sessionManager.getSessionFile());
			const summary = summarizeCockpit(
				await readCockpitEvents(ledgerPath(ctx.cwd), currentSession)
			);
			const catalog = summary.latestSkillCatalog;
			const uses = Object.entries(summary.skillUses).sort((a, b) => b[1] - a[1]);
			const lines = [
				'Factory skill routing',
				catalog
					? `${catalog.count} visible skills · ${formatBytes(catalog.metadataBytes)} metadata`
					: 'Skill catalog not recorded yet',
				uses.length > 0
					? `Inferred use: ${uses.map(([name, count]) => `${name}×${count}`).join(', ')}`
					: 'Inferred use: none yet',
				...(catalog?.overlaps
					.slice(0, 8)
					.map(
						({ left, right, score }) => `Overlap ${Math.round(score * 100)}%: ${left} ↔ ${right}`
					) ?? [])
			];
			ctx.ui.setWidget(`${EXTENSION_ID}-skills`, lines, { placement: 'aboveEditor' });
		}
	});
}

function cockpitLines(summary: ReturnType<typeof summarizeCockpit>): string[] {
	const usedSkills = Object.entries(summary.skillUses).sort((a, b) => b[1] - a[1]);
	return [
		'Factory cockpit',
		`${summary.turns} turns · ${formatTokens(summary.totalTokens)} tokens · ${formatCost(summary.totalCost)}`,
		`Input ${formatTokens(summary.input)} · output ${formatTokens(summary.output)} · cache read ${formatTokens(summary.cacheRead)} · write ${formatTokens(summary.cacheWrite)}`,
		`Provider payload ${formatBytes(summary.requestBytes)} · tools ${summary.toolCalls} / ${formatDuration(summary.toolDurationMs)} · errors ${summary.toolErrors} · compactions ${summary.compactions}`,
		usedSkills.length > 0
			? `Skills ${usedSkills.map(([name, count]) => `${name}×${count}`).join(', ')}`
			: 'Skills no inferred use yet'
	];
}

function formatTokens(value: number): string {
	return new Intl.NumberFormat('en-US', {
		notation: value >= 1_000 ? 'compact' : 'standard',
		maximumFractionDigits: 1
	}).format(value);
}

function formatCost(value: number): string {
	return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatBytes(value: number): string {
	if (value < 1_024) return `${value} B`;
	if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KiB`;
	return `${(value / (1_024 * 1_024)).toFixed(1)} MiB`;
}

function formatDuration(value: number): string {
	if (value < 1_000) return `${value}ms`;
	return `${(value / 1_000).toFixed(1)}s`;
}
