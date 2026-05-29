<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { VARIANTS } from './variants';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const variantId = $derived(engineState.surface.variant ?? 'single');
	const VariantComponent = $derived(VARIANTS[variantId]?.CanvasSource ?? VARIANTS.single.CanvasSource);
</script>

<VariantComponent bind:element />
