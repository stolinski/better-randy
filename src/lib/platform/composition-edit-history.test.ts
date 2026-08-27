import { describe, expect, it } from 'vitest';

import { CompositionEditHistory } from './composition-edit-history';

describe('composition edit history', () => {
	it('undoes and redoes applied authoring transactions in order', () => {
		const history = new CompositionEditHistory();
		let value = 2;
		history.recordApplied({
			label: 'Double value',
			undo: () => {
				value = 1;
			},
			redo: () => {
				value = 2;
			}
		});

		expect(history.canUndo).toBe(true);
		expect(history.undoLabel).toBe('Double value');
		expect(history.undo()).toBe(true);
		expect(value).toBe(1);
		expect(history.canRedo).toBe(true);
		expect(history.redo()).toBe(true);
		expect(value).toBe(2);
	});

	it('clears the redo branch when a new applied edit is recorded', () => {
		const history = new CompositionEditHistory();
		let value = 1;
		history.recordApplied({
			label: 'First',
			undo: () => {
				value = 0;
			},
			redo: () => {
				value = 1;
			}
		});
		expect(value).toBe(1);
		history.undo();
		value = 3;
		expect(value).toBe(3);
		history.recordApplied({
			label: 'Replacement',
			undo: () => {
				value = 0;
			},
			redo: () => {
				value = 3;
			}
		});

		expect(history.canRedo).toBe(false);
		expect(history.redo()).toBe(false);
		expect(history.undoLabel).toBe('Replacement');
		expect(history.undo()).toBe(true);
		expect(value).toBe(0);
	});

	it('clears composition-scoped history on demand', () => {
		const history = new CompositionEditHistory();
		history.recordApplied({ label: 'Edit', undo: () => undefined, redo: () => undefined });
		history.clear();

		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
	});
});
