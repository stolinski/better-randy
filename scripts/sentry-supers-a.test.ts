Deno.test(
	'Sentry SUPERS-A e854cae2ad047e84d7497309ed300d1f333ae601a09a5e946527be15461f7f34',
	async () => {
		const routeConfig: unknown = await import('../src/routes/p/[slug]/+page.ts');
		if (typeof routeConfig !== 'object' || routeConfig === null) {
			throw new Error('The composition route must export route configuration.');
		}
		if (Reflect.get(routeConfig, 'ssr') !== false) {
			throw new Error('The browser-native composition workspace must not render on the server.');
		}
		if (Reflect.get(routeConfig, 'csr') !== true) {
			throw new Error('The browser-native composition workspace must keep client rendering enabled.');
		}
	}
);
