<script lang="ts">
	import type { ShaderFillContent } from './index';

	interface Props {
		content: ShaderFillContent;
	}

	// Content is consumed by the shaderPass via packUniforms; the DOM is a
	// transparent placeholder whose only job is to occupy the rect so
	// measureOverlayBoundsPx() can read it. Reference the prop so type-narrowing
	// holds and Svelte doesn't strip the import on dead-code elimination.
	let { content }: Props = $props();
</script>

<div class="shader-fill" data-overlay="shader-fill" data-opacity={content.opacity}></div>

<style>
	.shader-fill {
		block-size: 100%;
		inline-size: 100%;
	}
</style>
