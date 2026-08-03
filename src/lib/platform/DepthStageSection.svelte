<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { ENGINE_EASES, type Ease, type Stage } from './engine-schema';
	import { listSubstrateAssets } from './substrate-textures';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The depth stage (ADR-0021/0027/0028): camera move, focus plane, rack
	// focus, and the substrate backdrop. Unavailable while Video clips are on
	// the timeline (the stage is a synthetic-camera construct).
	const substrateAssets = listSubstrateAssets();
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

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

	function toggleRackFocus(): void {
		const stage = ensureStage();
		if (stage.focus.pull) {
			stage.focus.pull = undefined;
		} else {
			stage.focus.pull = { from: 0, to: 1, start: 0.1, duration: 0.3 };
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

	function clampedUnitInterval(value: string): number | null {
		const n = Number(value);
		return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
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
		<Field label="Camera">
			<select
				value={stage.camera.move}
				onchange={(e) => {
					ensureStage().camera.move = (e.currentTarget as HTMLSelectElement).value as
						| 'static'
						| 'push'
						| 'drift';
				}}
			>
				<option value="static">Static</option>
				<option value="push">Push</option>
				<option value="drift">Drift</option>
			</select>
		</Field>
		{#if stage.camera.move !== 'static'}
			<Field label="Amount">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={stage.camera.amount ?? 0.15}
					oninput={(e) => {
						ensureStage().camera.amount =
							parseFloat((e.currentTarget as HTMLInputElement).value) || 0.15;
					}}
				/>
			</Field>
			<Field label="Ease">
				<select
					value={stage.camera.ease}
					onchange={(e) => {
						ensureStage().camera.ease = (e.currentTarget as HTMLSelectElement).value as Ease;
					}}
				>
					{#each easeOptions as [value, opt] (value)}
						<option {value}>{opt.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
		<Field label="Focus Z">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.focusZ}
				oninput={(e) => {
					ensureStage().focus.focusZ = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
				}}
			/>
		</Field>
		<Field label="Aperture">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.aperture}
				oninput={(e) => {
					ensureStage().focus.aperture =
						parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
				}}
			/>
		</Field>
		<Field label="Band">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={stage.focus.band}
				oninput={(e) => {
					ensureStage().focus.band = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
				}}
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
					oninput={(e) => {
						const n = clampedUnitInterval((e.currentTarget as HTMLInputElement).value);
						if (n !== null) pull.from = n;
					}}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.to}
					aria-label="Rack focus to depth"
					oninput={(e) => {
						const n = clampedUnitInterval((e.currentTarget as HTMLInputElement).value);
						if (n !== null) pull.to = n;
					}}
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
					oninput={(e) => {
						const n = clampedUnitInterval((e.currentTarget as HTMLInputElement).value);
						if (n !== null) pull.start = n;
					}}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={pull.duration}
					aria-label="Rack focus duration"
					placeholder="dur"
					oninput={(e) => {
						const n = clampedUnitInterval((e.currentTarget as HTMLInputElement).value);
						if (n !== null) pull.duration = n;
					}}
				/>
			</Field>
		{/if}
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
