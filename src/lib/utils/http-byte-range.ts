export interface HttpByteRange {
	start: number;
	end: number;
}

/** Parse one RFC 9110 byte range. Multi-range responses are intentionally unsupported. */
export function parseHttpByteRange(value: string | null, size: number): HttpByteRange | null {
	if (value === null) return null;
	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new RangeError('HTTP byte range requires a positive safe resource size.');
	}
	if (!value.startsWith('bytes=') || value.includes(',')) {
		throw new RangeError('HTTP byte range must contain exactly one bytes range.');
	}

	const match = /^(\d*)-(\d*)$/.exec(value.slice('bytes='.length));
	if (!match || (match[1] === '' && match[2] === '')) {
		throw new RangeError('HTTP byte range is malformed.');
	}

	if (match[1] === '') {
		const suffixLength = Number(match[2]);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
			throw new RangeError('HTTP suffix byte range must be positive.');
		}
		return { start: Math.max(0, size - suffixLength), end: size - 1 };
	}

	const start = Number(match[1]);
	const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(requestedEnd) ||
		start < 0 ||
		requestedEnd < start ||
		start >= size
	) {
		throw new RangeError('HTTP byte range is not satisfiable.');
	}

	return { start, end: Math.min(requestedEnd, size - 1) };
}
