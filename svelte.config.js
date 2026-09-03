// Two adapters, one app. The local production artifact is the Node origin
// (ADR-0052): a long-lived server that spawns ffmpeg and streams native
// export output from private temp disk. The hosted gfx.computer origin is a
// Cloudflare Worker that serves the app and encodes nothing — the browser
// exports there — selected by the same PUBLIC_GFX_HOSTED input the runtime and
// the page read, which `pnpm build:hosted` sets (ADR-0052 amendment).
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';

const isHostedBuild = (process.env.PUBLIC_GFX_HOSTED ?? '').trim() !== '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: isHostedBuild ? adapterCloudflare() : adapterNode(),
		// SvelteKit owns the app shell's inline bootstrap script, so it owns the
		// nonce that script needs. Declaring `script-src` here is what makes it
		// emit one; the public origin then merges that nonce into the full policy
		// at request time, because the rest of the policy depends on the runtime
		// profile rather than the build (see public-response-headers.ts).
		csp: {
			mode: 'auto',
			directives: { 'script-src': ['self', 'https://analytics.tolin.ski'] }
		},
		// Every integration rebuilds gfx.robo.online and drops the previous build's
		// hashed chunks. An open tab polls for the new build so its next navigation
		// is a full page load (root layout) rather than an import the origin can no
		// longer serve; a failed on-demand import reloads once (ADR-0058).
		version: { pollInterval: 30_000 }
	}
};

export default config;
