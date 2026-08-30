/**
 * Whether the deployment inputs a host was handed can actually serve the public
 * demo (ADR-0052).
 *
 * `parsePublicRuntimeConfig` validates the shape of one input at a time. This
 * module answers the question a container start has to answer before it listens:
 * given the whole environment, is this host allowed to take public traffic? A
 * production image that is missing `ORIGIN`, still carrying the adapter's 512 KB
 * body ceiling, or still pointed at the development composition store looks
 * healthy and then fails a visitor mid-export, so the process refuses to start
 * instead.
 *
 * The `development` profile is the default and adds no requirements, so a bare
 * checkout, the dev server, and `vite preview` behave exactly as before. Only a
 * host that declares `GFX_RUNTIME_PROFILE=public` — which the production image
 * does — is held to the list below.
 *
 * Deliberately free of Node imports, like its `public-runtime-contract` and
 * `public-export-limits` peers, so the container entry, the routes, and the
 * fixtures all read one set of rules.
 */

import {
	PUBLIC_EXPORT_RUNTIME_LIMITS,
	PublicRuntimeConfigError,
	parseCompositionSessionStoreConfig,
	parsePublicRuntimeConfig
} from '$lib/platform/public-runtime-contract';

/**
 * What this host is being asked to be. `development` is every local checkout;
 * `public` is the gfx.computer origin and the production image that serves it.
 */
export type PublicRuntimeProfile = 'development' | 'public';

export const PUBLIC_RUNTIME_PROFILES: readonly PublicRuntimeProfile[] = ['development', 'public'];

/** One deployment input a public host was given wrong, and what would fit. */
export interface PublicRuntimeDeploymentFailure {
	input: string;
	problem: string;
	/** A value that would satisfy the input, or `null` when only the operator can choose it. */
	fittingValue: string | null;
}

function isPublicRuntimeProfile(value: string): value is PublicRuntimeProfile {
	return PUBLIC_RUNTIME_PROFILES.some((profile) => profile === value);
}

/** Read which profile this host is running as. Absent, it is a development host. */
export function parsePublicRuntimeProfile(
	env: Readonly<Record<string, string | undefined>>
): PublicRuntimeProfile {
	const raw = env.GFX_RUNTIME_PROFILE;
	if (raw === undefined || raw.trim() === '') return 'development';
	const value = raw.trim();
	if (!isPublicRuntimeProfile(value)) {
		throw new PublicRuntimeConfigError(
			`GFX_RUNTIME_PROFILE must be one of ${PUBLIC_RUNTIME_PROFILES.join(', ')}; received "${value}".`
		);
	}
	return value;
}

/**
 * Bytes a `BODY_SIZE_LIMIT` value denotes, using the adapter's own `K`/`M`/`G`
 * suffix rules, or `null` when the adapter would read it as `NaN` and refuse to
 * start. Restated rather than imported because the adapter's copy lives in
 * generated build output that only exists after `pnpm build`.
 */
export function parseBodySizeLimitBytes(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const suffix = trimmed.at(-1)?.toUpperCase() ?? '';
	const multiplier = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 }[suffix];
	const digits = multiplier === undefined ? trimmed : trimmed.slice(0, -1);
	const parsed = Number(digits);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed * (multiplier ?? 1);
}

/**
 * Every reason this environment cannot serve public traffic, so an operator
 * fixes the whole deployment in one pass instead of one restart per input.
 * Empty for a `development` host, which is held to nothing beyond the per-input
 * shapes `parsePublicRuntimeConfig` already enforces.
 */
