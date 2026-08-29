/**
 * The guard every origin-side composition route runs first
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md),
 * [ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)).
 *
 * `/api/user-compositions` reads and writes durable content on a visitor's
 * behalf, which makes it development-only: a Public demo session keeps its
 * compositions in the visitor's browser, so an origin configured for one holds
 * no composition store to serve. The route answers 404 there rather than
 * quietly accepting a document the public runtime promised never to keep.
 *
 * Configuration decides this, not the request, so a misconfigured host fails the
 * same way for everyone instead of depending on who is asking.
 */
import { error } from '@sveltejs/kit';

import { env } from '$env/dynamic/public';

import { parseCompositionSessionStoreConfig } from './public-runtime-contract';

/**
 * Refuse when this build serves the browser-scoped session store. Call it before
 * reading a request body, so a refused write is never parsed, let alone stored.
 */
export function assertOriginCompositionStoreServed(): void {
	if (parseCompositionSessionStoreConfig(env).kind === 'origin') return;
	error(
		404,
		'This origin serves a browser-scoped composition session and keeps no composition store; compositions live in the browser that authored them.'
	);
}
