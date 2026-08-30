/**
 * The headers every response from the public gfx.computer origin carries
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md),
 * [ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md)).
 *
 * The public demo is one origin, one top-level document, no accounts, and no
 * durable visitor content. That shape decides the whole header set: nothing may
 * frame us, nothing may read our responses from another origin, nothing between
 * the origin and the browser may keep a copy of a visitor's work, and the WebMCP
 * `tools` surface is granted to this document and nowhere else.
 *
 * `development` hosts are held to none of it. The dev server runs Vite HMR, the
 * CDP verification harness, and the development-only routes this file's
 * `public-surface-inventory` peer excludes — so the profile decides, exactly as
 * it does for the deployment inputs.
 *
 * What this covers is every response the SvelteKit handler produces, which is
 * every document, every API answer, and every export body. It does not cover
 * `build/client` — the Node adapter serves those through its own static handler
 * ahead of the hook, so a content-addressed immutable asset keeps the adapter's
 * `public, immutable` caching and carries none of the headers below. That is the
 * adapter's lane and it has no configuration seam; the assets in it are build
 * output with no visitor content in them, and the document that loads them is
 * governed by the policy here.
 *
 * Deliberately free of Node and `$env` imports so the hook, the tests, and the
 * production-image gate read one contract.
 */

/**
 * Sent with every public response.
 *
 * Deliberately absent:
 *
 * - `X-Frame-Options`. `frame-ancestors 'none'` below says the same thing to
 *   every browser that has shipped in a decade, and two spellings of one rule
 *   drift.
 * - `Cross-Origin-Embedder-Policy`. Cross-origin isolation buys
 *   `SharedArrayBuffer`, which the measured render lane does not use (see
 *   `docs/standard-browser-rendering-probe.md`), and `require-corp` would break
 *   any cross-origin subresource for no gain.
 */
export const PUBLIC_SECURITY_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
	// Two years, subdomains included, preload-eligible. Cloudflare terminates
	// TLS in front of the origin, so this is what pins a visitor to HTTPS.
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
	// Export output and poster-shaped bodies are binary; a sniffed content type
	// is how one becomes a script.
	'X-Content-Type-Options': 'nosniff',
	// A composition slug is the visitor's content. It never leaves in a Referer.
	'Referrer-Policy': 'no-referrer',
	// One top-level browsing context. Nothing this origin opens, and nothing
	// that opens it, shares an agent cluster or a window handle with it.
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Origin-Agent-Cluster': '?1'
};

/**
 * Browser features the demo actually uses, granted to this origin's own
 * document. `tools` is the WebMCP surface: ADR-0054 §7 registers tools only in
 * gfx.computer's own top-level document, never in a cross-origin frame and
 * never on another origin's behalf, and this is the header that holds the
 * browser to it.
 */
export const PUBLIC_PERMISSIONS_POLICY_SELF_FEATURES: readonly string[] = [
	'tools',
	'autoplay',
	'fullscreen'
];

/**
 * Powerful features nothing in the demo reaches for. Named rather than left to
 * the browser's default allowlist, so a dependency that starts asking for one
 * is refused instead of prompting a visitor on our behalf.
 */
export const PUBLIC_PERMISSIONS_POLICY_DENIED_FEATURES: readonly string[] = [
	'accelerometer',
	'browsing-topics',
	'camera',
	'display-capture',
	'encrypted-media',
	'geolocation',
	'gyroscope',
	'idle-detection',
	'local-fonts',
	'magnetometer',
	'microphone',
	'midi',
	'payment',
	'picture-in-picture',
	'publickey-credentials-get',
	'screen-wake-lock',
	'serial',
	'usb',
	'xr-spatial-tracking'
];

/**
 * The Permissions Policy a public response carries: `tools=(self)` plus the
 * features above, denied by name.
 */
export const PUBLIC_PERMISSIONS_POLICY: string = [
	...PUBLIC_PERMISSIONS_POLICY_SELF_FEATURES.map((feature) => `${feature}=(self)`),
	...PUBLIC_PERMISSIONS_POLICY_DENIED_FEATURES.map((feature) => `${feature}=()`)
].join(', ');

