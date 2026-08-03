<script lang="ts">
	import type { TransitionEffectEditorProps } from '$lib/platform/pipelines/types';
	import type { SheetPeelParams } from './index';

	type SheetPeelNumberParam = Exclude<keyof SheetPeelParams, 'direction'>;

	let { params = $bindable(), onchange }: TransitionEffectEditorProps<SheetPeelParams> = $props();

	function setDirection(event: Event): void {
		params.direction = (event.currentTarget as HTMLSelectElement)
			.value as SheetPeelParams['direction'];
		onchange();
	}

	function setNumber(key: SheetPeelNumberParam, event: Event): void {
		params[key] = Number((event.currentTarget as HTMLInputElement).value);
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
	<span>Curl</span>
	<input
		value={params.curl}
		oninput={(event) => setNumber('curl', event)}
		max="0.35"
		min="0.04"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Perspective</span>
	<input
		value={params.perspective}
		oninput={(event) => setNumber('perspective', event)}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Shadow</span>
	<input
		value={params.shadow}
		oninput={(event) => setNumber('shadow', event)}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Highlight</span>
	<input
		value={params.highlight}
		oninput={(event) => setNumber('highlight', event)}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>
