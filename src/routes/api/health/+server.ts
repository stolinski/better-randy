import { json, type RequestHandler } from '@sveltejs/kit';

import { parsePublicRuntimeConfig } from '$lib/platform/public-runtime-contract';
import {
	servedPublicRuntimeProfile,
	servedRelease
} from '$lib/platform/public-runtime-profile.server';
import {
	inspectPublicRuntimeReadiness,
	summarizeHostedRuntimeHealth,
	summarizePublicRuntimeHealth
} from '$lib/platform/public-runtime-readiness.server';

/**
 * Liveness and release identity for the public runtime (ADR-0052): 200 once the
 * host can serve both export lanes, 503 while it cannot, and a deliberately
 * redacted body — the container healthcheck and the rollback check are the only
 * consumers, so paths, versions, and capacity stay out of the response.
 *
 * The hosted origin serves no export lane, so it is measured against nothing
 * but its own presence: the answer is the release it is serving, and never a
 * probe of an encoder or a disk a Worker does not have.
 */
export const GET: RequestHandler = async () => {
	const health =
		servedPublicRuntimeProfile() === 'hosted'
			? summarizeHostedRuntimeHealth(servedRelease())
			: summarizePublicRuntimeHealth(
					await inspectPublicRuntimeReadiness(parsePublicRuntimeConfig(process.env))
				);
	return json(health.body, {
		status: health.httpStatus,
		headers: { 'Cache-Control': 'no-store' }
	});
};
