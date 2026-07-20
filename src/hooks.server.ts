import { dev } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';

// Log every error response server-side. Intentional error(...) HttpErrors from
// endpoints never reach handleError — without this hook they leave no trace in
// the dev-server logs at all (only unexpected crashes get logged).
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (response.status >= 400) {
		const line = `[${new Date().toISOString()}] ${response.status} ${event.request.method} ${event.url.pathname}${event.url.search}`;
		if (response.status >= 500) {
			const body = await response.clone().text();
			console.error(`${line}\n${body.slice(0, 2000)}`);
		} else {
			console.error(line);
		}
	}
	return response;
};

// Surface real SSR failures during development — SvelteKit's default masks
// everything as "Internal Error", which hides the stack from the browser and
// from agents driving the app headlessly. Production keeps the opaque message.
export const handleError: HandleServerError = ({ error, event }) => {
	console.error(
		`[${new Date().toISOString()}] SSR error at ${event.url.pathname}${event.url.search}:`,
		error
	);
	if (dev && error instanceof Error) {
		return { message: `${error.message}\n${error.stack ?? ''}` };
	}
	return { message: 'Internal Error' };
};
