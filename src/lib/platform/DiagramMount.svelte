<script lang="ts">
	import { animState, type OverlayChannelValues } from './anim-state.svelte';
	import { engineState, packState } from './engine-state.svelte';
	import { getPack } from './packs/registry';
	import {
		appearanceVarsToStyle,
		resolveAppearanceVars,
		resolveDepthTreatment,
		resolveFontTreatment,
		resolveTypographyColors
	} from './packs/resolve';
	import { ENGINE_FONT_FAMILIES, type DiagramElement } from './engine-schema';
	import LabelSource from '$lib/pipelines/blocks/label/CanvasSource.svelte';
	import NodeSource from '$lib/pipelines/blocks/node/CanvasSource.svelte';
	import StatCalloutSource from '$lib/pipelines/blocks/stat-callout/CanvasSource.svelte';
	import { isDarkSurfaceColor } from '$lib/utils/color';

	// The DOM half of the diagram Block layer (ADR-0036): node / label /
	// stat-callout mounted at their explicit composition fractions, plus the
	// timeline-segment's caption. Lives inside `.composition` beside the
	// SurfaceMount so the surface pipeline's DOM capture carries it on the
	// SURFACE plane in every render path (flat, DOF split, depth stage) — a
	// diagram parallaxes with the surface it annotates, never with overlays.
	// Stroke elements (edge-arrow, the segment's rule) render in the pipelines'
	// marks canvas, not here.

	const elements = $derived(engineState.surface.diagram ?? []);
	const pack = $derived(getPack(packState.slug));

	// The diagram's inherited ink (each element's currentColor floor) resolves
	// override → Pack core ink-treatment (ADR-0038), matching body text.
	const diagramInk = $derived(resolveTypographyColors(pack, engineState.typography).inkColor);

	// The mount root's voice: a Pack `font-treatment` claim beats the preset's
	// typography voice key (the same specific-beats-general rule as colours);
	// no claim, the composition's ENGINE_FONT_FAMILIES voice decides.
	const fontStack = $derived(
		resolveFontTreatment(pack) ??
			ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]?.stack ??
			ENGINE_FONT_FAMILIES.sans.stack
	);

	// Transparent piece (no backgroundFill, no stage backdrop): the diagram ink
	// composites over unknown footage, so DOM elements carry a two-zone
	// legibility halo by default — G5's worst-case floor must hold over bright
	// footage, and naked single-colour text over transparent is rejected.
	// text-shadow inherits and paints without compositing-layer promotion (a
	// CSS filter would drop out of the HTML-in-canvas capture). Full-frame
	// pieces skip it: their contrast is authored against a known field.
	const isTransparentPiece = $derived(
		engineState.backgroundFill === undefined && engineState.stage === undefined
	);
	const textGuard = $derived(
		isTransparentPiece ? '0 2px 18px rgb(0 0 0 / 0.55), 0 1px 5px rgb(0 0 0 / 0.5)' : undefined
	);

	// A segment's caption clears the rule PERPENDICULAR to the span direction —
	// a horizontal span captions above its midpoint; a vertical rail captions
	// beside it (left-edge anchored so the centred text can't reach back across
	// the stroke). An orientation-blind fixed offset put vertical captions ON
	// the rail (Critic finding, docu-timeline-build-vertical).
	function isVerticalSpan(element: DiagramElement & { type: 'timeline-segment' }): boolean {
		return (
			Math.abs(element.to.y - element.from.y) > Math.abs(element.to.x - element.from.x)
		);
	}

	function centerFor(element: DiagramElement): { x: number; y: number } {
		if (element.type === 'edge-arrow') {
			return { x: 0, y: 0 };
		}
		if (element.type === 'timeline-segment') {
			const mid = {
				x: (element.from.x + element.to.x) / 2,
				y: (element.from.y + element.to.y) / 2
			};
			// The rule itself is stroke-drawn in the pipeline.
			return isVerticalSpan(element)
				? { x: mid.x + 0.033, y: mid.y }
				: { x: mid.x, y: mid.y - 0.045 };
		}
		return element.position;
	}

	function channelsFor(element: DiagramElement): OverlayChannelValues | null {
		return animState.blockChannels[element.id] ?? null;
	}

	function positionStyle(element: DiagramElement, channels: OverlayChannelValues | null): string {
		const center = centerFor(element);
		// Channel x/y are composition-fraction deltas from the authored position
		// (ADR-0035 §3), folded straight into the percentage placement.
		const x = (center.x + (channels?.x ?? 0)) * 100;
		const y = (center.y + (channels?.y ?? 0)) * 100;
		// Beside a vertical rail the caption anchors its LEFT edge (not its
		// centre) so the text grows away from the stroke, never back across it.
		const anchor =
			element.type === 'timeline-segment' && isVerticalSpan(element) ? ';translate:0 -50%' : '';
		return `left:${x}%;top:${y}%${anchor}`;
	}

	// Intrinsic entrance forms per type — the pipeline-owned motion-form
	// (Identity Spec, ADR-0035 §2: what you get when the composition doesn't
	// take the pen). Node: scale-settle. Label / segment caption: short rise.
	// Stat-callout: plain fade (the roll is the show). All fade with the exit
	// alpha; an exit never un-draws or un-scales.
	function intrinsicStyle(element: DiagramElement): string {
		const progress = Math.max(0, Math.min(1, animState.blockProgresses[element.id] ?? 0));
		const alpha = Math.max(0, Math.min(1, animState.blockAlphas[element.id] ?? 1));
		const opacity = progress * alpha;
		const baseScale = 'scale' in element ? (element.scale ?? 1) : 1;

		if (element.type === 'node') {
			return `opacity:${opacity};scale:${baseScale * (0.85 + 0.15 * progress)}`;
		}
		if (element.type === 'label' || element.type === 'timeline-segment') {
			const rise = (1 - progress) * 24;
			return `opacity:${opacity};transform:translateY(${rise}px);scale:${baseScale}`;
		}
		return `opacity:${opacity};scale:${baseScale}`;
	}

	// Composition-owned styling (ADR-0035 §2): the authored channels replace the
	// intrinsic entrance outright. Scale/rotation are absolute channel values
	// seeded from the element's static `scale`.
	function channelStyle(element: DiagramElement, channels: OverlayChannelValues): string {
		const opacity = Math.max(0, Math.min(1, channels.opacity));
		const parts = [`opacity:${opacity}`, `scale:${channels.scale}`];
		if (channels.rotation !== 0) {
			parts.push(`rotate:${channels.rotation}deg`);
		}
		return parts.join(';');
	}

	// Pack appearance per element type (ADR-0024 resolution), plus the node's
	// structural depth rig as a ready CSS shadow and a box-ink that follows the
	// resolved fill's luminance — a white card wants dark text even when the
	// composition's ink is footage-white.
	function appearanceStyle(element: DiagramElement): string {
		const vars = resolveAppearanceVars(pack, element.type);
		let style = appearanceVarsToStyle(vars);
		if (element.type === 'node') {
			// The 'fg' shadow-colour sentinel resolves through the node's own
			// mount-injected `--ink` (ADR-0024) — never a baked colour; a Pack
			// that wants a specific shadow colour names it in the rig.
			const depth = resolveDepthTreatment(pack, 'node', 'var(--ink)');
			if (depth) {
				// Branch on the resolved depth kind: reflective packs cast a
				// hard-offset shadow; emissive packs bloom — a centered two-layer
				// phosphor halo (hot core + naturally-dimmer wide skirt), never an
				// offset. box-shadow captures in HTML-in-Canvas; CSS filters do not.
				const shadow =
					depth.kind === 'glow'
						? `0 0 ${depth.radius}px color-mix(in srgb, ${depth.color} ${Math.round(depth.intensity * 100)}%, transparent), 0 0 ${depth.radius * 2.25}px color-mix(in srgb, ${depth.color} ${Math.round(depth.intensity * 45)}%, transparent)`
						: `${depth.dx}px ${depth.dy}px ${depth.blur}px ${depth.color}`;
				style += `;--node-shadow:${shadow}`;
			}
			const fill = vars['--fill'];
			if (fill) {
				// Computed CONTRAST decision, not a brand claim: the box's text/border
				// ink is picked light-or-dark against the resolved Pack fill's
				// luminance so a white card keeps dark text even when the
				// composition's ink is footage-white. The pair is intentionally
				// near-black/near-white — legibility poles, not palette colours.
				style += `;--node-box-ink:${isDarkSurfaceColor(fill) ? '#ffffff' : '#0c0c0c'}`;
			}
		}
		return style;
	}
