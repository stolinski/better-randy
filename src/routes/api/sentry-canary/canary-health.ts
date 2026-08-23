export function sentryCanaryHealth(): { ok: true } {
	throw new Error('CanaryProbeTerminalPass forced failure');
}
