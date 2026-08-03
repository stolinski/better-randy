<script lang="ts">
	import { engineState, packState } from './engine-state.svelte';
	import { ENGINE_FONT_FAMILIES, type FontDefinition, type FontFamily } from './engine-schema';
	import { getPack } from './packs/registry';
	import { resolveFontTreatment } from './packs/resolve';
	import { getSurfaceRenderer } from './pipelines';
	import { isBodyVisible } from '$lib/utils/surface-document-slots';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';
	import TypographyColorInput from './TypographyColorInput.svelte';

	// Type voice + paper/ink colors. Hidden entirely unless the active
	// renderer's controls declare one of them for the current content.
	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [FontFamily, FontDefinition][];
	// A Pack `font-treatment` claim overrides the preset's typography voice
	// everywhere pixels render, so the select must not pretend to edit it.
	const packFontClaim = $derived(resolveFontTreatment(getPack(packState.slug)));

	const controls = $derived(getSurfaceRenderer(engineState.surface.type)?.controls ?? {});
	const showBody = $derived(isBodyVisible(controls, engineState.surface));
	const appearanceVisible = $derived(
		Boolean(
			(controls.typography && showBody) || controls.paperColor || (controls.inkColor && showBody)
		)
	);
</script>

{#if appearanceVisible}
	<InspectorSection label="Appearance">
		{#if controls.typography && showBody}
			<Field label="Font">
				<select
					bind:value={engineState.typography.fontFamily}
					disabled={packFontClaim !== null}
					title={packFontClaim !== null
						? `Type voice set by the ${getPack(packState.slug).label} Pack`
						: undefined}
				>
					{#each fontFamilyOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
		{#if controls.paperColor}
			<Field label="Paper">
				<TypographyColorInput field="paperColor" />
			</Field>
		{/if}
		{#if controls.inkColor && showBody}
			<Field label="Ink">
				<TypographyColorInput field="inkColor" />
			</Field>
		{/if}
	</InspectorSection>
{/if}
