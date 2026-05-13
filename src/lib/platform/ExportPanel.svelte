<script lang="ts">
	import type { ExportFormat } from '$lib/platform/tool';
	import type { VideoOrientation } from '$lib/utils/video-frame';

	import ControlGroup from './ControlGroup.svelte';

	interface Props {
		orientation?: VideoOrientation;
		durationSeconds?: number;
		fps?: number;
		format?: ExportFormat;
		isExporting?: boolean;
		progress?: number;
		status?: string;
		onexport?: () => void | Promise<void>;
	}

	let {
		orientation = $bindable('horizontal'),
		durationSeconds = $bindable(6),
		fps = $bindable(30),
		format = $bindable('webm'),
		isExporting = false,
		progress = 0,
		status = '',
		onexport
	}: Props = $props();

	const exportLabel = $derived(format === 'prores' ? 'Export MOV' : 'Export WebM');

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

	<label class="row">
		<span>Format</span>
		<select bind:value={format}>
			<option value="webm">WebM (VP9, alpha)</option>
			<option value="prores">MOV ProRes 4444 (alpha)</option>
		</select>
	</label>

	{#if onexport}
		<button disabled={isExporting} onclick={handleExport} type="button">
			{isExporting ? 'Exporting' : exportLabel}
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
