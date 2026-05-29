<script lang="ts">
	import type { CounterContent } from './index';
	import { VARIANTS } from './variants';

	interface Props {
		content: CounterContent;
	}

	let { content }: Props = $props();

	const variantId = $derived(content.variant ?? 'slot-machine-roll');
	const VariantComponent = $derived(VARIANTS[variantId].CanvasSource);
</script>

<VariantComponent {content} />
