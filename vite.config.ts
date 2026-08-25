import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	...(mode === 'test'
		? {}
		: {
				ssr: {
					optimizeDeps: {
						exclude: ['svelte']
					}
				}
			}),
	test: {
		include: ['src/**/*.test.ts']
	},
	server: {
		port: 7263,
		allowedHosts: ['.robo.online']
	}
}));