</script>

{#if elements.length > 0}
	<div
		class="diagram-mount"
		style:font-family={fontStack}
		style:color={diagramInk}
		style:text-shadow={textGuard}
	>
		{#each elements as element (element.id)}
			{#if element.type !== 'edge-arrow'}
				{@const channels = channelsFor(element)}
				{#if element.type !== 'timeline-segment' || element.label}
					<div
						class="diagram-mount__item"
						data-diagram-element={element.id}
						data-diagram-node={element.type === 'node' ? element.id : undefined}
						style="{positionStyle(element, channels)};{channels
							? channelStyle(element, channels)
							: intrinsicStyle(element)};{appearanceStyle(element)}"
					>
						{#if element.type === 'node'}
							<NodeSource block={element} />
						{:else if element.type === 'label'}
							<LabelSource block={element} />
						{:else if element.type === 'stat-callout'}
							<StatCalloutSource block={element} />
						{:else}
							<span class="diagram-mount__segment-label">{element.label}</span>
						{/if}
					</div>
				{/if}
			{/if}
		{/each}
	</div>
{/if}

<style>
	.diagram-mount {
		inset: 0;
		pointer-events: none;
		position: absolute;
	}

	.diagram-mount__item {
		position: absolute;
		/* Elements centre on their authored point — GUI drag and the stroke
		   endpoints both reason about centres. CSS `translate` handles the
		   centring so `transform` stays free for the entrance rise. */
		translate: -50% -50%;
		transform-origin: center;
	}

	.diagram-mount__segment-label {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: calc(2.2 * var(--cqmin));
		font-weight: 600;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
</style>
