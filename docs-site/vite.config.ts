import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		allowedHosts: ['.robo.online'],
		fs: {
			// the site renders the repo's docs/ tree, which sits outside this project root
			allow: ['..']
		}
	}
});
