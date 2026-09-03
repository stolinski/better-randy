<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import type { Stage } from './engine-schema';
	import { listSubstrateAssets } from './substrate-textures';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The depth stage as the composition root sees it (ADR-0021/0027/0028): the
	// switch and the backdrop the far plane carries. Its entities — the camera,
	// the focus, the bodies — are selected on the timeline and edited in their
	// own inspectors (ADR-0060). Unavailable while Video clips are on the
	// timeline (the stage is a synthetic-camera construct).
	const substrateAssets = listSubstrateAssets();

	function ensureStage(): Stage {
		if (!engineState.stage) {
			engineState.stage = {
				type: 'depth',
				camera: { move: 'static', amount: 0.5, ease: 'smooth' },
				focus: { focusZ: 0, aperture: 0.6, band: 0 }
			};
		}
		return engineState.stage;
	}

	function toggleStage(): void {
		if (engineState.media.videoTrack.clips.length > 0) return;
		if (engineState.stage) {
			engineState.stage = undefined;
		} else {
			ensureStage();
		}
	}

	function toggleBackdropImage(): void {
		const stage = ensureStage();
		if (!stage.backdrop) stage.backdrop = { contrast: 0 };
		if (stage.backdrop.image) {
			stage.backdrop.image = undefined;
		} else {
			stage.backdrop.image = { asset: substrateAssets[0] ?? 'atmosphere-warm' };
		}
	}
</script>

<InspectorSection label="Depth Stage" summary={engineState.stage ? 'On' : 'Off'}>
	{#snippet action()}
		<InspectorToggle
			checked={!!engineState.stage}
			label="Depth stage"
			disabled={engineState.media.videoTrack.clips.length > 0}
			onchange={toggleStage}
		/>
	{/snippet}
	{#if engineState.stage}
		{@const stage = engineState.stage}
		<Field label="Backdrop">
			<InspectorToggle
				checked={!!stage.backdrop?.image}
				label="Backdrop image"
				onchange={toggleBackdropImage}
			/>
		</Field>
		{#if stage.backdrop?.image}
			<Field label="Asset">
				<select
					value={stage.backdrop.image.asset}
					onchange={(e) => {
						const s = ensureStage();
						if (!s.backdrop) s.backdrop = { contrast: 0 };
						if (!s.backdrop.image) s.backdrop.image = { asset: '' };
						s.backdrop.image.asset = (e.currentTarget as HTMLSelectElement).value;
					}}
				>
					{#each substrateAssets as asset (asset)}
						<option value={asset}>{asset}</option>
					{/each}
				</select>
			</Field>
			<Field label="Contrast">
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={stage.backdrop.contrast}
					oninput={(e) => {
						const s = ensureStage();
						if (!s.backdrop) s.backdrop = { contrast: 0 };
						s.backdrop.contrast = Number((e.currentTarget as HTMLInputElement).value);
					}}
				/>
			</Field>
		{/if}
	{/if}
</InspectorSection>
