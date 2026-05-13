<script lang="ts">
	import type { ExportFormat } from '$lib/platform/engine-schema';
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
	const progressPercent = $derived(Math.round(progress * 100));

	async function handleExport(): Promise<void> {
		await onexport?.();
	}
</script>

<ControlGroup title="Export">
	<div class="export-panel__grid">
		<label class="export-panel__field">
			<span>Frame</span>
			<select bind:value={orientation}>
				<option value="horizontal">Horizontal 4K</option>
				<option value="vertical">Vertical 4K</option>
			</select>
		</label>

		<label class="export-panel__field">
			<span>Format</span>
			<select bind:value={format}>
				<option value="webm">WebM VP9</option>
				<option value="prores">MOV ProRes</option>
			</select>
		</label>

		<label class="export-panel__field">
			<span>Duration (s)</span>
			<input bind:value={durationSeconds} min="1" max="60" step="0.5" type="number" />
		</label>

		<label class="export-panel__field">
			<span>FPS</span>
			<input bind:value={fps} min="12" max="60" step="1" type="number" />
		</label>
	</div>

	{#if onexport}
		<button disabled={isExporting} onclick={handleExport} type="button">
			{isExporting ? `Exporting ${progressPercent}%` : exportLabel}
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
	.export-panel__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--vs-s);
	}

	.export-panel__field {
		display: grid;
		gap: var(--vs-xs);
		min-inline-size: 0;
	}

	.export-panel__field > span {
		color: var(--fg-6);
		font-size: 0.75rem;
	}

	.export-panel__field > :is(input, select) {
		inline-size: 100%;
		margin: 0;
		min-inline-size: 0;
	}

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
