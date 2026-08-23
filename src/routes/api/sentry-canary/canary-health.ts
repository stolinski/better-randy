/** Controlled defect used only to prove the scheduled Sentry repair lifecycle. */
export function sentryCanaryHealth(): { ok: true } {
	throw new Error('CanaryProbeF6BF9E9 forced failure');
}
