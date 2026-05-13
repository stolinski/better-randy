const ELLIPSIS = '…';

export function truncateMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	const headLength = Math.ceil((maxLength - 1) / 2);
	const tailLength = Math.floor((maxLength - 1) / 2);

	return `${value.slice(0, headLength)}${ELLIPSIS}${value.slice(value.length - tailLength)}`;
}