export function findPublicRuntimeDeploymentFailures(
	env: Readonly<Record<string, string | undefined>>
): PublicRuntimeDeploymentFailure[] {
	if (parsePublicRuntimeProfile(env) !== 'public') return [];

	const failures: PublicRuntimeDeploymentFailure[] = [];
	const config = parsePublicRuntimeConfig(env);
	const maxFrameBytes = PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes;

	const origin = env.ORIGIN?.trim() ?? '';
	if (origin === '') {
		failures.push({
			input: 'ORIGIN',
			problem:
				'A public host resolves its own origin from ORIGIN and never from a Host or X-Forwarded header, so every export security check needs it set.',
			fittingValue: null
		});
	}

	const bodySizeLimit = env.BODY_SIZE_LIMIT?.trim() ?? '';
	const bodySizeLimitBytes = bodySizeLimit === '' ? null : parseBodySizeLimitBytes(bodySizeLimit);
	if (bodySizeLimitBytes === null || bodySizeLimitBytes < maxFrameBytes) {
		failures.push({
			input: 'BODY_SIZE_LIMIT',
			problem:
				bodySizeLimitBytes === null
					? `The adapter default of 512K rejects every native-target frame upload with 413; BODY_SIZE_LIMIT must be at least maxFrameBytes (${maxFrameBytes}).`
					: `${bodySizeLimitBytes} is below maxFrameBytes (${maxFrameBytes}), so native-target frame uploads are rejected with 413.`,
			fittingValue: String(maxFrameBytes)
		});
	}

	if (config.exportTemporaryDirectory === null) {
		failures.push({
			input: 'GFX_EXPORT_TEMPORARY_DIRECTORY',
			problem:
				'Export work directories would land on the OS temp directory, which on a container is the writable image layer rather than the reserved temp volume.',
			fittingValue: null
		});
	} else if (!config.exportTemporaryDirectory.startsWith('/')) {
		failures.push({
			input: 'GFX_EXPORT_TEMPORARY_DIRECTORY',
			problem: `"${config.exportTemporaryDirectory}" is relative, so which directory it names depends on the working directory the host happened to start in.`,
			fittingValue: null
		});
	}

	if (config.release === null) {
		failures.push({
			input: 'GFX_RELEASE',
			problem:
				'A production image carries no git checkout to fall back to, so /api/health would report no release and a deploy or rollback could not be verified against the origin.',
			fittingValue: null
		});
	}

	const ratifiedConcurrency = PUBLIC_EXPORT_RUNTIME_LIMITS.maxConcurrentSessions;
	if (config.maxConcurrentExportSessions > ratifiedConcurrency) {
		failures.push({
			input: 'GFX_EXPORT_MAX_CONCURRENT_SESSIONS',
			problem: `${config.maxConcurrentExportSessions} sessions can occupy more temp disk than the ${PUBLIC_EXPORT_RUNTIME_LIMITS.requiredTemporaryDiskBytes} bytes the readiness check reserves for ${ratifiedConcurrency}.`,
			fittingValue: String(ratifiedConcurrency)
		});
	}

	if (parseCompositionSessionStoreConfig(env).kind !== 'browser') {
		failures.push({
			input: 'PUBLIC_GFX_COMPOSITION_STORE',
			problem:
				'The public demo keeps no durable visitor content, so it must serve the browser-scoped composition session rather than the disk-backed development store.',
			fittingValue: 'browser'
		});
	}

	return failures;
}

/**
 * Hold this host to its profile, or refuse to serve. Called from the server
 * `init` hook, which the Node adapter awaits before it listens — so a
 * misconfigured public host exits non-zero at startup instead of accepting a
 * request it cannot finish.
 */
export function assertPublicRuntimeDeployment(
	env: Readonly<Record<string, string | undefined>>
): PublicRuntimeProfile {
	const profile = parsePublicRuntimeProfile(env);
	const failures = findPublicRuntimeDeploymentFailures(env);
	if (failures.length === 0) return profile;
	const lines = failures.map(
		(failure) =>
			`  ${failure.input}: ${failure.problem}${failure.fittingValue === null ? '' : ` Set it to ${failure.fittingValue}.`}`
	);
	throw new PublicRuntimeConfigError(
		`GFX_RUNTIME_PROFILE=public, but ${failures.length} deployment input${failures.length === 1 ? '' : 's'} cannot serve public traffic:\n${lines.join('\n')}`
	);
}
