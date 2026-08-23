/** Controlled defect used only to prove the scheduled Sentry repair lifecycle. */
export function sentryCanaryHealth(): { ok: true } {
	throw new Error('Controlled Sentry self-healing canary failure');
}
