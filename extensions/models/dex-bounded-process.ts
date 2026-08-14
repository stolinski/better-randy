/** Bounded non-interactive subprocess boundary shared by typed Dex adapters.
 * @module
 */
const DEX_COMMAND_TIMEOUT_MS = 30_000;
const DEX_COMMAND_MAX_OUTPUT_BYTES = 1024 * 1024;
const textEncoder = new TextEncoder();

export class DexCommandBoundaryError extends Error {
  constructor(readonly boundary: "timeout" | "output-limit") {
    super("Dex command exceeded a bounded execution limit");
    this.name = "DexCommandBoundaryError";
  }
}

export type BoundedDexProcessResult = {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
};

async function readBoundedProcessStream(
  stream: ReadableStream<Uint8Array>,
  controller: AbortController,
  maxOutputBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxOutputBytes) {
        controller.abort();
        throw new DexCommandBoundaryError("output-limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function runBoundedDexProcess(
  cwd: string,
  args: readonly string[],
  stdinText: string | null,
  options: {
    executable?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
  } = {},
): Promise<BoundedDexProcessResult> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEX_COMMAND_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEX_COMMAND_MAX_OUTPUT_BYTES;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const child = new Deno.Command(options.executable ?? "dex", {
    args: [...args],
    cwd,
    stdin: stdinText === null ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    signal: controller.signal,
  }).spawn();
  const statusPromise = child.status;
  const stdoutPromise = readBoundedProcessStream(
    child.stdout,
    controller,
    maxOutputBytes,
  );
  const stderrPromise = readBoundedProcessStream(
    child.stderr,
    controller,
    maxOutputBytes,
  );
  try {
    if (stdinText !== null) {
      const writer = child.stdin.getWriter();
      try {
        await writer.write(textEncoder.encode(stdinText));
      } finally {
        await writer.close();
      }
    }
    const [status, stdout, stderr] = await Promise.all([
      statusPromise,
      stdoutPromise,
      stderrPromise,
    ]);
    if (timedOut) throw new DexCommandBoundaryError("timeout");
    return { code: status.code, stdout, stderr };
  } catch (error) {
    controller.abort();
    await statusPromise.catch(() => undefined);
    if (timedOut) throw new DexCommandBoundaryError("timeout");
    if (error instanceof DexCommandBoundaryError) throw error;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
