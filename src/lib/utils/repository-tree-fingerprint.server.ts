import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export interface RepositoryTreeIdentity {
	sourceRevision: string;
	treeFingerprint: string;
}

export interface RepositoryUntrackedContent {
	path: string;
	content: Uint8Array;
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
	const source = typeof value === 'string' ? textEncoder.encode(value) : value;
	const bytes = new Uint8Array(source.byteLength);
	bytes.set(source);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseNulPaths(output: Uint8Array): string[] {
	const decoded = textDecoder.decode(output);
	if (decoded.length === 0) return [];
	const records = decoded.split('\0');
	if (records.pop() !== '') throw new TypeError('Git path output must be NUL-terminated');
	if (records.some((path) => !path || path.startsWith('/') || path.split('/').includes('..'))) {
		throw new TypeError('Git returned an unsafe project-relative path');
	}
	return records;
}

/** Pure fingerprint recipe shared with the repo-audit model. */
export async function createRepositoryTreeFingerprint(input: {
	head: string;
	unstagedDiff: Uint8Array;
	stagedDiff: Uint8Array;
	status: Uint8Array;
	untracked: readonly RepositoryUntrackedContent[];
}): Promise<string> {
	const untracked = await Promise.all(
		[...input.untracked]
			.sort((left, right) => left.path.localeCompare(right.path))
			.map(async (entry) => ({ path: entry.path, contentHash: await sha256Hex(entry.content) }))
	);
	return sha256Hex(
		JSON.stringify({
			head: input.head,
			unstagedDiff: await sha256Hex(input.unstagedDiff),
			stagedDiff: await sha256Hex(input.stagedDiff),
			status: await sha256Hex(input.status),
			untracked
		})
	);
}

async function runGit(repoDir: string, args: string[]): Promise<Uint8Array> {
	const { stdout } = await execFileAsync('git', args, {
		cwd: repoDir,
		encoding: 'buffer',
		maxBuffer: 64 * 1024 * 1024
	});
	return new Uint8Array(stdout);
}

function normalizeRepositoryScopePaths(scopedPaths: readonly string[]): string[] {
	const paths = [...new Set(scopedPaths)].sort();
	if (
		paths.length === 0 ||
		paths.some((path) => !path || path.startsWith('/') || path.split('/').includes('..'))
	) {
		throw new TypeError('Scoped repository paths must be safe project-relative paths');
	}
	return paths;
}

async function readRepositoryUntrackedContent(
	repoDir: string,
	untrackedOutput: Uint8Array
): Promise<RepositoryUntrackedContent[]> {
	return Promise.all(
		parseNulPaths(untrackedOutput)
			.sort()
			.map(async (path) => ({
				path,
				content: new Uint8Array(await readFile(`${repoDir}/${path}`))
			}))
	);
}

/** Content-sensitive HEAD + staged/unstaged/status/untracked identity for local verification. */
export async function computeRepositoryTreeFingerprint(
	repoDir: string
): Promise<RepositoryTreeIdentity> {
	const [headOutput, unstagedDiff, stagedDiff, status, untrackedOutput] = await Promise.all([
		runGit(repoDir, ['rev-parse', '--verify', 'HEAD']),
		runGit(repoDir, ['diff', '--binary', '--no-ext-diff', '--no-textconv']),
		runGit(repoDir, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']),
		runGit(repoDir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
		runGit(repoDir, ['ls-files', '--others', '--exclude-standard', '-z'])
	]);
	const sourceRevision = textDecoder.decode(headOutput).trim();
	if (!/^[0-9a-f]{40,64}$/.test(sourceRevision)) throw new TypeError('Invalid Git source revision');
	const untracked = await readRepositoryUntrackedContent(repoDir, untrackedOutput);
	return {
		sourceRevision,
		treeFingerprint: await createRepositoryTreeFingerprint({
			head: sourceRevision,
			unstagedDiff,
			stagedDiff,
			status,
			untracked
		})
	};
}

/** Content-sensitive identity limited to the sealed paths owned by one change. */
export async function computeRepositoryScopedTreeFingerprint(
	repoDir: string,
	scopedPaths: readonly string[]
): Promise<RepositoryTreeIdentity> {
	const paths = normalizeRepositoryScopePaths(scopedPaths);
	const pathspec = ['--', ...paths];
	const [headOutput, committedTree, unstagedDiff, stagedDiff, status, untrackedOutput] =
		await Promise.all([
			runGit(repoDir, ['rev-parse', '--verify', 'HEAD']),
			runGit(repoDir, ['ls-tree', '-r', '-z', 'HEAD', ...pathspec]),
			runGit(repoDir, ['diff', '--binary', '--no-ext-diff', '--no-textconv', ...pathspec]),
			runGit(repoDir, [
				'diff',
				'--cached',
				'--binary',
				'--no-ext-diff',
				'--no-textconv',
				...pathspec
			]),
			runGit(repoDir, ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...pathspec]),
			runGit(repoDir, ['ls-files', '--others', '--exclude-standard', '-z', ...pathspec])
		]);
	const sourceRevision = textDecoder.decode(headOutput).trim();
	if (!/^[0-9a-f]{40,64}$/.test(sourceRevision)) throw new TypeError('Invalid Git source revision');
	const scopedHead = `scoped-paths-v1\0${textDecoder.decode(committedTree)}`;
	const untracked = await readRepositoryUntrackedContent(repoDir, untrackedOutput);
	return {
		sourceRevision,
		treeFingerprint: await createRepositoryTreeFingerprint({
			head: scopedHead,
			unstagedDiff,
			stagedDiff,
			status,
			untracked
		})
	};
}
