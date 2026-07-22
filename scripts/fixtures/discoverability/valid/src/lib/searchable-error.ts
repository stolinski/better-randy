export function failPresetExport(id: string): never {
	throw new Error(`Preset export failed for ${id}`);
}
