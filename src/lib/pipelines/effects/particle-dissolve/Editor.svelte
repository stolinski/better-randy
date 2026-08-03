<script lang="ts">
	import type { TransitionEffectEditorProps } from '$lib/platform/pipelines/types';
	import type { ParticleDissolveParams } from './index';

	let { params = $bindable(), onchange }: TransitionEffectEditorProps<ParticleDissolveParams> =
		$props();

	function setNumber(key: keyof ParticleDissolveParams, event: Event): void {
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
	<span>Density</span>
	<input
		value={params.density}
		oninput={(event) => setNumber('density', event)}
		max="160"
		min="12"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Spread</span>
	<input
		value={params.spread}
		oninput={(event) => setNumber('spread', event)}
		max="0.25"
		min="0"
		step="0.001"
		type="range"
	/>
</label>

<label class="row">
	<span>Direction</span>
	<input
		value={params.direction}
		oninput={(event) => setNumber('direction', event)}
		max="180"
		min="-180"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Softness</span>
	<input
		value={params.softness}
		oninput={(event) => setNumber('softness', event)}
		max="0.3"
		min="0.01"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Luminance bias</span>
	<input
		value={params.luminanceBias}
		oninput={(event) => setNumber('luminanceBias', event)}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>
