// Bind every acceptance claim for this local release to one release identity
// (ADR-0052, ADR-0053, ADR-0054).
//
//   pnpm seal:release-acceptance
//
// Reads the artifacts the verifiers already wrote, checks that they all measured
// the commit this tree is on, and writes docs/release-acceptance-manifest.json.
// It runs nothing itself: an artifact left over from an earlier build is the
// thing this exists to catch, so refreshing one silently would defeat it.
//
// Exits non-zero, naming every stale artifact, failed check, unbound subject and
// outstanding human decision, whenever the release cannot be sealed. That is the
// ordinary outcome mid-epic — `sealed: true` means one commit was shown to pass
// everything at once, which is a rarer and stronger claim than seven green files.
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { format, resolveConfig } from 'prettier';

import type { ReleaseAcceptanceEvidenceDocument } from '../src/lib/platform/release-acceptance-manifest.ts';
import { computeRepositoryTreeFingerprint } from '../src/lib/utils/repository-tree-fingerprint.server.ts';
import { registerGfxRuntimeModuleHooks } from './gfx-runtime-module-hooks.ts';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
registerGfxRuntimeModuleHooks(repoRoot);

const {
	RELEASE_ACCEPTANCE_EVIDENCE_INVENTORY,
	RELEASE_ACCEPTANCE_HUMAN_DECISIONS,
	sealReleaseAcceptanceManifest
} = await import('../src/lib/platform/release-acceptance-manifest.ts');

const MANIFEST_PATH = resolve(
	process.env.GFX_RELEASE_ACCEPTANCE_MANIFEST ??
		join(repoRoot, 'docs/release-acceptance-manifest.json')
);

/**
 * Paths that differ from the release commit, as `git status` reports them.
 *
 * The manifest is the seal's own output, so it is never counted: requiring a
 * committed manifest before the manifest can be written is a seal that can only
 * ever fail once, for itself.
 */
async function readUncommittedPaths(manifestRelativePath: string): Promise<string[]> {
	const { stdout } = await execFileAsync(
		'git',
		['status', '--porcelain=v1', '-z', '--untracked-files=all'],
		{ cwd: repoRoot, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }
	);
	const records = new TextDecoder().decode(new Uint8Array(stdout)).split('\0');
	if (records.pop() !== '' && records.length > 0) {
		throw new TypeError('Git status output must be NUL-terminated');
	}
	const paths: string[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (record.length < 4) continue;
		// A rename or copy is reported as two records: the new path, then the old.
		if (record.startsWith('R') || record.startsWith('C')) index += 1;
		paths.push(record.slice(3));
	}
	return paths.filter((path) => path !== manifestRelativePath);
}

/** One artifact as JSON, or `null` when its producer has never written it. */
async function readEvidenceDocument(evidencePath: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(resolve(repoRoot, evidencePath), 'utf8');
	} catch {
		return null;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new TypeError(`${evidencePath} is not readable JSON`, { cause: error });
	}
}

const manifestRelativePath = relative(repoRoot, MANIFEST_PATH).split('\\').join('/');
const identity = await computeRepositoryTreeFingerprint(repoRoot);
const evidence: ReleaseAcceptanceEvidenceDocument[] = await Promise.all(
	RELEASE_ACCEPTANCE_EVIDENCE_INVENTORY.map(async (row) => ({
		claimId: row.claimId,
		document: await readEvidenceDocument(row.evidencePath)
	}))
);

const manifest = await sealReleaseAcceptanceManifest({
	releaseIdentity: identity,
	sealedAt: new Date().toISOString(),
	uncommittedPaths: await readUncommittedPaths(manifestRelativePath),
	evidence,
	humanDecisions: RELEASE_ACCEPTANCE_HUMAN_DECISIONS
});

await mkdir(dirname(MANIFEST_PATH), { recursive: true });
const prettierConfig = (await resolveConfig(MANIFEST_PATH)) ?? {};
await writeFile(
	MANIFEST_PATH,
	await format(JSON.stringify(manifest), { ...prettierConfig, parser: 'json' })
);

console.log(`Release ${manifest.releaseIdentity.sourceRevision}`);
for (const claim of manifest.claims) {
	const measured = claim.claimedReleaseRevision ?? 'no release stated';
	console.log(
		`  ${claim.accepted ? 'bound  ' : 'REJECT '} ${claim.claimId} — ${measured} — ${claim.objectiveOutcome}`
	);
}
for (const rejection of manifest.rejections) {
	console.log(`  ${rejection.code}: ${rejection.detail}`);
}
console.log(`\nManifest written to ${manifestRelativePath} (${manifest.manifestDigest})`);

if (!manifest.sealed) {
	console.error(
		`\nThis release is not sealed: ${manifest.rejections.length} rejection(s) above must clear first.`
	);
	process.exitCode = 1;
} else {
	console.log('\nSealed: every acceptance claim resolves to this release.');
}
