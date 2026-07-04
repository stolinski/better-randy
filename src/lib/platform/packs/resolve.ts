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
import { getRgbColorChannels } from '$lib/utils/color';
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

/**
 * The five-value edge-treatment vocabulary — how a card/clipping silhouette
 * was separated from its source material. `none` means the Pack makes no edge
 * claim (the silhouette renders exactly as captured); the other four are
 * applied by the shared edge-treatment ShaderPass
 * (`src/lib/pipelines/shader-passes/edge-treatment.ts`) as a shader-side alpha
 * mask. Never CSS — CSS masks/filters promote compositing layers, and promoted
 * layers drop out of the WICG HTML-in-Canvas capture (see
 * docs/html-in-canvas-typegpu.md).
 */
export type EdgeTreatmentMode = 'clean' | 'soft' | 'irregular' | 'torn' | 'none';

/**
 * A resolved edge treatment. Pixel fields are 4K-reference px (like
 * `DepthShadow`); the shader scales them by the composition's actual
 * resolution.
 */
export interface EdgeTreatment {
	mode: EdgeTreatmentMode;
	/** Silhouette displacement (torn/irregular) or feather radius (soft), 4K-reference px. */
	amplitudePx: number;
	/** Tear-path noise wavelength along the silhouette, 4K-reference px. */
	wavelengthPx: number;
	/** Interior fiber-rim strength at a torn boundary, 0..1 (aesthetic: 1–2 px white fiber). */
	fiber: number;
}

const EDGE_TREATMENT_MODES: readonly EdgeTreatmentMode[] = [
	'clean',
	'soft',
	'irregular',
	'torn',
	'none'
];

function isEdgeTreatmentMode(value: unknown): value is EdgeTreatmentMode {
	return typeof value === 'string' && (EDGE_TREATMENT_MODES as readonly string[]).includes(value);
}

const EDGE_MODE_DEFAULTS: Record<EdgeTreatmentMode, Omit<EdgeTreatment, 'mode'>> = {
	none: { amplitudePx: 0, wavelengthPx: 1, fiber: 0 },
	clean: { amplitudePx: 0, wavelengthPx: 1, fiber: 0 },
	soft: { amplitudePx: 7, wavelengthPx: 1, fiber: 0 },
	irregular: { amplitudePx: 12, wavelengthPx: 260, fiber: 0 },
	torn: { amplitudePx: 24, wavelengthPx: 140, fiber: 1 }
};

function readFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve a Pipeline's structural `edge` Role to one of the five edge
 * treatments — the second structural Pack Role wired to pixels (after
 * `depth`). Resolution is specific → core (ADR-0024):
 *
 *   `<pipelineType>.edge` (per-Pipeline override)
 *     → `edge-treatment` (core edge vocabulary)
 *       → `null` (no Pack edge claim; no pass runs)
 *
 * An edge Role is either a bare keyword (`'torn'`, `'clean'`, …) or an object
 * `{ mode, amplitudePx?, wavelengthPx?, fiber? }` overriding the per-mode
 * defaults. Legacy / unrecognised shapes (colour strings, `'sharp'`,
 * `'clean-vector'`, rule recipes) resolve to `null` by design — only the
 * five-value vocabulary produces a treatment, so Packs opt in explicitly and
 * pre-vocabulary Roles stay inert instead of guessing.
 */
export function resolveEdgeTreatment(
	manifest: PackManifest,
	pipelineType: string
): EdgeTreatment | null {
	const role = manifest.roles[`${pipelineType}.edge`] ?? manifest.roles['edge-treatment'];
	if (!role || role.kind !== 'style') {
		return null;
	}

	const value = role.value;
	if (isEdgeTreatmentMode(value)) {
		return { mode: value, ...EDGE_MODE_DEFAULTS[value] };
	}

	if (value !== null && typeof value === 'object') {
		const shaped = value as {
			mode?: unknown;
			amplitudePx?: unknown;
			wavelengthPx?: unknown;
			fiber?: unknown;
		};
		if (isEdgeTreatmentMode(shaped.mode)) {
			const defaults = EDGE_MODE_DEFAULTS[shaped.mode];
			return {
				mode: shaped.mode,
				amplitudePx: readFiniteNumber(shaped.amplitudePx) ?? defaults.amplitudePx,
				wavelengthPx: readFiniteNumber(shaped.wavelengthPx) ?? defaults.wavelengthPx,
				fiber: readFiniteNumber(shaped.fiber) ?? defaults.fiber
			};
		}
	}

	return null;
}

/**
 * The named key-light directions a Pack can claim. Scene consumers (the
 * ADR-0028 depth stage) map these to real light vectors; the vocabulary stays
 * appearance ("Syntax is lit from the upper-left"), the geometry stays the
 * consumer's.
 */
export type LightDirection = 'upper-left' | 'upper-right' | 'top' | 'left' | 'right';

/** A resolved scene-light treatment: where the key comes from and how hard. */
export interface LightTreatment {
	direction: LightDirection;
	/** Key strength 0..1 — drives both the received rake and cast-shadow depth. */
	intensity: number;
}

const LIGHT_DIRECTIONS: readonly LightDirection[] = [
	'upper-left',
	'upper-right',
	'top',
	'left',
	'right'
];

