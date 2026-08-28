import { describe, expect, it } from 'vitest';
import viteConfig from './vite.config';

describe('Vite configuration', () => {
	it('keeps Svelte reactivity out of SSR prebundles', () => {
		const developmentConfig = viteConfig({
			command: 'serve',
			mode: 'development',
			isSsrBuild: false,
			isPreview: false
		});

		expect(developmentConfig.ssr?.optimizeDeps?.exclude).toContain('svelte');
	});
});
