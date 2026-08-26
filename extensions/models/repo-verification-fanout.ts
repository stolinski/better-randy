import { isAbsolute, relative, resolve, sep } from 'node:path';

import { z } from 'npm:zod@4.4.3';

import { compareCanonicalText } from '../../src/lib/utils/canonical-text-order.ts';
import { createSupersDeterministicContractHash } from './supers-deterministic-factory-contract.ts';

export const AutomatedVerificationLaneIdSchema = z.enum([
	'browser',
	'check',
	'unit',
	'preset-static',
	'layout-contract',
	'export-decode',
	'performance',
	'repository-infrastructure',
	'swamp-control-plane',
	'timing-coverage',
	'authoring-dependency-tracking',
	'inspector-editor-parity',
	'planning-discoverability'
]);

export type AutomatedVerificationLaneId = z.infer<typeof AutomatedVerificationLaneIdSchema>;

const PackageScriptSchema = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,127}$/);
const ChangedPathSchema = z
	.string()
	.min(1)
	.max(512)
	.refine((path) => !path.startsWith('/') && !path.split('/').includes('..'));

export const VerificationFanoutRequestArgumentsSchema = z.strictObject({
	workItem: z.string().min(1).max(128),
	expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/)
});

export type VerificationFanoutRequestArguments = z.infer<
	typeof VerificationFanoutRequestArgumentsSchema
>;

export const VerificationFanoutArgumentsSchema = z.strictObject({
	workItem: z.string().min(1).max(128),
	expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
	changeImpactResourceName: z.string().min(1).max(512),
	changedPaths: z.array(ChangedPathSchema).min(1).max(200),
	intentRouteDigest: z.string().regex(/^[0-9a-f]{64}$/),
	lanes: z.array(AutomatedVerificationLaneIdSchema).max(13),
	benchmarkScripts: z.array(PackageScriptSchema).max(20),
	exportDecodeScripts: z.array(PackageScriptSchema).max(20)
});

export type VerificationFanoutArguments = z.infer<typeof VerificationFanoutArgumentsSchema>;

const VerificationUnavailableReasonSchema = z.enum([
	'benchmark-evidence-not-declared',
	'export-decode-evidence-not-declared'
]);

export const VerificationLaneResultSchema = z.strictObject({
	id: AutomatedVerificationLaneIdSchema,
	status: z.enum(['passed', 'failed', 'unavailable']),
	command: z.string().min(1),
	durationMs: z.number().int().nonnegative(),
	exitCode: z.number().int().nullable(),
	outputTail: z.string().max(4_000),
	unavailableReason: VerificationUnavailableReasonSchema.nullable()
});

const VerificationFanoutReportContentSchema = z.strictObject({
	schemaVersion: z.literal(2),
	workItem: z.string().min(1).max(128),
	expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
	changeImpactResourceName: z.string().min(1).max(512),
	changedPaths: z.array(ChangedPathSchema).min(1).max(200),
	intentRouteDigest: z.string().regex(/^[0-9a-f]{64}$/),
	startedAt: z.string(),
	completedAt: z.string(),
	executionMode: z.literal('parallel'),
	results: z.array(VerificationLaneResultSchema).max(13),
	passed: z.boolean()
});

export const VerificationFanoutReportSchema = VerificationFanoutReportContentSchema.extend({
	contentDigest: z.string().regex(/^[0-9a-f]{64}$/)
});

export type VerificationFanoutReport = z.infer<typeof VerificationFanoutReportSchema>;

export type VerificationCommandOutput = {
	code: number;
	stdout: Uint8Array;
	stderr: Uint8Array;
};

export type VerificationCommandRunner = (
	command: string,
	args: string[],
	cwd: string
) => Promise<VerificationCommandOutput>;

