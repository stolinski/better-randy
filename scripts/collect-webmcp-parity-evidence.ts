// Gathers what the bidirectional GUI ↔ WebMCP parity gate needs to know about
// the repository, for `src/lib/platform/webmcp-operation-parity.ts` to judge.
//
// Three pieces of evidence, each read from the tree rather than declared:
//
//  1. GUI transport — for every `guiSurface` an inventory row names, whether the
//     component exists and whether a SvelteKit route still reaches it. The
//     reachability walk is what makes a stale anchor visible: a component that
//     survives on disk after nothing renders it would pass an existence check
//     while its half of the parity promise is gone.
//  2. Shared operation — which module claims each row, read from the
//     `requireCompositionOperationRow('<id>')` call sites in the operation layer.
//     Every operation names its row there, so the claim is the implementation
//     rather than a second list that can drift from one.
//  3. Agent transport — the tools this build actually registers, supplied by the
//     caller from `listWebmcpToolDefinitions()`, joined to the module that
//     declares each one. Taking the registered set as authoritative is what makes
//     a family whose definitions never reach the aggregate list show up as a
//     missing agent transport instead of passing on a source mention.
//
// Import resolution covers the static `$lib/` and relative specifiers the app
// uses. A dynamic Pipeline import built from a template literal is deliberately
// not followed — no GUI surface is loaded that way, and guessing at a computed
// specifier would report reachability the walk cannot actually prove.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { WEBMCP_OPERATION_INVENTORY } from '../src/lib/platform/webmcp-operation-inventory.ts';

import type { WebmcpParityEvidence } from '../src/lib/platform/webmcp-operation-parity.ts';

/** The operation layer: every composition operation module, tests excluded. */
/** Operation modules: the composition families, and the User Pack store operations (ADR-0055). */
const OPERATION_MODULE_PATTERN = /^(?:composition|user-pack)-.*(?<!\.test)\.ts$/;

/** The WebMCP tool layer: one module per operation family. */
const TOOL_MODULE_PATTERN = /^webmcp-.*-tools\.ts$/;

const PLATFORM_DIRECTORY = 'src/lib/platform';

/** The row a module implements, named at the call site that resolves it. */
const OPERATION_CLAIM_PATTERN = /requireCompositionOperationRow\(\s*'([^']+)'\s*\)/g;

/** The row a tool definition runs, named in the definition literal. */
const TOOL_CLAIM_PATTERN = /operationId:\s*'([^']+)'/g;

/** Static import and re-import specifiers, the edges of the component graph. */
const IMPORT_SPECIFIER_PATTERN = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;

const WALKED_EXTENSIONS = ['.ts', '.js', '.svelte'];

export interface CollectWebmcpParityEvidenceOptions {
	repoRoot: string;
	/** The operation ids `listWebmcpToolDefinitions()` returns for this build. */
	registeredOperationIds: readonly string[];
}

async function listSourceFiles(repoRoot: string): Promise<string[]> {
	const entries = await readdir(resolve(repoRoot, 'src'), {
		withFileTypes: true,
		recursive: true
	});
	return entries
		.filter(
			(entry) =>
				entry.isFile() && WALKED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
		)
		.map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)));
}

function isFile(path: string): boolean {
	return existsSync(path) && statSync(path).isFile();
}

/**
 * The repo-relative file a specifier names, or null when it leaves the project.
 * `$lib/` and relative specifiers resolve the way Vite resolves them, including
 * the extensionless and `.svelte.ts` forms the codebase uses.
 */
function resolveImportSpecifier(
	specifier: string,
	fromFile: string,
	repoRoot: string
): string | null {
	let base: string;
	if (specifier.startsWith('$lib/')) {
		base = resolve(repoRoot, 'src/lib', specifier.slice('$lib/'.length));
	} else if (specifier.startsWith('./') || specifier.startsWith('../')) {
		base = resolve(dirname(resolve(repoRoot, fromFile)), specifier);
	} else {
		return null;
	}

	for (const candidate of [
		base,
		`${base}.ts`,
		`${base}.js`,
		`${base}.svelte`,
		resolve(base, 'index.ts')
	]) {
		if (isFile(candidate)) return relative(repoRoot, candidate);
	}
	return null;
}

