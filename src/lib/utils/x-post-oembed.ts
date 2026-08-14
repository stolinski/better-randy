export interface ImportedXPost {
	id: string;
	url: string;
	displayName: string;
	handle: string;
	body: string;
	dateLabel: string;
}

interface XStatusLocation {
	handle: string;
	statusId: string;
	url: string;
}

function decodeHtmlEntities(value: string): string {
	const named: Readonly<Record<string, string>> = {
		amp: '&',
		apos: "'",
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"'
	};
	return value
		.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16))
		)
		.replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function htmlFragmentToText(value: string): string {
	return decodeHtmlEntities(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''))
		.replace(/\u00a0/g, ' ')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function parseXStatusUrl(value: string): XStatusLocation {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError('Enter a valid X post URL');
	}

	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	if (host !== 'x.com' && host !== 'twitter.com') {
		throw new TypeError('X post URL must use x.com or twitter.com');
	}

	const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/i);
	if (!match) throw new TypeError('X post URL must include /<handle>/status/<id>');
	const [, handle, statusId] = match;
	return { handle, statusId, url: `https://x.com/${handle}/status/${statusId}` };
}

export function parseXPostOEmbed(input: unknown, sourceUrl: string): ImportedXPost {
	if (typeof input !== 'object' || input === null) {
		throw new TypeError('X returned an invalid oEmbed response');
	}
	const record = input as Record<string, unknown>;
	if (typeof record.html !== 'string' || typeof record.author_name !== 'string') {
		throw new TypeError('X oEmbed response is missing post content');
	}

	const paragraph = record.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
	if (!paragraph) throw new TypeError('X oEmbed response is missing post text');
	const anchors = [...record.html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)];
	const dateLabel = anchors.length > 0 ? htmlFragmentToText(anchors.at(-1)?.[1] ?? '') : '';
	const location = parseXStatusUrl(sourceUrl);
	const authorUrl = typeof record.author_url === 'string' ? record.author_url : '';
	let handle = location.handle;
	if (authorUrl) {
		try {
			handle = new URL(authorUrl).pathname.split('/').filter(Boolean)[0] ?? handle;
		} catch {
			// The validated source URL remains the deterministic fallback.
		}
	}

	return {
		id: location.statusId,
		url: location.url,
		displayName: decodeHtmlEntities(record.author_name).trim(),
		handle: `@${handle.replace(/^@/, '')}`,
		body: htmlFragmentToText(paragraph),
		dateLabel
	};
}
