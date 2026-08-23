import { json } from '@sveltejs/kit';

import { sentryCanaryHealth } from './canary-health';

export function GET(): Response {
	return json(sentryCanaryHealth());
}
