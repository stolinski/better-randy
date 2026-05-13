<script lang="ts">
	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import {
		ENGINE_EASES,
		FOCUS_STYLE_OPTIONS,
		QUOTE_MARK_STYLE_OPTIONS,
		type Ease
	} from '$lib/platform/engine-schema';
	import {
		engineState,
		getQuoteFocusMarkAppearance,
		getQuoteFocusSurface
	} from '$lib/platform/engine-state.svelte';
	import type { TimelineSelection } from '$lib/platform/timeline.svelte';

	interface Props {
		selection: TimelineSelection;
	}

	let { selection }: Props = $props();

	const surface = $derived(getQuoteFocusSurface());
	const markAppearance = $derived(getQuoteFocusMarkAppearance());

	const easeOptions = Object.entries(ENGINE_EASES) as [
		Ease,
		(typeof ENGINE_EASES)[Ease]
	][];

	function setMarkColor(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;

		if (surface.mark.style === 'circle') {
			engineState.marks.defaults.circle.color = target.value;
		} else {
			engineState.marks.defaults.underline.color = target.value;
		}
	}

	function setMarkIntensity(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const value = Number(target.value);

		if (surface.mark.style === 'circle') {
			engineState.marks.defaults.circle.intensity = value;
		} else {
			engineState.marks.defaults.underline.intensity = value;
		}
	}
</script>

{#if selection.trackId === 'focus'}
	<ControlGroup title="Focus">
		<label class="row">
			<span>Style</span>
			<select bind:value={surface.focus.style}>
				{#each FOCUS_STYLE_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>

		<label class="row">
			<span>Ease</span>
			<select bind:value={surface.focus.ease}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>
{:else if selection.trackId === 'mark'}
	<ControlGroup title="Mark">
		<label class="row">
			<span>Style</span>
			<select bind:value={surface.mark.style}>
				{#each QUOTE_MARK_STYLE_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>

		<label class="row">
			<span>Color</span>
			<input value={markAppearance.color} oninput={setMarkColor} type="color" />
		</label>

		<label class="row">
			<span>Intensity</span>
			<input
				value={markAppearance.intensity}
				max="1"
				min="0"
				step="0.01"
				type="range"
				oninput={setMarkIntensity}
			/>
		</label>

		<label class="row">
			<span>Ease</span>
			<select bind:value={surface.mark.ease}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>
{/if}
