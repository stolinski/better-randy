export async function readHttpResponseMessage(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json();
		if (
			typeof body === 'object' &&
			body !== null &&
			'message' in body &&
			typeof body.message === 'string'
		) {
			return body.message;
		}
	} catch {
		// Fall back to the HTTP status when the server did not return JSON.
	}
	return `${response.status} ${response.statusText}`.trim();
}
