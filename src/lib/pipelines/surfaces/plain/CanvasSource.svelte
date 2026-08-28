<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { ENGINE_FONT_FAMILIES } from '$lib/platform/engine-schema';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveFieldInkColor, resolveTypographyColors } from '$lib/platform/packs/resolve';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import { getLayoutSafeArea } from '$lib/utils/safe-area';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	function captureElement(node: HTMLElement): () => void {
		element = node;
		return () => {
			if (element === node) element = null;
		};
	}

	const fontFamily = $derived(ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]);
	// Authored ink remains the explicit override. A declared full-frame field
	// uses the Pack's paired field ink; transparent-over-footage compositions
	// retain the ordinary typography ink chain.
	const inkColor = $derived.by(() => {
		const pack = getPack(packState.slug);
		return engineState.backgroundFill !== undefined
			? resolveFieldInkColor(pack, engineState.typography.inkColor)
			: resolveTypographyColors(pack, engineState.typography).inkColor;
	});
	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const safeArea = $derived(getLayoutSafeArea(engineState.transport.orientation));
	// Body font-size meets the per-orientation surface-body cap-height floor:
	//   horizontal (3840w): 0.014 × 3840 = 53.8px → cap ≈ 37.6px ≥ 32px ✓
	//   vertical (2160w):   0.030 × 2160 = 64.8px → cap ≈ 45.4px ≥ 44px ✓
	const bodyFontSize = $derived(
		frame.width * (engineState.transport.orientation === 'vertical' ? 0.03 : 0.014)
	);
	const hasBody = $derived(
		engineState.surface.content.body.some(
			(block) => block.type === 'paragraph' && block.segments.some((s) => s.text.length > 0)
		)
	);
</script>

<article
	{@attach captureElement}
	class="plain-source surface"
	style:block-size={`${frame.height}px`}
	style:color={inkColor}
	style:font-family={`var(--font, ${fontFamily.stack})`}
	style:inline-size={`${frame.width}px`}
	style:padding={`${frame.height * safeArea.top}px ${frame.width * safeArea.right}px ${frame.height * safeArea.bottom}px ${frame.width * safeArea.left}px`}
>
	{#if hasBody}
		{#key annotationBodyPlainText(engineState.surface.content.body)}
			<section data-text-anim-slot="body" style:font-size={`${bodyFontSize}px`}>
				{#each engineState.surface.content.body as block, blockIndex (blockIndex)}
					{#if block.type === 'paragraph'}
						<p
							data-gfx-readable-id={`surface:plain:body:${blockIndex}`}
							data-gfx-text-role="surface-body"
						>
							{#each block.segments as segment, segmentIndex (`${blockIndex}:${segmentIndex}:${segment.text}`)}
								{#if segment.markStyles.length > 0}
									{@const innerText = segment.text}
									{@const styles = segment.markStyles}
									{#snippet renderSegment(index: number)}
										{#if index < styles.length}
											<span data-annotation-mark={styles[index]}>
												{@render renderSegment(index + 1)}
											</span>
										{:else}
											{innerText}
										{/if}
									{/snippet}
									{@render renderSegment(0)}
								{:else}
									{segment.text}
								{/if}
							{/each}
						</p>
					{/if}
				{/each}
			</section>
		{/key}
	{/if}
</article>

<style>
	.plain-source {
		background-color: transparent;
		box-sizing: border-box;
		display: grid;
		grid-template-rows: 1fr;
		inset-block-start: 0;
		inset-inline-start: 0;
		overflow: hidden;
		transform-origin: top left;
	}

	/* See paper CanvasSource for the rationale. */
	.plain-source :is(p, span) {
		font-size: inherit;
		line-height: inherit;
	}

	section {
		display: grid;
		gap: 1.6em;
		align-content: start;
		line-height: 1.45;
	}

	section p {
		margin: 0;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
</style>
