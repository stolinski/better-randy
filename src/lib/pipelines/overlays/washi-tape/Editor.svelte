<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { WashiTapeContent } from './index';
	import { WASHI_TAPE_DEFAULTS } from './washi-tape-defaults';
	import Field from '$lib/platform/Field.svelte';
	import { packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolvePackRoleColor } from '$lib/platform/packs/resolve';

	let { overlay = $bindable() }: OverlayEditorProps<WashiTapeContent> = $props();

	// The tint the tape actually renders when unauthored: the Pack's
	// `washi-tape.color` Role → core accent — what the swatch shows. Editing
	// materializes an authored override; × restores the pack chain (the same
	// ownership model as pack chrome / the background fill).
	const packTapeHex = $derived(
		resolvePackRoleColor(getPack(packState.slug), 'washi-tape.color', 'accent-treatment')
	);

	function setAuthoredColor(event: Event): void {
		overlay.content.color = (event.currentTarget as HTMLInputElement).value;
	}

	function restorePackColor(): void {
		overlay.content.color = undefined;
	}
</script>

<Field label="Color">
	<input type="color" value={overlay.content.color ?? packTapeHex} oninput={setAuthoredColor} />
	{#if overlay.content.color === undefined}
		<span
			class="tape-pack-tag"
			title={`The ${getPack(packState.slug).label} pack's tape tint — editing becomes a composition override`}
			>pack</span
		>
	{:else}
		<button
			type="button"
			class="tape-reset-btn"
			aria-label="Restore the pack tape tint"
			title="× restores the pack's tape tint"
			onclick={restorePackColor}>×</button
		>
	{/if}
</Field>

<!-- The aesthetic's 5–25° is a magnitude — tape lies on either diagonal, so
     the schema bound (and this input) is ±rotationMax, not rotationMin+. -->
<Field label="Rotation°">
	<input
		bind:value={overlay.content.rotation}
		type="number"
		min={-WASHI_TAPE_DEFAULTS.rotationMax}
		max={WASHI_TAPE_DEFAULTS.rotationMax}
		step="any"
	/>
</Field>

<Field label="Length">
	<input bind:value={overlay.content.length} type="number" min="60" max="800" step="any" />
</Field>

<style>
	/* The same ownership chrome as pack-chrome rows (PackChromeRow): a PACK
	   tag while the Pack's tint drives the tape, × while overridden. */
	.tape-pack-tag {
		border: 1px solid var(--chrome-hairline);
		border-radius: 3px;
		color: var(--chrome-muted);
		flex: none;
		font-family: 'Paper Mono', monospace;
		font-size: 0.5rem;
		letter-spacing: 0.14em;
		padding: 1.5px 5px;
		text-transform: uppercase;
	}

	.tape-reset-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 0.875rem;
		line-height: 1;
		padding: 0;
	}

	.tape-reset-btn:hover {
		color: #f0453d;
	}
</style>
