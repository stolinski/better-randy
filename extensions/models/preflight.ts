/**
 * Supers session preflight — the environment facts every agent session
 * otherwise re-probes by hand: is the dev server up, is the CDP capture
 * Chrome running WITH the CanvasDrawElement flag (an unflagged browser
 * captures blank canvases), and which built-in preset slugs are currently
 * shadowed by user-composition forks (captures without `?source=builtin`
 * photograph the fork, not the corpus preset).
 *
 * The flag cannot be read from `/json/version` — the authoritative probe is
 * `'copyElementImageToTexture' in GPUQueue.prototype`, evaluated over CDP in
 * a throwaway tab (the same probe scripts/cdp-capture.mjs trusts). WebGPU
 * globals only exist in a SECURE CONTEXT, and `about:blank` is an opaque
 * origin — the probe tab must navigate to a localhost page, so it uses the
 * dev server; when the dev server is down it falls back to scanning the
 * Chrome process arguments.
 *
 * `check` always succeeds when the probes themselves run — a down service is
 * a reported state, not an execution failure.
 *
 * @module
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
	appPort: z.number().int().default(7263),
	cdpPort: z.number().int().default(9223),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const StatusSchema = z.object({
	checkedAt: z.string(),
	devServer: z.object({ up: z.boolean(), url: z.string() }),
	cdpChrome: z.object({
		up: z.boolean(),
		flagActive: z.boolean(),
		flagProbe: z.enum(["runtime", "process-args", "skipped"]),
		browser: z.string().nullable(),
	}),
	forkShadowing: z.object({
		shadowedSlugs: z.array(z.string()),
		userCompositionCount: z.number(),
		builtinCount: z.number(),
	}),
	captureReady: z.boolean(),
});

type MethodContext = {
	repoDir: string;
	globalArgs: GlobalArgs;
	logger: { info: (msg: string, props?: Record<string, unknown>) => void };
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
};

async function probeHttp(url: string, init?: RequestInit): Promise<Response | null> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
	} catch {
		return null;
	}
}

/**
 * Evaluate the CanvasDrawElement feature probe in a throwaway CDP tab
 * navigated to `probeUrl` (must be a secure context — any localhost page).
 * Mirrors scripts/cdp-page-health.mjs. Retries the evaluation briefly since
 * the tab starts on about:blank while the navigation commits.
 */
async function probeCanvasDrawElementFlag(cdpPort: number, probeUrl: string): Promise<boolean> {
	const created = await probeHttp(
		`http://localhost:${cdpPort}/json/new?${encodeURIComponent(probeUrl)}`,
		{ method: "PUT" },
	);
	if (!created || !created.ok) return false;
	const target = (await created.json()) as { id: string; webSocketDebuggerUrl: string };
	try {
		const socket = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise<void>((resolvePromise, rejectPromise) => {
			socket.onopen = () => resolvePromise();
			socket.onerror = () => rejectPromise(new Error("CDP socket failed"));
		});
		const evaluateOnce = (id: number): Promise<boolean> =>
			new Promise<boolean>((resolvePromise) => {
				const timer = setTimeout(() => resolvePromise(false), 3000);
				const onMessage = (event: MessageEvent) => {
					const message = JSON.parse(String(event.data)) as {
						id?: number;
						result?: { result?: { value?: unknown } };
					};
					if (message.id === id) {
						clearTimeout(timer);
						socket.removeEventListener("message", onMessage);
						resolvePromise(message.result?.result?.value === true);
					}
				};
				socket.addEventListener("message", onMessage);
				socket.send(
					JSON.stringify({
						id,
						method: "Runtime.evaluate",
						params: {
							expression:
								"typeof GPUQueue !== 'undefined' && 'copyElementImageToTexture' in GPUQueue.prototype",
							returnByValue: true,
						},
					}),
				);
			});
		let flagActive = false;
		for (let attempt = 1; attempt <= 5 && !flagActive; attempt += 1) {
			flagActive = await evaluateOnce(attempt);
			if (!flagActive) await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
		}
		socket.close();
		return flagActive;
	} catch {
		return false;
	} finally {
		await probeHttp(`http://localhost:${cdpPort}/json/close/${target.id}`);
	}
}

