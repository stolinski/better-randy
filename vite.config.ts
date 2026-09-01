import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	...(mode === 'test'
		? {}
		: {
				// Package-root exclusions also cover deep imports such as svelte/reactivity.
				// Keep Svelte out of changing SSR prebundles while the dev server is running.
				ssr: {
					optimizeDeps: {
						exclude: ['svelte']
					}
				}
			}),
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					include: ['src/**/*.test.ts', 'vite.config.test.ts'],
					exclude: ['**/node_modules/**', 'src/**/*.dom.test.ts']
				}
			},
			{
				// Rendered component tests (`*.dom.test.ts`): Svelte's browser build
				// under jsdom, with rendered components cleaned up between tests. The
				// browser condition stays inside this project — applied globally it
				// resolves browser-only builds (Sentry's `$app` client) into Node tests.
				extends: true,
				resolve: { conditions: ['browser', 'module', 'development|production', 'node'] },
				test: {
					name: 'dom',
					environment: 'jsdom',
					include: ['src/**/*.dom.test.ts'],
					setupFiles: ['@testing-library/svelte/vitest']
				}
			}
		]
	},
	server: {
		port: 7263,
		// Bind every interface family: Caddy dials localhost per-family, and a
		// fresh Node 25 vite otherwise listens on ::1 only — IPv4 dials then 502.
		host: true,
		allowedHosts: ['.robo.online']
	}
}));
