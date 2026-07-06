import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
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