function isLightDirection(value: unknown): value is LightDirection {
	return typeof value === 'string' && (LIGHT_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve the Pack's composition-wide scene light — the third structural Role
 * wired to pixels (after `depth` and `edge`), consumed by the ADR-0028 depth
 * stage as a real key light (received rake + cast plane-to-plane shadow).
 *
 * Unlike the other structural resolvers this reads ONLY the core
 * `light-treatment` Role: the scene light is a property of the whole staged
 * scene, not of one Pipeline — the per-Pipeline `<type>.light` Roles carry
 * per-element treatments (e.g. the lower-third's anamorphic flare) for their
 * own consumers. A Role that is absent, keyword-valued (`'none'`), or missing
 * a recognised direction resolves to `null` — no scene light.
 */
export function resolveLightTreatment(manifest: PackManifest): LightTreatment | null {
	const role = manifest.roles['light-treatment'];
	if (!role || role.kind !== 'style' || role.value === null || typeof role.value !== 'object') {
		return null;
	}
	const shaped = role.value as { direction?: unknown; intensity?: unknown };
	if (!isLightDirection(shaped.direction)) {
		return null;
	}
	const intensity = readFiniteNumber(shaped.intensity) ?? 0.45;
	return { direction: shaped.direction, intensity: Math.min(1, Math.max(0, intensity)) };
}

/**
 * Resolve a Pack colour Role to an `"R G B"` channel triplet, for composing the
 * *same* colour at several alphas in CSS (`rgb(var(--x) / <a>)`) — the cases the
 * whole-colour var path (`resolveAppearanceVars`) can't carry: gradient stops
 * and alpha fades where one Pack colour drives every stop. The Role's value may
 * be a bare hex string or an object whose `color` field holds the hex. Falls
 * back to `fallbackHex` when the Role is absent, non-hex, or unparseable.
 *
 * This is the CSS form of the rgb-channel resolver. The GPU-uniform form
 * (colour → vec3/vec4 float for a shaderPass) is deferred until a *surviving*
 * shader pipeline needs it — `shader-fill` is dead-by-use pending prove-or-remove.
 */
/**
 * The Pack-resolved diagram stroke (ADR-0036 §4): how edge-arrows and
 * timeline-segments are drawn under the active Pack — hand-drawn marker feel,
 * clean printed rule, or phosphor plotter line. `color` may be a hex or the
 * `'ink'` sentinel (resolved by the consumer to the composition's
 * `typography.inkColor`, the same channel body text rides — so a stroke stays
 * legible over footage where the preset already flipped its ink light).
 * `wobble` scales the Marks' deterministic-imperfection formula (0 = dead
 * straight); `widthPx` is 4K-reference like every other structural Role.
 */
export interface ResolvedDiagramStroke {
	color: string;
	widthPx: number;
	wobble: number;
	arrowhead: 'solid-triangle' | 'open-chevron' | 'none';
}

const DIAGRAM_STROKE_DEFAULT: ResolvedDiagramStroke = {
	color: 'ink',
	widthPx: 8,
	wobble: 0,
	arrowhead: 'solid-triangle'
};

const ARROWHEAD_FORMS: readonly ResolvedDiagramStroke['arrowhead'][] = [
	'solid-triangle',
	'open-chevron',
	'none'
];

function isArrowheadForm(value: unknown): value is ResolvedDiagramStroke['arrowhead'] {
	return typeof value === 'string' && (ARROWHEAD_FORMS as readonly string[]).includes(value);
}

/**
 * Resolve the diagram stroke + arrowhead Roles (`diagram.stroke`,
 * `diagram.arrowhead`). Structural like `depth`/`edge`: a Pack opts into
 * character explicitly; an absent or unrecognised Role resolves to the neutral
 * clean-rule default rather than guessing — the CRT phosphor line and the
 * syntax marker are Pack claims, not engine defaults.
 */
export function resolveDiagramStroke(manifest: PackManifest): ResolvedDiagramStroke {
	const resolved: ResolvedDiagramStroke = { ...DIAGRAM_STROKE_DEFAULT };

	const strokeRole = manifest.roles['diagram.stroke'];
	if (strokeRole && strokeRole.kind === 'style' && strokeRole.value !== null) {
		const value = strokeRole.value as { color?: unknown; widthPx?: unknown; wobble?: unknown };
		if (typeof value === 'object') {
			if (typeof value.color === 'string') {
				resolved.color = value.color;
			}
			const widthPx = readFiniteNumber(value.widthPx);
			if (widthPx !== undefined && widthPx > 0) {
				resolved.widthPx = widthPx;
			}
			const wobble = readFiniteNumber(value.wobble);
			if (wobble !== undefined) {
				resolved.wobble = Math.min(1, Math.max(0, wobble));
			}
		}
	}

	const arrowheadRole = manifest.roles['diagram.arrowhead'];
	if (arrowheadRole && arrowheadRole.kind === 'style' && isArrowheadForm(arrowheadRole.value)) {
		resolved.arrowhead = arrowheadRole.value;
	}

	return resolved;
}

export function resolveColorChannels(
	manifest: PackManifest,
	role: string,
	fallbackHex: string
): string {
	const entry = manifest.roles[role];
	let hex = fallbackHex;
	if (entry && entry.kind === 'style') {
		const value = entry.value;
		if (typeof value === 'string') {
			hex = value;
		} else if (
			value !== null &&
			typeof value === 'object' &&
			typeof (value as { color?: unknown }).color === 'string'
		) {
			hex = (value as { color: string }).color;
		}
	}
	try {
		const { red, green, blue } = getRgbColorChannels(hex);
		return `${red} ${green} ${blue}`;
	} catch {
		const { red, green, blue } = getRgbColorChannels(fallbackHex);
		return `${red} ${green} ${blue}`;
	}
}
