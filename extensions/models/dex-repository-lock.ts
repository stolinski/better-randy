/**
 * Cross-process repository lock shared by every Swamp adapter that writes Dex.
 *
 * The OS-backed file lock is authoritative. The JSON body is a diagnostic
 * lease used for heartbeats, stale-owner recovery, and ownership-safe cleanup.
 * This module never reads or writes Dex's task store.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

const LOCK_SCHEMA_VERSION = 1;
const DEFAULT_MAX_WAIT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1_000;
const DEFAULT_STALE_AFTER_MS = 5_000;
const LOCK_FILE_NAME = "swamp-repository-write.lock";

const OwnedLockRecordSchema = z.strictObject({
  schemaVersion: z.literal(LOCK_SCHEMA_VERSION),
  state: z.literal("owned"),
  ownerToken: z.string().uuid(),
  pid: z.number().int().nonnegative(),
  acquiredAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
  recoveredStaleOwnerToken: z.string().uuid().nullable(),
});

const ReleasedLockRecordSchema = z.strictObject({
  schemaVersion: z.literal(LOCK_SCHEMA_VERSION),
  state: z.literal("released"),
  lastOwnerToken: z.string().uuid(),
  releasedAt: z.string().datetime(),
});

const LockRecordSchema = z.discriminatedUnion("state", [
  OwnedLockRecordSchema,
  ReleasedLockRecordSchema,
]);

type LockRecord = z.infer<typeof LockRecordSchema>;
type OwnedLockRecord = z.infer<typeof OwnedLockRecordSchema>;

export interface DexRepositoryLock {
  runExclusive<T>(repoDir: string, operation: () => Promise<T>): Promise<T>;
}

export type DexRepositoryLockOptions = {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  staleAfterMs?: number;
  now?: () => Date;
  ownerToken?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class DexRepositoryLockTimeoutError extends Error {
  constructor(lockPath: string, maxWaitMs: number) {
    void lockPath;
    super(`Timed out after ${maxWaitMs}ms waiting for the Dex repository lock`);
    this.name = "DexRepositoryLockTimeoutError";
  }
}

export class DexRepositoryLockOwnershipError extends Error {
  constructor(lockPath: string) {
    void lockPath;
    super("Dex repository lock ownership changed before cleanup");
    this.name = "DexRepositoryLockOwnershipError";
  }
}

export class DexRepositoryLockPathError extends Error {
  constructor() {
    super("Dex repository lock path is not a safe repository-local file");
    this.name = "DexRepositoryLockPathError";
  }
}

/** Stable lock artifact path. The Dex task store is never accessed. */
export function dexRepositoryLockPath(repoDir: string): string {
  return `${repoDir}/.dex/${LOCK_FILE_NAME}`;
}

function sameFileIdentity(left: Deno.FileInfo, right: Deno.FileInfo): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function openVerifiedLockFile(
  repoDir: string,
): Promise<{ file: Deno.FsFile; lockPath: string }> {
  const canonicalRepository = await Deno.realPath(repoDir);
  const dexDirectory = `${canonicalRepository}/.dex`;
  const directoryInfo = await Deno.lstat(dexDirectory);
  if (!directoryInfo.isDirectory || directoryInfo.isSymlink) {
    throw new DexRepositoryLockPathError();
  }
  if (await Deno.realPath(dexDirectory) !== dexDirectory) {
    throw new DexRepositoryLockPathError();
  }

  const lockPath = `${dexDirectory}/${LOCK_FILE_NAME}`;
  let file: Deno.FsFile;
  try {
    file = await Deno.open(lockPath, {
      createNew: true,
      read: true,
      write: true,
      mode: 0o600,
    });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    file = await Deno.open(lockPath, { read: true, write: true });
  }

  try {
    const [openedInfo, pathInfo, canonicalLockPath, currentDexDirectory] =
      await Promise.all([
        file.stat(),
        Deno.lstat(lockPath),
        Deno.realPath(lockPath),
        Deno.realPath(dexDirectory),
      ]);
    if (
      !openedInfo.isFile || !pathInfo.isFile || pathInfo.isSymlink ||
      !sameFileIdentity(openedInfo, pathInfo) ||
      canonicalLockPath !== lockPath || currentDexDirectory !== dexDirectory
    ) {
      throw new DexRepositoryLockPathError();
    }
    return { file, lockPath };
  } catch (error) {
    file.close();
    throw error;
  }
}

async function readLockRecord(file: Deno.FsFile): Promise<LockRecord | null> {
  await file.seek(0, Deno.SeekMode.Start);
  const bytes: Uint8Array[] = [];
  const buffer = new Uint8Array(1024);
  while (true) {
    const count = await file.read(buffer);
    if (count === null) break;
    bytes.push(buffer.slice(0, count));
  }
  const length = bytes.reduce((total, chunk) => total + chunk.length, 0);
  if (length === 0) return null;
  const content = new Uint8Array(length);
  let offset = 0;
  for (const chunk of bytes) {
    content.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return LockRecordSchema.parse(
      JSON.parse(new TextDecoder().decode(content)),
    );
  } catch {
    return null;
  }
}

