import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

import { downloadBlob } from './export-video';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('downloadBlob', () => {
	it('applies the requested filename and revokes the object URL after clicking', () => {
		const link = { href: '', download: '', click: vi.fn() };
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
		vi.stubGlobal('document', { createElement: () => link });

		downloadBlob(new Blob(['media']), 'supers-overlay.webm');

		assert.equal(createObjectURL.mock.calls.length, 1);
		assert.equal(link.href, 'blob:export');
		assert.equal(link.download, 'supers-overlay.webm');
		assert.equal(link.click.mock.calls.length, 1);
		assert.deepEqual(revokeObjectURL.mock.calls, [['blob:export']]);
	});

	it('still revokes the object URL when the browser download click fails', () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-export');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
		vi.stubGlobal('document', {
			createElement: () => ({
				href: '',
				download: '',
				click: () => {
					throw new Error('click failed');
				}
			})
		});

		assert.throws(() => downloadBlob(new Blob(), 'failed.webm'), /click failed/);
		assert.deepEqual(revokeObjectURL.mock.calls, [['blob:failed-export']]);
	});
});
