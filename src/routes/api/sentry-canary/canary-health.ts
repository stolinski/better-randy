export function sentryCanaryHealth(): { ok: true } {
	throw new Error('CanaryProbeUninterrupted forced failure');
}
