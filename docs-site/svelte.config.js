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
			handleHttpError: ({ status, path, referrer, message }) => {
				if (status === 404) {
					console.warn(`docs link rot: ${path} (linked from ${referrer})`);
					return;
				}
				throw new Error(message);
			},
			handleMissingId: ({ path, id }) => {
				console.warn(`missing anchor: #${id} on ${path}`);
			}
		}
	}
};

export default config;
