/**
 * Which profile this process is serving, for everything that has to ask after
 * startup
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md),
 * [ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)).
 *
 * `assertPublicRuntimeDeployment` reads the profile once, to decide whether the
 * host may listen at all. This reads it per call, for the two decisions that are
 * made after it does: the security headers and route exclusions the server hook
 * applies, and the development-only *content* a load function would otherwise
 * hand a public visitor over a public route — the fixture recompositions and
 * Pack calibration re-dresses that document engine gaps rather than ship as
 * deliverables (ADR-0039), and the poster keys of a disk-backed store the public
 * runtime does not have.
 *
 * `GFX_RUNTIME_PROFILE` is a private input, so this module is server-only by
 * name as well as by import. The hosted profile is declared by the PUBLIC_
 * input the page reads too, so the profile is read from both env modules.
 */

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

import { resolveGitRelease } from './git-version.server';
import { parsePublicRuntimeConfig } from './public-runtime-contract';
import { parsePublicRuntimeProfile, type PublicRuntimeProfile } from './public-runtime-deployment';

/**
 * What this host declared it is. Absent, it is a development host. Never throws
 * by the time a request is served: the `init` hook has already refused to listen
 * on an unreadable value.
 */
export function servedPublicRuntimeProfile(): PublicRuntimeProfile {
	return parsePublicRuntimeProfile({ ...env, ...publicEnv });
}

/**
 * The HTML-in-Canvas origin-trial token this host sends on documents, or null.
 * Only a hosted origin is given one; a local origin launches the flagged
 * browser instead (ADR-0052 amendment).
 */
export function servedOriginTrialToken(): string | null {
	return parsePublicRuntimeConfig(env).originTrialToken;
}

/**
 * The release this process is serving: the `GFX_RELEASE` a production image was
 * built with, and otherwise the commit of the checkout it is running from.
 *
 * Both halves are load-bearing. A production image carries no `.git`, so without
 * the deployment input the app shell would declare no release at all while
 * `/api/health` reported one — and a deploy or rollback is confirmed by reading
 * that identity back, which a browser can only do from the app shell (ADR-0052).
 * A development host sets no `GFX_RELEASE`, so it keeps reporting the working
 * tree's commit at capture time, which is what a dev server outliving its own
 * commits needs.
 *
 * `inspectPublicRuntimeReadiness` answers the same question for `/api/health`,
 * from a `PublicRuntimeConfig` it is handed rather than from this process — that
 * is what lets `pnpm probe:public-runtime` measure a host other than itself.
 */
export function servedRelease(): string | null {
	return parsePublicRuntimeConfig(env).release ?? resolveGitRelease() ?? null;
}

/**
 * Whether this host serves the development-only surfaces at all. False on the
 * public and hosted origins, which answer 404 for their routes and omit their
 * content from the routes they do serve.
 */
export function areDevelopmentOnlySurfacesServed(): boolean {
	return servedPublicRuntimeProfile() === 'development';
}
