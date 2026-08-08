import { describe, expect, it } from 'vitest';

import {
	compositionAutosaveInvalidation,
	invalidateCompositionAutosave
} from './composition-autosave-invalidation.svelte.ts';

describe('composition autosave invalidation', () => {
	it('provides a stable dependency for topology-removal autosaves', () => {
		const previousRevision = compositionAutosaveInvalidation.revision;
		invalidateCompositionAutosave();
		expect(compositionAutosaveInvalidation.revision).toBe(previousRevision + 1);
	});
});
