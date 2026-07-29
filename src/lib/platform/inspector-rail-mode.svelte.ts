export type InspectorRailMode = 'inspector' | 'media';

export class InspectorRailModeManager {
	mode = $state<InspectorRailMode>('inspector');

	switchToInspector(): void {
		this.mode = 'inspector';
	}

	switchToMedia(): void {
		this.mode = 'media';
	}
}

export function createInspectorRailModeManager(): InspectorRailModeManager {
	return new InspectorRailModeManager();
}

export const inspectorRailMode = createInspectorRailModeManager();
