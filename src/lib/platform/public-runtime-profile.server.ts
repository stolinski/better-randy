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
 * name as well as by import.
 */

import { env } from '$env/dynamic/private';

import { parsePublicRuntimeProfile, type PublicRuntimeProfile } from './public-runtime-deployment';

/**
 * What this host declared it is. Absent, it is a development host. Never throws
 * by the time a request is served: the `init` hook has already refused to listen
 * on an unreadable value.
 */
export function servedPublicRuntimeProfile(): PublicRuntimeProfile {
	return parsePublicRuntimeProfile(env);
}

/**
 * Whether this host serves the development-only surfaces at all. False on the
 * public origin, which answers 404 for their routes and omits their content from
 * the routes it does serve.
 */
export function areDevelopmentOnlySurfacesServed(): boolean {
	return servedPublicRuntimeProfile() !== 'public';
}
