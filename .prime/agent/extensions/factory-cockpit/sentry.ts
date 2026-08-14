import { spawn } from 'node:child_process';

import { safeFactoryDimensions, summarizeCockpit, type CockpitEvent } from './telemetry.ts';

export type SwampEmissionResult = {
	ok: boolean;
	status?: string;
	error?: string;
};

export type CommandResult = {
	code: number | null;
	stdout: string;
	stderr: string;
};

export type CommandRunner = (
	command: string,
	args: string[],
	input: string,
	cwd: string,
	timeoutMs: number
) => Promise<CommandResult>;

export function buildAgentTelemetryPayload(
	idempotencyKey: string,
	events: readonly CockpitEvent[],
	env: NodeJS.ProcessEnv
) {
	const summary = summarizeCockpit(events);
	const latestTurn = [...events].reverse().find((event) => event.type === 'turn');
	const dimensions = safeFactoryDimensions(env);
	const provider = boundedName(latestTurn?.payload.provider, 'unknown');
	const model = boundedName(latestTurn?.payload.model, 'unknown');
	const contextTokens = nullableCount(latestTurn?.payload.contextTokens);
	const contextWindow = nullableCount(latestTurn?.payload.contextWindow);
	return {
		idempotencyKey,
		factory: {
			project: boundedName(env.FACTORY_PROJECT, 'better-randy'),
			name: dimensions.name ?? 'prime-agent',
			profile: dimensions.profile ?? 'factory-cockpit',
			stage: dimensions.stage ?? 'unscoped',
			definitionVersion: dimensions.definitionVersion ?? '0'
		},
		agent: {
			provider,
			model,
			turns: summary.turns,
			inputTokens: summary.input,
			outputTokens: summary.output,
			cacheReadTokens: summary.cacheRead,
			cacheWriteTokens: summary.cacheWrite,
			totalTokens: summary.totalTokens,
			costUsd: summary.totalCost,
			requestBytes: summary.requestBytes,
			contextTokens,
			contextWindow,
			toolCalls: summary.toolCalls,
			toolErrors: summary.toolErrors,
			toolDurationMs: summary.toolDurationMs,
			compactions: summary.compactions,
			skillCatalogCount: summary.latestSkillCatalog?.count ?? 0,
			skillMetadataBytes: summary.latestSkillCatalog?.metadataBytes ?? 0,
			skillUses: Object.entries(summary.skillUses).map(([name, count]) => ({
				name: boundedName(name, 'unknown-skill'),
				count
			}))
		}
	};
}

export async function emitAgentTelemetryWithSwamp(
	cwd: string,
	payload: ReturnType<typeof buildAgentTelemetryPayload>,
	runCommand: CommandRunner = runCommandProcess
): Promise<SwampEmissionResult> {
	if (payload.agent.turns === 0) return { ok: true, status: 'empty' };
	const result = await runCommand(
		'swamp',
		[
			'model',
			'method',
			'run',
			'supers-factory-sentry-metrics',
			'emit_agent_telemetry',
			'--stdin',
			'--json',
			'--skip-reports'
		],
		JSON.stringify(payload),
		cwd,
		20_000
	);
	if (result.code !== 0) {
		return { ok: false, error: boundedError(result.stderr || result.stdout) };
	}
	try {
		const parsed = JSON.parse(result.stdout) as {
			dataArtifacts?: Array<{ attributes?: { status?: string } }>;
		};
		const status = parsed.dataArtifacts?.find((artifact) => artifact.attributes?.status)?.attributes
			?.status;
		return {
			ok: status === undefined || status === 'emitted' || status === 'duplicate',
			status,
			error:
				status && !['emitted', 'duplicate'].includes(status)
					? `Sentry receipt status: ${status}`
					: undefined
		};
	} catch {
		return { ok: true, status: 'succeeded' };
	}
}

async function runCommandProcess(
	command: string,
	args: string[],
	input: string,
	cwd: string,
	timeoutMs: number
): Promise<CommandResult> {
	return await new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' }
		});
		let stdout = '';
		let stderr = '';
		const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
		child.stdout.on('data', (chunk) => {
			stdout = boundedAppend(stdout, String(chunk));
		});
		child.stderr.on('data', (chunk) => {
			stderr = boundedAppend(stderr, String(chunk));
		});
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ code: 1, stdout, stderr: boundedError(error.message) });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr });
		});
		child.stdin.end(input);
	});
}

function boundedAppend(existing: string, incoming: string): string {
	return `${existing}${incoming}`.slice(-16_000);
}

function boundedError(value: string): string {
	return value.replaceAll(/\s+/g, ' ').trim().slice(0, 500);
}

function boundedName(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value.replaceAll(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120);
	return normalized.length > 0 ? normalized : fallback;
}

function nullableCount(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
