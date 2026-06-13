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
	return (
		/^#[0-9a-f]{3,8}$/i.test(value) ||
		/^(rgba?|hsla?|oklch|oklab|color|hwb)\(/i.test(value)
	);
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

/**
 * A resolved hard-offset depth shadow, in 4K-reference pixels. Consumers scale
 * `dx`/`dy`/`blur` by their own composition-resolution factor before painting.
 * `color` is a ready-to-use CSS colour token (a literal, `currentColor`, or a
 * `var(--ink, …)` reference) — the `'fg'` foreground sentinel has already been
 * substituted by `resolveDepthTreatment`.
 */
export interface DepthShadow {
	dx: number;
	dy: number;
	blur: number;
	color: string;
}

interface HardOffsetRig {
	dx: number;
	dy: number;
	blur?: number;
	color?: string;
}

function isHardOffsetRig(value: unknown): value is HardOffsetRig {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { dx?: unknown }).dx === 'number' &&
		typeof (value as { dy?: unknown }).dy === 'number'
	);
}

/**
 * Resolve a Pipeline's structural `depth` Role to a hard-offset shadow rig —
 * the first structural (non-colour) Pack Role wired to pixels (ADR-0023 lists
 * depth as appearance; ADR-0019 puts it on graphic-kind Identity Specs). Like
 * the colour path, resolution is specific → core (ADR-0024):
 *
 *   `<pipelineType>.depth` (per-Pipeline override)
 *     → `depth-treatment` (core depth vocabulary)
 *       → `null` (the consumer paints no Pack shadow)
 *
 * A depth Role is either a hard-offset rig (`{ hardOffset | offset: { dx, dy,
 * blur?, color? } }`) or a keyword string (`'none'`, `'flat'`, …). Keywords and
 * any unrecognised shape resolve to `null` — only a rig produces a shadow. The
 * `'fg'` (or absent) colour sentinel is substituted with `foreground` so a Pack
 * can say "shadow in this Pipeline's ink" without naming the colour twice.
 */
export function resolveDepthTreatment(
	manifest: PackManifest,
	pipelineType: string,
	foreground = 'currentColor'
): DepthShadow | null {
	const role = manifest.roles[`${pipelineType}.depth`] ?? manifest.roles['depth-treatment'];
	if (!role || role.kind !== 'style') {
		return null;
	}

	const rigSource = role.value as { hardOffset?: unknown; offset?: unknown };
	const rig = rigSource?.hardOffset ?? rigSource?.offset;
	if (!isHardOffsetRig(rig)) {
		return null;
	}

	return {
		dx: rig.dx,
		dy: rig.dy,
		blur: rig.blur ?? 0,
		color: rig.color === undefined || rig.color === 'fg' ? foreground : rig.color
	};
}