/** Fallback when the dev server is down: scan Chrome process args for the flag. */
async function probeFlagFromProcessArgs(cdpPort: number): Promise<boolean> {
	try {
		const command = new Deno.Command("ps", { args: ["-Ao", "args"], stdout: "piped" });
		const { stdout } = await command.output();
		const processes = new TextDecoder().decode(stdout);
		return processes
			.split("\n")
			.some(
				(line) =>
					line.includes(`--remote-debugging-port=${cdpPort}`) &&
					line.includes("--enable-blink-features=CanvasDrawElement"),
			);
	} catch {
		return false;
	}
}

async function listJsonBasenames(directory: string): Promise<string[]> {
	try {
		const names: string[] = [];
		for await (const entry of Deno.readDir(directory)) {
			if (entry.isFile && entry.name.endsWith(".json")) {
				names.push(entry.name.slice(0, -".json".length));
			}
		}
		return names.sort();
	} catch {
		return [];
	}
}

/** Model definition for the Supers session preflight. */
export const model = {
	type: "@supers/preflight",
	version: "2026.08.03.1",
	globalArguments: GlobalArgsSchema,
	resources: {
		status: {
			description:
				"Session preflight status: dev server, flagged CDP Chrome, fork shadowing",
			schema: StatusSchema,
			lifetime: "infinite",
			garbageCollection: 20,
		},
	},
	methods: {
		check: {
			description:
				"Probe dev server, CDP Chrome + CanvasDrawElement flag, and fork shadowing; store the status snapshot",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: MethodContext) => {
				const { appPort, cdpPort } = context.globalArgs;
				const appUrl = `http://localhost:${appPort}`;

				const devResponse = await probeHttp(appUrl);
				const devServerUp = devResponse !== null && devResponse.ok;

				const versionResponse = await probeHttp(`http://localhost:${cdpPort}/json/version`);
				const cdpUp = versionResponse !== null && versionResponse.ok;
				let browser: string | null = null;
				if (cdpUp && versionResponse) {
					const version = (await versionResponse.json()) as { Browser?: string };
					browser = version.Browser ?? null;
				}
				let flagActive = false;
				let flagProbe: "runtime" | "process-args" | "skipped" = "skipped";
				if (cdpUp && devServerUp) {
					flagProbe = "runtime";
					flagActive = await probeCanvasDrawElementFlag(cdpPort, `${appUrl}/robots.txt`);
				} else if (cdpUp) {
					flagProbe = "process-args";
					flagActive = await probeFlagFromProcessArgs(cdpPort);
				}

				const userSlugs = await listJsonBasenames(`${context.repoDir}/user-compositions`);
				const builtinSlugs = await listJsonBasenames(`${context.repoDir}/src/lib/presets`);
				const builtinSet = new Set(builtinSlugs);
				const shadowedSlugs = userSlugs.filter((slug) => builtinSet.has(slug));

				const status = {
					checkedAt: new Date().toISOString(),
					devServer: { up: devServerUp, url: appUrl },
					cdpChrome: { up: cdpUp, flagActive, flagProbe, browser },
					forkShadowing: {
						shadowedSlugs,
						userCompositionCount: userSlugs.length,
						builtinCount: builtinSlugs.length,
					},
					captureReady: devServerUp && cdpUp && flagActive,
				};
				context.logger.info(
					"preflight: dev={dev} cdp={cdp} flag={flag} shadowed={shadowed}",
					{
						dev: devServerUp,
						cdp: cdpUp,
						flag: flagActive,
						shadowed: shadowedSlugs.length,
					},
				);
				const handle = await context.writeResource("status", "status-latest", status);
				return { dataHandles: [handle] };
			},
		},
	},
};
