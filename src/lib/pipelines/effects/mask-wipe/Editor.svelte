<script lang="ts">
	import type { TransitionEffectEditorProps } from '$lib/platform/pipelines/types';
	import type { MaskWipeParams } from './index';

	let { params = $bindable(), onchange }: TransitionEffectEditorProps<MaskWipeParams> = $props();

	function setDirection(event: Event): void {
		params.direction = (event.currentTarget as HTMLSelectElement)
			.value as MaskWipeParams['direction'];
		onchange();
	}

	function setSoftness(event: Event): void {
		params.softness = Number((event.currentTarget as HTMLInputElement).value);
		onchange();
	}
</script>

<label class="row">
	<span>Direction</span>
	<select value={params.direction} onchange={setDirection}>
		<option value="right">Right</option>
		<option value="left">Left</option>
		<option value="down">Down</option>
		<option value="up">Up</option>
	</select>
</label>

<label class="row">
	<span>Softness</span>
	<input
		value={params.softness}
		oninput={setSoftness}
		max="0.05"
		min="0.0002"
		step="0.0002"
		type="range"
	/>
</label>
