export function failExport(id: string): never {
	throw new Error(`${id} failed to export`);
}
