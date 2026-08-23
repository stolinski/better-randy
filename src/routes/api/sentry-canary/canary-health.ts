export function sentryCanaryHealth(): { ok: true } {
	throw new Error('CanaryProbeSecondPass forced failure');
}
