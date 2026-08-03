<script lang="ts">
	import type { TransitionEffectEditorProps } from '$lib/platform/pipelines/types';
	import type { SeededShatterParams } from './index';

	let { params = $bindable(), onchange }: TransitionEffectEditorProps<SeededShatterParams> =
		$props();

	function setNumber(key: keyof SeededShatterParams, event: Event): void {
		params[key] = Number((event.currentTarget as HTMLInputElement).value);
		onchange();
	}
</script>

<label class="row">
	<span>Seed</span>
	<input
		value={params.seed}
		oninput={(event) => setNumber('seed', event)}
		max="65535"
		min="0"
		step="1"
		type="number"
	/>
</label>

<label class="row">
	<span>Columns</span>
	<input
		value={params.columns}
		oninput={(event) => setNumber('columns', event)}
		max="32"
		min="4"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Scatter</span>
	<input
		value={params.scatter}
		oninput={(event) => setNumber('scatter', event)}
		max="0.4"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Rotation</span>
	<input
		value={params.rotation}
		oninput={(event) => setNumber('rotation', event)}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Depth</span>
	<input
		value={params.depth}
		oninput={(event) => setNumber('depth', event)}
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
