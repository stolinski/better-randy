import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The working tree's current commit, as a Sentry release string
 * (`gfx@<sha>`, matching each post-commit-registered release — see
 * docs/sentry-dev-flow.md § Versions).
 *
 * ADR-0053 `accept-old / write-new`: releases registered before the namespace
 * rename carry `supers@<sha>` and stay queryable forever; only new releases
 * take the GFX spelling. The Sentry project the events land in is a separate,
 * frozen value — see the ADR's telemetry rows.
 *
 * Resolved from `.git` on every call but cached against the HEAD and branch
 * ref mtimes, so a long-running dev server attributes events to the commit
 * that actually produced them — the process may be days older than the code
 * it serves. (HEAD's mtime alone only moves on checkout; a commit on the same
 * branch moves the ref file, so both feed the cache key.)
 */

const GIT_DIR = join(process.cwd(), '.git');

let cachedRelease: string | undefined;
let cachedStateKey = '';

function mtimeOrZero(path: string): number {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}

function readCurrentCommitSha(head: string): string {
	if (!head.startsWith('ref: ')) {
		return head; // detached HEAD holds the sha directly
	}
	const ref = head.slice('ref: '.length);
	try {
		return readFileSync(join(GIT_DIR, ref), 'utf8').trim();
	} catch {
		// The ref may live in packed-refs (post-gc) — scan for it there.
		const packed = readFileSync(join(GIT_DIR, 'packed-refs'), 'utf8');
		for (const line of packed.split('\n')) {
			if (line.endsWith(` ${ref}`)) {
				return line.slice(0, 40);
			}
		}
		throw new Error(`Ref ${ref} not found in packed-refs.`);
	}
}

export function resolveGitRelease(): string | undefined {
	try {
		const head = readFileSync(join(GIT_DIR, 'HEAD'), 'utf8').trim();
		const refPath = head.startsWith('ref: ') ? join(GIT_DIR, head.slice('ref: '.length)) : null;
		const stateKey = [
			mtimeOrZero(join(GIT_DIR, 'HEAD')),
			refPath ? mtimeOrZero(refPath) : 'detached',
			mtimeOrZero(join(GIT_DIR, 'packed-refs'))
		].join(':');

		if (cachedRelease !== undefined && stateKey === cachedStateKey) {
			return cachedRelease;
		}

		let sha: string;
		try {
			sha = readCurrentCommitSha(head);
		} catch {
			// Unusual .git layouts (worktrees, future formats) — one subprocess
			// per commit/checkout is still effectively free.
			sha = execSync('git rev-parse HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim();
		}
		cachedRelease = `gfx@${sha}`;
		cachedStateKey = stateKey;
		return cachedRelease;
	} catch {
		// Not a git checkout (or unreadable) — events just carry no release.
		return undefined;
	}
}
