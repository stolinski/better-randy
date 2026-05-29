/**
 * Pack → CSS-variable resolution (ADR-0023 appearance-only, ADR-0024 hybrid
 * fallback). Turns a Pipeline's core appearance vocabulary into a CSS custom
 * property map the mount injects on the Pipeline's root, so the CanvasSource
 * consumes `var(--fill)` / `var(--accent)` etc. and the active Pack drives the
 * pixels. Per ADR-0024 each slot resolves specific → core:
 *
 *   `<pipeline>.<core>` (per-Pipeline override)
 *     → `<core>-treatment` (core vocabulary)
 *       → `<core>` (bare core alias)
 *         → unset (the CanvasSource's `var(--x, <fallback>)` default applies)
 *
 * Only string-valued `style` Roles become CSS vars; structural Roles (edge
 * recipes, depth rigs, chrome) are consumed in code, not here.
 */
import type { PackManifest } from './types';

const CORE_APPEARANCE = ['fill', 'ink', 'accent', 'edge', 'depth', 'light'] as const;

/**
 * Only color-valued style Roles become CSS vars. Many Roles are non-color
 * tokens (`'tabular-lining'`, `'slot-machine-roll'`, `'flat'`, `'sharp'`) that
 * are consumed in code, not CSS — emitting them as `--x` would be junk.
 */
function isColorValue(value: string): boolean {
	return /^#[0-9a-f]{3,8}$/i.test(value) || /^(rgb|hsl|oklch|oklab|color|hwb)\(/i.test(value);
}

export function resolveAppearanceVars(
	manifest: PackManifest,
	pipelineType: string
): Record<string, string> {
	const vars: Record<string, string> = {};
	const prefix = `${pipelineType}.`;

	// 1. Every per-Pipeline string `style` Role becomes a CSS var named after its
	//    suffix — `lower-third.roleInk` → `--roleInk`. A Pipeline can declare any
	//    color slots it needs beyond the core vocabulary; the CanvasSource just
	//    references the matching `var(--<suffix>, <fallback>)`.
	for (const [key, role] of Object.entries(manifest.roles)) {
		if (
			key.startsWith(prefix) &&
			role.kind === 'style' &&
			typeof role.value === 'string' &&
			isColorValue(role.value)
		) {
			vars[`--${key.slice(prefix.length)}`] = role.value;
		}
	}

	// 2. Core-vocabulary fallback (ADR-0024): fill any core slot a per-Pipeline
	//    Role didn't already set, from the Pack's core `<core>-treatment` / `<core>`.
	for (const core of CORE_APPEARANCE) {
		if (vars[`--${core}`] !== undefined) {
			continue;
		}
		const role = manifest.roles[`${core}-treatment`] ?? manifest.roles[core];
		if (role && role.kind === 'style' && typeof role.value === 'string' && isColorValue(role.value)) {
			vars[`--${core}`] = role.value;
		}
	}

	return vars;
}

/** Serialize a resolved var map into an inline-style fragment. */
export function appearanceVarsToStyle(vars: Record<string, string>): string {
	return Object.entries(vars)
		.map(([name, value]) => `${name}:${value}`)
		.join(';');
}
