// The public gfx.computer runtime is a long-lived Node server that spawns
// ffmpeg and streams native-resolution export output from private temp disk
// (ADR-0052). Cloudflare supplies DNS and proxy only; nothing here targets
// Workers.
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: { adapter: adapter() }
};

export default config;
