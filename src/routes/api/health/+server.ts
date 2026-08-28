import { json, type RequestHandler } from '@sveltejs/kit';

import { parsePublicRuntimeConfig } from '$lib/platform/public-runtime-contract';
import {
	inspectPublicRuntimeReadiness,
	summarizePublicRuntimeHealth
} from '$lib/platform/public-runtime-readiness.server';

/**
 * Liveness and release identity for the public runtime (ADR-0052): 200 once the
 * host can serve both export lanes, 503 while it cannot, and a deliberately
 * redacted body — the container healthcheck and the rollback check are the only
 * consumers, so paths, versions, and capacity stay out of the response.
 */
export const GET: RequestHandler = async () => {
	const readiness = await inspectPublicRuntimeReadiness(parsePublicRuntimeConfig(process.env));
	const health = summarizePublicRuntimeHealth(readiness);
	return json(health.body, {
		status: health.httpStatus,
		headers: { 'Cache-Control': 'no-store' }
	});
};
