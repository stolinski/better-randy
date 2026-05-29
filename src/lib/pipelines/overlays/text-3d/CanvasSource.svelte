<script lang="ts">
	import type { Text3dContent } from './index';
	import { VARIANTS } from './variants';

	interface Props {
		content: Text3dContent;
	}

	let { content }: Props = $props();

	const variantId = $derived(content.variant ?? 'cylinder-axis-y');
	const VariantComponent = $derived(VARIANTS[variantId].CanvasSource);
</script>

<VariantComponent {content} />
