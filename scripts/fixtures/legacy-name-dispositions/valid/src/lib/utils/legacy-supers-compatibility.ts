// The reader module names every accepted legacy spelling in one place.
export const ACCEPTED_COMPOSITION_SCHEMA_IDS = ['gfx@1', 'supers@1'] as const;
export const ACCEPTED_MARKER_SYNC_SCHEMAS = ['gfx-sync@1', 'supers-sync@1'] as const;
export const SWEPT_EXPORT_DIRECTORY_PREFIXES = ['gfx-export-', 'supers-export-'] as const;

export function readGfxEnvironmentValue(
	environment: Record<string, string | undefined>,
	gfxName: `GFX_${string}`
): string | undefined {
	return environment[gfxName] ?? environment[`SUPERS_${gfxName.slice('GFX_'.length)}`];
}
