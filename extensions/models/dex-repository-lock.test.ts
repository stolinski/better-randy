import assert from 'node:assert/strict';

import {
	createDexRepositoryLock,
	DexRepositoryLockOwnershipError,
	dexRepositoryLockPath,
	DexRepositoryLockTimeoutError
} from './dex-repository-lock.ts';

async function withTempRepository(operation: (repository: string) => Promise<void>): Promise<void> {
	const repository = await Deno.makeTempDir({ prefix: 'dex-repository-lock-' });
	try {
		await operation(repository);
	} finally {
		await Deno.remove(repository, { recursive: true });
	}
}

Deno.test('repository lock serializes independent lock instances', async () => {
	await withTempRepository(async (repository) => {
		const firstLock = createDexRepositoryLock({ heartbeatIntervalMs: 5 });
		const secondLock = createDexRepositoryLock({ heartbeatIntervalMs: 5 });
		const events: string[] = [];
		let active = 0;
		let maxActive = 0;
		await Promise.all([
			firstLock.runExclusive(repository, async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				events.push('first-start');
				await new Promise((resolve) => setTimeout(resolve, 25));
				events.push('first-end');
				active -= 1;
			}),
			secondLock.runExclusive(repository, async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				events.push('second-start');
				events.push('second-end');
				active -= 1;
			})
		]);
		assert.equal(maxActive, 1);
		assert.ok(
			JSON.stringify(events) ===
				JSON.stringify(['first-start', 'first-end', 'second-start', 'second-end']) ||
				JSON.stringify(events) ===
					JSON.stringify(['second-start', 'second-end', 'first-start', 'first-end'])
		);
	});
});

Deno.test('repository lock bounds waiting for another owner', async () => {
	await withTempRepository(async (repository) => {
		const holder = createDexRepositoryLock({ heartbeatIntervalMs: 5 });
		const contender = createDexRepositoryLock({
			maxWaitMs: 15,
			pollIntervalMs: 2,
			heartbeatIntervalMs: 5
		});
		let release = (): void => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let acquired = (): void => undefined;
		const entered = new Promise<void>((resolve) => {
			acquired = resolve;
		});
		const holding = holder.runExclusive(repository, async () => {
			acquired();
			await gate;
		});
		await entered;
		await assert.rejects(
			() => contender.runExclusive(repository, () => Promise.resolve()),
			DexRepositoryLockTimeoutError
		);
		release();
		await holding;
	});
});

Deno.test('repository lock recovers stale metadata and heartbeats its lease', async () => {
	await withTempRepository(async (repository) => {
		await Deno.mkdir(`${repository}/.dex`, { recursive: true });
		const staleToken = crypto.randomUUID();
		await Deno.writeTextFile(
			dexRepositoryLockPath(repository),
			`${JSON.stringify({
				schemaVersion: 1,
				state: 'owned',
				ownerToken: staleToken,
				pid: 999_999,
				acquiredAt: '2026-08-05T19:00:00.000Z',
				heartbeatAt: '2026-08-05T19:00:00.000Z',
				recoveredStaleOwnerToken: null
			})}\n`
		);
		const lock = createDexRepositoryLock({
			heartbeatIntervalMs: 5,
			staleAfterMs: 10
		});
		await lock.runExclusive(repository, async () => {
			const initial = JSON.parse(await Deno.readTextFile(dexRepositoryLockPath(repository))) as {
				heartbeatAt: string;
				recoveredStaleOwnerToken: string | null;
			};
			assert.equal(initial.recoveredStaleOwnerToken, staleToken);
			await new Promise((resolve) => setTimeout(resolve, 15));
			const refreshed = JSON.parse(await Deno.readTextFile(dexRepositoryLockPath(repository))) as {
				heartbeatAt: string;
			};
			assert.notEqual(refreshed.heartbeatAt, initial.heartbeatAt);
		});
		const released = JSON.parse(await Deno.readTextFile(dexRepositoryLockPath(repository))) as {
			state: string;
		};
		assert.equal(released.state, 'released');
	});
});

Deno.test('repository lock refuses to clean up another owner token', async () => {
	await withTempRepository(async (repository) => {
		const lock = createDexRepositoryLock({ heartbeatIntervalMs: 60_000 });
		const foreignToken = crypto.randomUUID();
		await assert.rejects(
			() =>
				lock.runExclusive(repository, async () => {
					await Deno.writeTextFile(
						dexRepositoryLockPath(repository),
						`${JSON.stringify({
							schemaVersion: 1,
							state: 'owned',
							ownerToken: foreignToken,
							pid: Deno.pid,
							acquiredAt: new Date().toISOString(),
							heartbeatAt: new Date().toISOString(),
							recoveredStaleOwnerToken: null
						})}\n`
					);
				}),
			DexRepositoryLockOwnershipError
		);
		const retained = JSON.parse(await Deno.readTextFile(dexRepositoryLockPath(repository))) as {
			ownerToken: string;
		};
		assert.equal(retained.ownerToken, foreignToken);
	});
});