type VerificationCommand = {
	command: string;
	args: string[];
	diagnosticPathScope?: readonly string[];
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function boundedOutputTail(output: VerificationCommandOutput): string {
	const combined = [
		textDecoder.decode(output.stdout).trim(),
		textDecoder.decode(output.stderr).trim()
	]
		.filter(Boolean)
		.join('\n');
	return combined.slice(-4_000);
}

function normalizedRepositoryDiagnosticPath(
	repoDir: string,
	diagnosticPath: string
): string | null {
	const repositoryRoot = resolve(repoDir);
	const candidate = isAbsolute(diagnosticPath)
		? diagnosticPath
		: resolve(repositoryRoot, diagnosticPath);
	const repositoryRelativePath = relative(repositoryRoot, candidate).replaceAll('\\', '/');
	if (
		repositoryRelativePath === '..' ||
		repositoryRelativePath.startsWith('../') ||
		isAbsolute(repositoryRelativePath)
	) {
		return null;
	}
	return repositoryRelativePath.replace(/^\.\//, '');
}

function scopedSvelteCheckOutput(
	output: VerificationCommandOutput,
	repoDir: string,
	changedPaths: readonly string[]
): VerificationCommandOutput {
	if (output.code !== 1) return output;
	const stdout = textDecoder.decode(output.stdout);
	const stderr = textDecoder.decode(output.stderr);
	const errorLines = `${stdout}\n${stderr}`
		.split('\n')
		.filter((line) => /^\d+\s+ERROR\s+/.test(line));
	if (errorLines.length === 0) return output;
	const diagnosticPaths = errorLines.map((line) => {
		const match = line.match(/^\d+\s+ERROR\s+("(?:\\.|[^"\\])*")\s+\d+:\d+\s+/);
		if (!match) return null;
		try {
			const parsed: unknown = JSON.parse(match[1]);
			return typeof parsed === 'string'
				? normalizedRepositoryDiagnosticPath(repoDir, parsed)
				: null;
		} catch {
			return null;
		}
	});
	if (diagnosticPaths.some((path) => path === null)) return output;
	const changedPathSet = new Set(changedPaths);
	const scopedErrorCount = diagnosticPaths.filter(
		(path) => path !== null && changedPathSet.has(path)
	).length;
	const scopeSummary =
		scopedErrorCount === 0
			? `Scoped Svelte diagnostics: 0 errors in ${changedPathSet.size} sealed changed path(s); ${errorLines.length} unrelated error(s) retained above as non-routing evidence.`
			: `Scoped Svelte diagnostics: ${scopedErrorCount} error(s) in ${changedPathSet.size} sealed changed path(s); ${
					errorLines.length - scopedErrorCount
				} unrelated error(s) retained above.`;
	return {
		code: scopedErrorCount === 0 ? 0 : output.code,
		stdout: textEncoder.encode(`${stdout.trimEnd()}\n${scopeSummary}\n`),
		stderr: output.stderr
	};
}

function isCheckableSourcePath(path: string): boolean {
	return /(?:\.[cm]?[jt]sx?|\.svelte)$/.test(path);
}

async function runDenoCommand(
	command: string,
	args: string[],
	cwd: string
): Promise<VerificationCommandOutput> {
	return await new Deno.Command(command, {
		args,
		cwd,
		stdin: 'null',
		stdout: 'piped',
		stderr: 'piped'
	}).output();
}

function workflowValidationTarget(path: string): string {
	return (
		path
			.split('/')
			.at(-1)
			?.replace(/^workflow-/, '')
			.replace(/\.ya?ml$/, '') ?? path
	);
}

function modelValidationTarget(path: string): string {
	return (
		path
			.split('/')
			.at(-1)
			?.replace(/\.ya?ml$/, '') ?? path
	);
}

function safeRepositoryFilePath(repoDir: string, projectRelativePath: string): string {
	const repositoryRoot = resolve(repoDir);
	const candidate = resolve(repositoryRoot, projectRelativePath);
	const repositoryRelativePath = relative(repositoryRoot, candidate);
	if (
		repositoryRelativePath === '..' ||
		repositoryRelativePath.startsWith(`..${sep}`) ||
		isAbsolute(repositoryRelativePath)
	) {
		throw new TypeError(`Extension test path escapes the repository: ${projectRelativePath}`);
	}
	return candidate;
}

async function repositoryFileExists(
	repoDir: string,
	projectRelativePath: string
): Promise<boolean> {
	try {
		const info = await Deno.lstat(safeRepositoryFilePath(repoDir, projectRelativePath));
		return info.isFile && !info.isSymlink;
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return false;
		throw error;
	}
}

async function focusedExtensionTestPaths(
	paths: readonly string[],
	repoDir: string
): Promise<string[]> {
	const extensionSources = paths.filter(
		(path) => path.startsWith('extensions/') && path.endsWith('.ts')
	);
	const changedTests = extensionSources.filter((path) => path.endsWith('.test.ts'));
	const colocatedTests: string[] = [];
	for (const source of extensionSources.filter(
		(path) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts')
	)) {
		const candidate = `${source.slice(0, -'.ts'.length)}.test.ts`;
		if (await repositoryFileExists(repoDir, candidate)) colocatedTests.push(candidate);
	}
	return [...new Set([...changedTests, ...colocatedTests])].sort(compareCanonicalText);
}

async function swampControlPlaneCommands(
	paths: readonly string[],
	repoDir: string
): Promise<VerificationCommand[]> {
	const commands: VerificationCommand[] = [];
	for (const path of paths.filter((candidate) => candidate.startsWith('workflows/'))) {
		commands.push({
			command: 'swamp',
			args: ['workflow', 'validate', workflowValidationTarget(path), '--json']
		});
	}
	for (const path of paths.filter((candidate) => candidate.startsWith('models/'))) {
		commands.push({
			command: 'swamp',
			args: ['model', 'validate', modelValidationTarget(path), '--json']
		});
	}
	const extensionSources = paths.filter(
		(path) => path.startsWith('extensions/') && path.endsWith('.ts')
	);
	if (extensionSources.length > 0) {
		commands.push({
			command: 'npx',
			args: [
				'--yes',
				'deno',
				'check',
				'--no-config',
				'--import-map=scripts/factory-model-test-import-map.json',
				'--allow-import=raw.githubusercontent.com,jsr.io',
				...extensionSources
			]
		});
	}
	const extensionTests = await focusedExtensionTestPaths(paths, repoDir);
	if (extensionTests.length > 0) {
		commands.push({
			command: 'npx',
			args: [
				'--yes',
				'deno',
				'test',
				'--no-config',
				'--import-map=scripts/factory-model-test-import-map.json',
				'--allow-import=raw.githubusercontent.com,jsr.io',
				'--allow-env',
				'--allow-run=git,/usr/bin/python3,scripts/factory-pi-runtime-receipt.ts',
				'--allow-read',
				'--allow-write',
				...extensionTests
			]
		});
	}
	commands.push(
		{
			command: 'node',
			args: ['--experimental-strip-types', '--test', 'scripts/change-impact-classifier.test.ts']
		},
		{
			command: 'node',
			args: ['--test', 'scripts/supers-delivery-routing-workflows.test.mjs']
		}
	);
	return commands;
}

function packageScriptCommands(scripts: readonly string[]): VerificationCommand[] {
	return scripts.map((script) => ({ command: 'pnpm', args: ['run', script] }));
}

async function verificationCommands(
	lane: AutomatedVerificationLaneId,
	args: VerificationFanoutArguments,
	repoDir: string
): Promise<VerificationCommand[]> {
	switch (lane) {
		case 'browser':
			return [{ command: 'pnpm', args: ['run', 'test:browser'] }];
		case 'check': {
			const checkablePaths = args.changedPaths.filter(isCheckableSourcePath);
			return [
				{ command: 'pnpm', args: ['exec', 'svelte-kit', 'sync'] },
				{
					command: 'pnpm',
					args: [
						'exec',
						'svelte-check',
						'--tsconfig',
						'./tsconfig.json',
						'--output',
						'machine',
						'--no-color',
						'--threshold',
						'error'
					],
					diagnosticPathScope: checkablePaths
				},
				{
					command: 'pnpm',
					args: [
						'exec',
						'eslint',
						'--no-warn-ignored',
						'--max-warnings',
						'0',
						'--pass-on-no-patterns',
						...checkablePaths
					]
				}
			];
		}
		case 'unit':
			return [{ command: 'pnpm', args: ['run', 'test'] }];
		case 'preset-static':
			return [
				{
					command: 'pnpm',
					args: [
						'verify-presets',
						'--affected',
						'--changed-paths-json',
						JSON.stringify(args.changedPaths)
					]
				}
			];
		case 'layout-contract':
			return [
				{
					command: 'node',
					args: ['--experimental-strip-types', 'scripts/run-supers-layout-contract-matrix.mjs']
				}
			];
		case 'export-decode':
			return packageScriptCommands(args.exportDecodeScripts);
		case 'performance':
			return packageScriptCommands(args.benchmarkScripts);
		case 'repository-infrastructure':
			return [{ command: 'pnpm', args: ['run', 'test:structural'] }];
		case 'swamp-control-plane':
			return await swampControlPlaneCommands(args.changedPaths, repoDir);
		case 'timing-coverage':
			return [{ command: 'pnpm', args: ['run', 'audit:timing'] }];
		case 'authoring-dependency-tracking':
			return [{ command: 'pnpm', args: ['run', 'audit:tracking'] }];
		case 'inspector-editor-parity':
			return [{ command: 'pnpm', args: ['run', 'audit:parity'] }];
		case 'planning-discoverability':
			return [
				{ command: 'pnpm', args: ['run', 'audit:planning'] },
				{ command: 'pnpm', args: ['run', 'test:discoverability'] }
			];
	}
}

function unavailableLaneResult(
	lane: 'performance' | 'export-decode'
): z.infer<typeof VerificationLaneResultSchema> {
	const performance = lane === 'performance';
	return {
		id: lane,
		status: 'unavailable',
		command: performance
			? 'declared benchmark package script required'
			: 'declared export-decode package script required',
		durationMs: 0,
		exitCode: null,
		outputTail: '',
		unavailableReason: performance
			? 'benchmark-evidence-not-declared'
			: 'export-decode-evidence-not-declared'
	};
}

async function runCommandSequence(
	commands: readonly VerificationCommand[],
	repoDir: string,
	runCommand: VerificationCommandRunner
): Promise<VerificationCommandOutput> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	for (const command of commands) {
		const commandOutput = await runCommand(command.command, command.args, repoDir);
		const output = command.diagnosticPathScope
			? scopedSvelteCheckOutput(commandOutput, repoDir, command.diagnosticPathScope)
			: commandOutput;
		stdout.push(textDecoder.decode(output.stdout));
		stderr.push(textDecoder.decode(output.stderr));
		if (output.code !== 0) {
			return {
				code: output.code,
				stdout: textEncoder.encode(stdout.join('\n')),
				stderr: textEncoder.encode(stderr.join('\n'))
			};
		}
	}
	return {
		code: 0,
		stdout: textEncoder.encode(stdout.join('\n')),
		stderr: textEncoder.encode(stderr.join('\n'))
	};
}

async function runVerificationLane(
	lane: AutomatedVerificationLaneId,
	args: VerificationFanoutArguments,
	repoDir: string,
	runCommand: VerificationCommandRunner
): Promise<z.infer<typeof VerificationLaneResultSchema>> {
	const commands = await verificationCommands(lane, args, repoDir);
	if (commands.length === 0 && (lane === 'performance' || lane === 'export-decode')) {
		return unavailableLaneResult(lane);
	}
	const startedAt = performance.now();
	const output = await runCommandSequence(commands, repoDir, runCommand);
	return {
		id: lane,
		status: output.code === 0 ? 'passed' : 'failed',
		command: commands
			.map(({ command, args: commandArgs }) => `${command} ${commandArgs.join(' ')}`)
			.join(' && '),
		durationMs: Math.round(performance.now() - startedAt),
		exitCode: output.code,
		outputTail: boundedOutputTail(output),
		unavailableReason: null
	};
}

/** Run the exact independent deterministic verification lane union concurrently. */
export async function runVerificationFanout(
	repoDir: string,
	rawArguments: VerificationFanoutArguments,
	runCommand: VerificationCommandRunner = runDenoCommand
): Promise<VerificationFanoutReport> {
	const args = VerificationFanoutArgumentsSchema.parse(rawArguments);
	const lanes = [...new Set(args.lanes)];
	if (lanes.length !== args.lanes.length) {
		throw new TypeError('Verification fan-out lanes must be unique');
	}
	if (
		JSON.stringify([...args.changedPaths].sort(compareCanonicalText)) !==
		JSON.stringify(args.changedPaths)
	) {
		throw new TypeError('Verification fan-out changed paths must use canonical order');
	}

	const startedAt = new Date().toISOString();
	const results = await Promise.all(
		lanes.map((lane) => runVerificationLane(lane, args, repoDir, runCommand))
	);
	const content = VerificationFanoutReportContentSchema.parse({
		schemaVersion: 2,
		workItem: args.workItem,
		expectedFingerprint: args.expectedFingerprint,
		changeImpactResourceName: args.changeImpactResourceName,
		changedPaths: args.changedPaths,
		intentRouteDigest: args.intentRouteDigest,
		startedAt,
		completedAt: new Date().toISOString(),
		executionMode: 'parallel',
		results,
		passed: results.every((result) => result.status === 'passed')
	});
	return VerificationFanoutReportSchema.parse({
		...content,
		contentDigest: await createSupersDeterministicContractHash(content)
	});
}
