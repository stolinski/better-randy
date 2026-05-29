<script lang="ts">
	import type { InstanceStackContent } from './index';
	import { VARIANTS } from './variants';

	interface Props {
		content: InstanceStackContent;
	}

	let { content }: Props = $props();

	const variantId = $derived(content.variant ?? 'vertical-stack');
	const VariantComponent = $derived(VARIANTS[variantId].CanvasSource);
</script>

<VariantComponent {content} />
