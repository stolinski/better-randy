export interface StageRegistration {
	type: string;
	label: string;
}

export const STAGE_REGISTRY: Readonly<Record<string, StageRegistration>> = {
	depth: { type: 'depth', label: 'Depth' }
};

export function getStageRegistration(type: string): StageRegistration | null {
	return Object.values(STAGE_REGISTRY).find((registration) => registration.type === type) ?? null;
}
