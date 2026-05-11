<script lang="ts">
	import type { VideoOrientation } from '$lib/utils/video-frame';

	import ControlGroup from './ControlGroup.svelte';

	interface Props {
		orientation?: VideoOrientation;
		durationSeconds?: number;
		fps?: number;
		isExporting?: boolean;
		progress?: number;
		status?: string;
		onexport?: () => void | Promise<void>;
	}

	let {
		orientation = $bindable('horizontal'),
		durationSeconds = $bindable(6),
		fps = $bindable(30),
		isExporting = false,
		progress = 0,
		status = '',
		onexport
	}: Props = $props();

	async function handleExport(): Promise<void> {
		await onexport?.();
	}
</script>

<ControlGroup title="Export">
	<label class="row">
		<span>Frame</span>
		<select bind:value={orientation}>
			<option value="horizontal">Horizontal 4K</option>
			<option value="vertical">Vertical 4K</option>
		</select>
	</label>

	<label class="row">
		<span>Duration</span>
		<input bind:value={durationSeconds} min="1" max="60" step="0.5" type="number" />
	</label>

	<label class="row">
		<span>FPS</span>
		<input bind:value={fps} min="12" max="60" step="1" type="number" />
	</label>

	{#if onexport}
		<button disabled={isExporting} onclick={handleExport} type="button">
			{isExporting ? 'Exporting' : 'Export WebM'}
		</button>
	{/if}

	{#if isExporting}
		<progress aria-label="Export progress" max="1" value={progress}></progress>
	{/if}

	{#if status}
		<p class="export-panel__status">{status}</p>
	{/if}
</ControlGroup>

<style>
	button,
	progress {
		inline-size: 100%;
	}

	.export-panel__status {
		color: var(--fg-6);
		font-size: 0.875rem;
		margin: 0;
	}
</style>
