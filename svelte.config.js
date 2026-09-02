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
	kit: {
		adapter: adapter(),
		// SvelteKit owns the app shell's inline bootstrap script, so it owns the
		// nonce that script needs. Declaring `script-src` here is what makes it
		// emit one; the public origin then merges that nonce into the full policy
		// at request time, because the rest of the policy depends on the runtime
		// profile rather than the build (see public-response-headers.ts).
		csp: { mode: 'auto', directives: { 'script-src': ['self'] } },
		// Every integration rebuilds gfx.robo.online and drops the previous build's
		// hashed chunks. An open tab polls for the new build so its next navigation
		// is a full page load (root layout) rather than an import the origin can no
		// longer serve; a failed on-demand import reloads once (ADR-0058).
		version: { pollInterval: 30_000 }
	}
};

export default config;