async function writeLockRecord(
  file: Deno.FsFile,
  record: LockRecord,
): Promise<void> {
  const content = new TextEncoder().encode(
    `${JSON.stringify(LockRecordSchema.parse(record))}\n`,
  );
  await file.truncate(0);
  await file.seek(0, Deno.SeekMode.Start);
  let offset = 0;
  while (offset < content.length) {
    offset += await file.write(content.subarray(offset));
  }
  await file.sync();
}

function isStale(
  record: LockRecord | null,
  now: Date,
  staleAfterMs: number,
): boolean {
  return (
    record?.state === "owned" &&
    now.getTime() - new Date(record.heartbeatAt).getTime() >= staleAfterMs
  );
}

async function acquireFileLock(
  file: Deno.FsFile,
  lockPath: string,
  maxWaitMs: number,
  pollIntervalMs: number,
  now: () => Date,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const deadline = now().getTime() + maxWaitMs;
  while (!(await file.tryLock(true))) {
    if (now().getTime() >= deadline) {
      throw new DexRepositoryLockTimeoutError(lockPath, maxWaitMs);
    }
    await sleep(pollIntervalMs);
  }
}

async function refreshHeartbeat(
  file: Deno.FsFile,
  lockPath: string,
  ownerToken: string,
  now: () => Date,
): Promise<void> {
  const current = await readLockRecord(file);
  if (current?.state !== "owned" || current.ownerToken !== ownerToken) {
    throw new DexRepositoryLockOwnershipError(lockPath);
  }
  await writeLockRecord(file, {
    ...current,
    heartbeatAt: now().toISOString(),
  });
}

async function cleanupOwnedLock(
  file: Deno.FsFile,
  lockPath: string,
  ownerToken: string,
  now: () => Date,
): Promise<void> {
  const current = await readLockRecord(file);
  if (current?.state !== "owned" || current.ownerToken !== ownerToken) {
    throw new DexRepositoryLockOwnershipError(lockPath);
  }
  await writeLockRecord(file, {
    schemaVersion: LOCK_SCHEMA_VERSION,
    state: "released",
    lastOwnerToken: ownerToken,
    releasedAt: now().toISOString(),
  });
}

/** Create the production OS-backed Dex repository lock. */
export function createDexRepositoryLock(
  options: DexRepositoryLockOptions = {},
): DexRepositoryLock {
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ??
    DEFAULT_HEARTBEAT_INTERVAL_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = options.now ?? (() => new Date());
  const ownerToken = options.ownerToken ?? (() => crypto.randomUUID());
  const sleep = options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));

  return {
    runExclusive: async <T>(
      repoDir: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const { file, lockPath } = await openVerifiedLockFile(repoDir);
      let isLocked = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      let heartbeatTail = Promise.resolve();
      const token = ownerToken();
      try {
        await acquireFileLock(
          file,
          lockPath,
          maxWaitMs,
          pollIntervalMs,
          now,
          sleep,
        );
        isLocked = true;
        const acquiredAt = now();
        const previous = await readLockRecord(file);
        const owned: OwnedLockRecord = {
          schemaVersion: LOCK_SCHEMA_VERSION,
          state: "owned",
          ownerToken: token,
          pid: Deno.pid,
          acquiredAt: acquiredAt.toISOString(),
          heartbeatAt: acquiredAt.toISOString(),
          recoveredStaleOwnerToken:
            isStale(previous, acquiredAt, staleAfterMs) &&
              previous?.state === "owned"
              ? previous.ownerToken
              : null,
        };
        await writeLockRecord(file, owned);
        heartbeatTimer = setInterval(() => {
          heartbeatTail = heartbeatTail.then(() =>
            refreshHeartbeat(file, lockPath, token, now)
          );
        }, heartbeatIntervalMs);

        let result: T | undefined;
        let operationError: unknown;
        try {
          result = await operation();
        } catch (error) {
          operationError = error;
        }
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        let cleanupError: unknown;
        try {
          await heartbeatTail;
          await cleanupOwnedLock(file, lockPath, token, now);
        } catch (error) {
          cleanupError = error;
        }
        if (operationError !== undefined) throw operationError;
        if (cleanupError !== undefined) throw cleanupError;
        return result as T;
      } finally {
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
        if (isLocked) await file.unlock();
        file.close();
      }
    },
  };
}

/** Test-only lock that preserves dependency shape without touching disk. */
export const PASSTHROUGH_DEX_REPOSITORY_LOCK: DexRepositoryLock = {
  runExclusive: <T>(
    _repoDir: string,
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
};

export const DEFAULT_DEX_REPOSITORY_LOCK = createDexRepositoryLock();
