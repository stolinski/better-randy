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
		include: ['src/**/*.test.ts', 'vite.config.test.ts']
	},
	server: {
		port: 7263,
		// Bind every interface family: Caddy dials localhost per-family, and a
		// fresh Node 25 vite otherwise listens on ::1 only — IPv4 dials then 502.
		host: true,
		allowedHosts: ['.robo.online']
	}
}));