/**
 * Every source file a SvelteKit route entry reaches. Entries are the `+`-prefixed
 * files under `src/routes`, which is exactly the set the router mounts.
 */
function collectRouteReachableFiles(repoRoot: string, sourceFiles: readonly string[]): Set<string> {
	const importsByFile = new Map<string, string[]>();
	for (const file of sourceFiles) {
		const source = readFileSync(resolve(repoRoot, file), 'utf8');
		const targets = new Set<string>();
		for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
			const resolved = resolveImportSpecifier(match[1] ?? match[2], file, repoRoot);
			if (resolved) targets.add(resolved);
		}
		importsByFile.set(file, [...targets]);
	}

	const pending = sourceFiles.filter(
		(file) => file.startsWith('src/routes/') && file.split('/').at(-1)?.startsWith('+') === true
	);
	const reached = new Set<string>();
	while (pending.length > 0) {
		const file = pending.pop();
		if (file === undefined || reached.has(file)) continue;
		reached.add(file);
		for (const target of importsByFile.get(file) ?? []) {
			if (!reached.has(target)) pending.push(target);
		}
	}
	return reached;
}

async function collectClaims(
	repoRoot: string,
	directory: string,
	modulePattern: RegExp,
	claimPattern: RegExp
): Promise<{ operationId: string; module: string }[]> {
	const entries = await readdir(resolve(repoRoot, directory), { withFileTypes: true });
	const claims: { operationId: string; module: string }[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !modulePattern.test(entry.name)) continue;
		const modulePath = `${directory}/${entry.name}`;
		const source = readFileSync(resolve(repoRoot, modulePath), 'utf8');
		const claimed = new Set([...source.matchAll(claimPattern)].map((match) => match[1]));
		for (const operationId of claimed) claims.push({ operationId, module: modulePath });
	}
	return claims;
}

/**
 * Read the repository and return the evidence the parity gate judges. Throws
 * rather than reporting when the tree cannot be read at all — an unreadable
 * source directory is a broken run, not a parity finding.
 */
export async function collectWebmcpParityEvidence({
	repoRoot,
	registeredOperationIds
}: CollectWebmcpParityEvidenceOptions): Promise<WebmcpParityEvidence> {
	const sourceFiles = await listSourceFiles(repoRoot);
	if (sourceFiles.length === 0) {
		throw new Error(`collect-webmcp-parity-evidence: no source files under ${repoRoot}/src`);
	}

	const reachable = collectRouteReachableFiles(repoRoot, sourceFiles);
	const guiBindings = [...new Set(WEBMCP_OPERATION_INVENTORY.map((row) => row.guiSurface))].map(
		(guiSurface) => ({
			guiSurface,
			exists: isFile(resolve(repoRoot, guiSurface)),
			reachableFromRoute: reachable.has(guiSurface)
		})
	);

	const operationBindings = await collectClaims(
		repoRoot,
		PLATFORM_DIRECTORY,
		OPERATION_MODULE_PATTERN,
		OPERATION_CLAIM_PATTERN
	);

	const toolDeclarations = await collectClaims(
		repoRoot,
		PLATFORM_DIRECTORY,
		TOOL_MODULE_PATTERN,
		TOOL_CLAIM_PATTERN
	);
	const agentBindings = registeredOperationIds.flatMap((operationId) => {
		const modules = toolDeclarations
			.filter((declaration) => declaration.operationId === operationId)
			.map((declaration) => declaration.module);
		return modules.length > 0
			? modules.map((module) => ({ operationId, module }))
			: [{ operationId, module: `${PLATFORM_DIRECTORY}/webmcp-tool-definitions.ts` }];
	});

	return { agentBindings, operationBindings, guiBindings };
}