/**
 * The Content Security Policy a public HTML document carries.
 *
 * `script-src` is `'self'` here and gains SvelteKit's per-response nonce in
 * `composePublicContentSecurityPolicy` — SvelteKit owns that nonce because it
 * owns the inline bootstrap script it belongs to (`kit.csp` in
 * `svelte.config.js`).
 *
 * `'unsafe-inline'` on `style-src` is load-bearing rather than lazy: the engine
 * positions and animates every composition element through inline `style`
 * attributes, which CSP treats as inline styles. There is no hash or nonce form
 * for an attribute that changes every frame.
 *
 * `blob:` appears on `img-src`, `media-src`, and `connect-src` because a
 * visitor's own media never reaches the origin — it is read from a granted file
 * handle into an object URL and fetched back from there.
 *
 * `connect-src` names no external address, which is the point: the browser talks
 * to this origin and to its own object URLs, and to nothing else. Browser-side
 * Sentry would be a cross-origin connect and is therefore not allowed — which
 * costs nothing, because `PUBLIC_SENTRY_DSN` is not one of the deployment inputs
 * a public host is given (`PUBLIC_RUNTIME_DEPLOYMENT_INPUTS`). Server-side
 * Sentry is unaffected: it reports from the origin, not from the page.
 */
export const PUBLIC_CONTENT_SECURITY_POLICY_DIRECTIVES: Readonly<
	Record<string, readonly string[]>
> = {
	'default-src': ["'self'"],
	'base-uri': ["'none'"],
	'object-src': ["'none'"],
	'frame-ancestors': ["'none'"],
	'form-action': ["'self'"],
	'script-src': ["'self'"],
	'style-src': ["'self'", "'unsafe-inline'"],
	'img-src': ["'self'", 'blob:', 'data:'],
	'media-src': ["'self'", 'blob:'],
	'font-src': ["'self'"],
	'connect-src': ["'self'", 'blob:'],
	'upgrade-insecure-requests': []
};

function parseContentSecurityPolicy(policy: string): Map<string, string[]> {
	const directives = new Map<string, string[]>();
	for (const part of policy.split(';')) {
		const [name, ...tokens] = part.trim().split(/\s+/).filter(Boolean);
		if (name === undefined) continue;
		directives.set(name.toLowerCase(), tokens);
	}
	return directives;
}

function serializeContentSecurityPolicy(
	directives: ReadonlyMap<string, readonly string[]>
): string {
	return [...directives]
		.map(([name, tokens]) => (tokens.length === 0 ? name : `${name} ${tokens.join(' ')}`))
		.join('; ');
}

/**
 * The public policy, carrying whatever SvelteKit added to the app shell's own
 * policy for this response — the nonce on a rendered page, the script hashes on
 * a prerendered one.
 *
 * Merging rather than replacing is the point: a CSP is enforced as a whole, so
 * emitting a second header would only intersect with the first and drop the
 * bootstrap script's nonce on the floor. Anything SvelteKit declared that this
 * contract does not is carried through rather than discarded, so configuring
 * another directive in `kit.csp` cannot silently lose it here.
 */
export function composePublicContentSecurityPolicy(appShellPolicy: string | null): string {
	const appShell =
		appShellPolicy === null
			? new Map<string, string[]>()
			: parseContentSecurityPolicy(appShellPolicy);
	const composed = new Map<string, string[]>();

	for (const [name, tokens] of Object.entries(PUBLIC_CONTENT_SECURITY_POLICY_DIRECTIVES)) {
		const merged = [...tokens];
		for (const token of appShell.get(name) ?? []) {
			if (!merged.includes(token)) merged.push(token);
		}
		composed.set(name, merged);
	}
	for (const [name, tokens] of appShell) {
		if (!composed.has(name)) composed.set(name, [...tokens]);
	}

	return serializeContentSecurityPolicy(composed);
}

/**
 * What a public response may be cached as when it says nothing itself.
 *
 * `no-store` is the default because most of what this origin returns is either
 * the visitor's own work or an answer about a session that is about to be
 * destroyed. A response that already declared its caching keeps it: the
 * immutable build assets are content-addressed, and the export download sets
 * its own `no-store` alongside an exact `Content-Length` (ADR-0052).
 */
export const DEFAULT_PUBLIC_CACHE_CONTROL = 'no-store';

/**
 * Hold one response to the public contract. Mutates the headers in place, which
 * is what a SvelteKit `handle` hook is given a response for.
 *
 * The Content Security Policy is set on HTML documents only — it governs what a
 * document may load, and an image or a font is not a document.
 */
export function applyPublicResponseHeaders(response: Response): void {
	for (const [name, value] of Object.entries(PUBLIC_SECURITY_RESPONSE_HEADERS)) {
		response.headers.set(name, value);
	}
	response.headers.set('Permissions-Policy', PUBLIC_PERMISSIONS_POLICY);

	if (!response.headers.has('Cache-Control')) {
		response.headers.set('Cache-Control', DEFAULT_PUBLIC_CACHE_CONTROL);
	}

	if (response.headers.get('Content-Type')?.startsWith('text/html') === true) {
		response.headers.set(
			'Content-Security-Policy',
			composePublicContentSecurityPolicy(response.headers.get('Content-Security-Policy'))
		);
	}
}
