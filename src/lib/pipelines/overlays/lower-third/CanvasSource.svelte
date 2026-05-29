<script lang="ts">
	import type { LowerThirdContent } from './index';
	import { VARIANTS } from './variants';

	interface Props {
		content: LowerThirdContent;
	}

	let { content }: Props = $props();

	const variantId = $derived(content.variant ?? 'standard');
	const VariantComponent = $derived(VARIANTS[variantId].CanvasSource);
</script>

<VariantComponent {content} />
