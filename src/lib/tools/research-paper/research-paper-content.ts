export function getResearchPaperSourceLabel(sourceUrl: string): string {
	const trimmedSourceUrl = sourceUrl.trim();

	if (!trimmedSourceUrl) {
		return 'Working paper';
	}

	try {
		return new URL(trimmedSourceUrl).hostname.replace(/^www\./, '');
	} catch {
		return trimmedSourceUrl;
	}
}
