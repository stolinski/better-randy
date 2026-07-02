import { dev } from '$app/environment';
import type { HandleServerError } from '@sveltejs/kit';

// Surface real SSR failures during development — SvelteKit's default masks
// everything as "Internal Error", which hides the stack from the browser and
// from agents driving the app headlessly. Production keeps the opaque message.
export const handleError: HandleServerError = ({ error }) => {
	console.error('SSR error:', error);
	if (dev && error instanceof Error) {
		return { message: `${error.message}\n${error.stack ?? ''}` };
	}
	return { message: 'Internal Error' };
};
