import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
	isSweptExportDirectoryName,
	readGfxEnvironmentValue,
	SWEPT_EXPORT_DIRECTORY_PREFIXES
} from '../src/lib/utils/legacy-supers-compatibility.ts';

const execFileAsync = promisify(execFile);
const APP_URL = readGfxEnvironmentValue(process.env, 'GFX_URL') ?? 'http://localhost:7263';
const FRAME_PATH = resolve(process.argv[2] ?? '');
const CYCLES = Number(readGfxEnvironmentValue(process.env, 'GFX_CANCELLATION_CYCLES') ?? 3);

if (!process.argv[2]) {
	throw new Error('Usage: node scripts/probe-export-session-cancellation.mjs <frame.png>');
}
if (!Number.isInteger(CYCLES) || CYCLES < 1) {
	throw new Error('GFX_CANCELLATION_CYCLES must be a positive integer.');
}
if (!(await stat(FRAME_PATH)).isFile()) throw new Error(`Frame does not exist: ${FRAME_PATH}`);

async function processRows() {
	const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=,comm=']);
	return stdout
		.trim()
		.split('\n')
		.map((line) => {
			const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
			return match
				? { pid: Number(match[1]), parentPid: Number(match[2]), rssKiB: Number(match[3]), command: match[4] }
				: null;
		})
		.filter((row) => row !== null);
}

async function serverProcess() {
	const { stdout } = await execFileAsync('lsof', [
		'-nP',
		'-t',
		'-iTCP:7263',
		'-sTCP:LISTEN'
	]);
	const pid = Number(stdout.trim().split('\n')[0]);
	const row = (await processRows()).find((candidate) => candidate.pid === pid);
	if (!row) throw new Error(`Could not inspect Supers server process ${pid}.`);
	return row;
}

async function ffmpegChildren(parentPid) {
	return (await processRows()).filter(
		(row) => row.parentPid === parentPid && basename(row.command).startsWith('ffmpeg')
	);
}

// Both namespaces' prefixes (ADR-0053): a directory the running build no longer
// writes is still one the probe must see it clean up.
async function exportDirectories() {
	return (await readdir(tmpdir())).filter(isSweptExportDirectoryName).sort();
}

function sessionDirectoryNames(sessionId) {
	return SWEPT_EXPORT_DIRECTORY_PREFIXES.map((prefix) => `${prefix}${sessionId}`);
}

async function waitForCleanup(sessionId, parentPid) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		const [children, directories] = await Promise.all([
			ffmpegChildren(parentPid),
			exportDirectories()
		]);
		if (
			children.every((child) => !activeEncoderPids.has(child.pid)) &&
			sessionDirectoryNames(sessionId).every((name) => !directories.includes(name))
		) {
			return;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
	}
	throw new Error(`Export session ${sessionId} left an encoder or temporary directory behind.`);
}

const frame = await readFile(FRAME_PATH);
const serverBefore = await serverProcess();
const baselineEncoderPids = new Set((await ffmpegChildren(serverBefore.pid)).map((child) => child.pid));
const baselineDirectories = new Set(await exportDirectories());
const rssKiB = [serverBefore.rssKiB];
const cycles = [];
let activeEncoderPids = new Set();

for (let cycle = 0; cycle < CYCLES; cycle += 1) {
	const createResponse = await fetch(`${APP_URL}/api/export/sessions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ format: 'webm', fps: 60, frameCount: 10_000, opaque: true, audioBytes: 0 })
	});
	if (!createResponse.ok) throw new Error(`Session creation failed: ${await createResponse.text()}`);
	const session = await createResponse.json();
	const frameResponse = await fetch(`${APP_URL}${session.frameUrlTemplate.replace('{frame}', '0')}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'image/png' },
		body: frame
	});
	if (!frameResponse.ok) throw new Error(`Frame upload failed: ${await frameResponse.text()}`);

	activeEncoderPids = new Set(
		(await ffmpegChildren(serverBefore.pid))
			.filter((child) => !baselineEncoderPids.has(child.pid))
			.map((child) => child.pid)
	);
	if (activeEncoderPids.size !== 1) {
		throw new Error(`Expected one session encoder, observed ${activeEncoderPids.size}.`);
	}
	const duringRssKiB = (await serverProcess()).rssKiB;
	const cancelResponse = await fetch(`${APP_URL}${session.cancelUrl}`, { method: 'DELETE' });
	if (cancelResponse.status !== 204) throw new Error(`Cancellation failed: ${cancelResponse.status}.`);
	await waitForCleanup(session.sessionId, serverBefore.pid);
	const missingResponse = await fetch(`${APP_URL}${session.cancelUrl}`, { method: 'DELETE' });
	if (missingResponse.status !== 204) {
		throw new Error(`Idempotent cancellation failed: ${missingResponse.status}.`);
	}
	const afterRssKiB = (await serverProcess()).rssKiB;
	rssKiB.push(afterRssKiB);
	cycles.push({
		cycle: cycle + 1,
		sessionId: session.sessionId,
		encoderPids: [...activeEncoderPids],
		duringRssKiB,
		afterRssKiB,
		workDirectoryRemoved: true,
		encoderExited: true
	});
}

const finalDirectories = await exportDirectories();
const unexpectedDirectories = finalDirectories.filter((entry) => !baselineDirectories.has(entry));
const finalEncoders = (await ffmpegChildren(serverBefore.pid)).filter(
	(child) => !baselineEncoderPids.has(child.pid)
);
const result = {
	verdict: unexpectedDirectories.length === 0 && finalEncoders.length === 0 ? 'pass' : 'fail',
	serverPid: serverBefore.pid,
	framePath: FRAME_PATH,
	rssKiB,
	rssDeltaKiB: rssKiB.at(-1) - rssKiB[0],
	cycles,
	unexpectedDirectories,
	remainingEncoderPids: finalEncoders.map((child) => child.pid)
};
console.log(JSON.stringify(result, null, 2));
if (result.verdict !== 'pass') process.exitCode = 1;
