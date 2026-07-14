<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { PaperGrainParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<PaperGrainParams> = $props();

	// Params added to the schema after a preset was authored are ABSENT from
	// its state (schema .default() does not materialize on load — see the
	// overlay-schema-defaults lesson). Never `bind:` a possibly-absent param
	// to a range input: an unset range defaults to its midpoint and the
	// binding writes it back on first render — a phantom edit that forked
	// every visited composition carrying this effect (dex 9w2rvngk) and
	// changed its pixels (lift 0.5 nobody authored). Display the schema
	// default read-only; write only on real user input.
</script>

<label class="row">
	<span>Warmth</span>
	<input
		value={effect.params.warmth ?? 0.5}
		oninput={(e) => (effect.params.warmth = Number(e.currentTarget.value))}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Density</span>
	<input
		value={effect.params.density ?? 0.3}
		oninput={(e) => (effect.params.density = Number(e.currentTarget.value))}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Lift</span>
	<input
		value={effect.params.lift ?? 0}
		oninput={(e) => (effect.params.lift = Number(e.currentTarget.value))}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>
