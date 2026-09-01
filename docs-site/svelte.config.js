import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			// The docs site sets the same ratified identity the app ships, read
			// straight from the generated assets rather than re-typeset here —
			// see docs/identity/README.md.
			$identity: '../src/lib/assets/identity'
		},
		prerender: {
			// No handleHttpError override on purpose: every docs link is resolved at
			// build time (src/lib/server/docs.ts), so an internal 404 here is link rot
			// and must fail the build — which is SvelteKit's default.
			handleMissingId: ({ path, id }) => {
				console.warn(`missing anchor: #${id} on ${path}`);
			}
		}
	}
};

export default config;
