<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { ENGINE_FONT_FAMILIES } from '$lib/platform/engine-schema';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveTypographyColors } from '$lib/platform/packs/resolve';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import { getLayoutSafeArea } from '$lib/utils/safe-area';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const fontFamily = $derived(ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]);
	// Ink resolves override → Pack core ink-treatment (ADR-0038); the fill
	// stays intrinsically transparent per the output contract.
	const typographyColors = $derived(
		resolveTypographyColors(getPack(packState.slug), engineState.typography)
	);
	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const safeArea = $derived(getLayoutSafeArea(engineState.transport.orientation));
	// Body font-size meets the per-orientation surface-body cap-height floor:
	//   horizontal (3840w): 0.014 × 3840 = 53.8px → cap ≈ 37.6px ≥ 32px ✓
	//   vertical (2160w):   0.030 × 2160 = 64.8px → cap ≈ 45.4px ≥ 44px ✓
	const bodyFontSize = $derived(
		frame.width * (engineState.transport.orientation === 'vertical' ? 0.030 : 0.014)
	);
	const hasBody = $derived(
		engineState.surface.content.body.some(
			(block) => block.type === 'paragraph' && block.segments.some((s) => s.text.length > 0)
		)
	);
</script>

<article
	bind:this={element}
	class="plain-source surface"
	style:block-size={`${frame.height}px`}
	style:color={typographyColors.inkColor}
	style:font-family={`var(--font, ${fontFamily.stack})`}
	style:inline-size={`${frame.width}px`}
	style:padding={`${frame.height * safeArea.top}px ${frame.width * safeArea.right}px ${frame.height * safeArea.bottom}px ${frame.width * safeArea.left}px`}
>
	{#if hasBody}
		{#key annotationBodyPlainText(engineState.surface.content.body)}
			<section data-text-anim-slot="body" style:font-size={`${bodyFontSize}px`}>
				{#each engineState.surface.content.body as block, blockIndex (blockIndex)}
					{#if block.type === 'paragraph'}
						<p>
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

	/* See paper CanvasSource for the rationale. Headings keep their own
	 * line-height; only body elements inherit both. */
	.plain-source :is(h1, h2, h3, h4, h5, h6) {
		font-size: inherit;
	}
	.plain-source :is(p, li, span, cite, time) {
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
