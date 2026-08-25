/** Compare text by UTF-16 code units without host locale or collation data. */
export function compareCanonicalText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
