<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

	import { engineState, readMarkColor } from './engine-state.svelte';
	import { resolveMarkForIndex, type MarkAppearance } from './engine-schema';
	import { listSurfaceMarkInstances } from './surface-mark-instances';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	// Mark default appearance (marks.defaults): one row per style actually
	// present in the composition's body / message texts, in first-use order.
	// Empty → no section.
	const MARK_STYLE_LABELS: Record<AnnotationMarkStyle, string> = {
		highlight: 'Highlight',
		underline: 'Underline',
		strike: 'Strike',
		circle: 'Circle',
		box: 'Box',
		'side-note': 'Side note',
		magnify: 'Magnify',
		'lift-out': 'Lift out',
		'tear-out': 'Tear out',
		isolate: 'Isolate'
	};

	const markStylesInUse = $derived.by(() => {
		const styles: AnnotationMarkStyle[] = [];
		for (const instance of listSurfaceMarkInstances(engineState.surface)) {
			if (!styles.includes(instance.style)) styles.push(instance.style);
		}
		return styles;
	});

	// The style's effective default appearance. An out-of-range timing index
	// makes resolveMarkForIndex skip per-timing overrides and fall back to
	// marks.defaults[style] (or the engine fallback) — exactly what an
	// unoverridden mark renders with.
	function markDefaultAppearance(style: AnnotationMarkStyle): MarkAppearance {
		const resolved = resolveMarkForIndex(
			style,
			engineState.marks.timings.length,
			engineState.marks,
			readMarkColor(style)
		);
		return { color: resolved.color, intensity: resolved.intensity };
	}

	function setMarkDefault(style: AnnotationMarkStyle, patch: Partial<MarkAppearance>): void {
		engineState.marks.defaults[style] = { ...markDefaultAppearance(style), ...patch };
	}
</script>

{#if markStylesInUse.length > 0}
	<InspectorSection label="Marks">
		{#each markStylesInUse as style (style)}
			{@const appearance = markDefaultAppearance(style)}
			<Field label={MARK_STYLE_LABELS[style]}>
				<!-- The swatch value is set client-side only: an SSR'd `value` attribute
				     on a color input makes Svelte's hydration default-removal pass strip
				     it (transiently ""), which Chrome logs as a #rrggbb format warning. -->
				<input
					type="color"
					aria-label={`${MARK_STYLE_LABELS[style]} color`}
					{@attach (el) => {
						el.value = markDefaultAppearance(style).color;
					}}
					oninput={(e) =>
						setMarkDefault(style, { color: (e.currentTarget as HTMLInputElement).value })}
				/>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={appearance.intensity}
					aria-label={`${MARK_STYLE_LABELS[style]} intensity`}
					oninput={(e) =>
						setMarkDefault(style, {
							intensity: Number((e.currentTarget as HTMLInputElement).value)
						})}
				/>
			</Field>
		{/each}
	</InspectorSection>
{/if}
