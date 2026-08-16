/**
 * Decides whether an async Preset renderer load still belongs to the active route.
 * Both tokens are required: navigation can replace route data before an older
 * dynamic import settles.
 */
export function isCurrentPresetRouteRendererLoad(
	loadGeneration: number,
	currentGeneration: number,
	loadRouteKey: string,
	currentRouteKey: string
): boolean {
	return loadGeneration === currentGeneration && loadRouteKey === currentRouteKey;
}
