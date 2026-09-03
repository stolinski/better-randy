<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { parseUnitIntervalInput } from './stage-camera-editing';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The Focus inspector (ADR-0060 §2): what the Focus row opens. The focal
	// plane, the aperture, the sharp band, and the rack focus whose window the
	// row's clip is.
	function toggleRackFocus(): void {
		const stage = engineState.stage;
		if (!stage) return;
		stage.focus.pull = stage.focus.pull ? undefined : { from: 0, to: 1, start: 0.1, duration: 0.3 };
	}

	function setFraction<K extends string>(
		target: Record<K, number>,
		key: K,
		event: Event & { currentTarget: HTMLInputElement }
	): void {
		const n = parseUnitIntervalInput(event.currentTarget.value);
		if (n !== null) target[key] = n;
	}
</script>

{#if engineState.stage}
	{@const stage = engineState.stage}
	<InspectorSection label="Focus">
		<Field label="Focus Z">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.focusZ}
				oninput={(e) => setFraction(stage.focus, 'focusZ', e)}
			/>
		</Field>
		<Field label="Aperture">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.aperture}
				oninput={(e) => setFraction(stage.focus, 'aperture', e)}
			/>
		</Field>
		<Field label="Band">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.band}
				oninput={(e) => setFraction(stage.focus, 'band', e)}
			/>
		</Field>
		<Field label="Rack focus">
			<InspectorToggle checked={!!stage.focus.pull} label="Rack focus" onchange={toggleRackFocus} />
		</Field>
		{#if stage.focus.pull}
			{@const pull = stage.focus.pull}
			<Field label="From → To">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.from}
					aria-label="Rack focus from depth"
					oninput={(e) => setFraction(pull, 'from', e)}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.to}
					aria-label="Rack focus to depth"
					oninput={(e) => setFraction(pull, 'to', e)}
				/>
			</Field>
			<Field label="Window">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.start}
					aria-label="Rack focus start"
					placeholder="start"
					oninput={(e) => setFraction(pull, 'start', e)}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.duration}
					aria-label="Rack focus duration"
					placeholder="dur"
					oninput={(e) => setFraction(pull, 'duration', e)}
				/>
			</Field>
		{/if}
	</InspectorSection>
{/if}
