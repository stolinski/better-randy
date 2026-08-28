<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import type { AnnotationBody } from '$lib/annotations/annotation-marks';

	interface Props {
		/** Parsed post body — carries the hero `[highlight]` span(s). */
		body: AnnotationBody;
		/** Canvas-pixel font size for the body text; mark spans inherit it. */
		fontSize: number;
		/** Stable owner prefix for one readable identity per rendered paragraph. */
		readablePrefix: string;
	}

	let { body, fontSize, readablePrefix }: Props = $props();

	const hasBody = $derived(
		Array.isArray(body) &&
			body.some((paragraph) =>
				paragraph.segments?.some((segment) => (segment.text ?? '').trim().length > 0)
			)
	);
</script>

<!--
	Shared body renderer for every web-document site mock (twitter / reddit /
	wikipedia). Emits the one contract the highlight + text-anim system reads:
	a `[data-text-anim-slot="body"]` section containing `[data-annotation-mark]`
	spans, captured into the surface texture via HTML-in-Canvas. Nesting it inside
	a site mock is safe — the slot lookup is `root.querySelector` from the
	CanvasSource root and Svelte adds no DOM boundary (see text-animations/manager).
-->
{#if hasBody}
	{#key annotationBodyPlainText(body)}
		<section class="document-body" data-text-anim-slot="body" style:font-size={`${fontSize}px`}>
			{#each body as block, blockIndex (blockIndex)}
				{#if block.type === 'paragraph'}
					<p
						data-gfx-readable-id={`${readablePrefix}:${blockIndex}`}
						data-gfx-readable-text={block.segments.map((segment) => segment.text).join('')}
						data-gfx-text-role="found-document-body"
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

<style>
	/*
	 * The body sizes from the inline JS-driven font-size on the <section>, so its
	 * <p> and mark spans must inherit it — opting out of Graffiti's @layer base
	 * fluid typography (same pattern as the paper / newspaper Surfaces).
	 */
	.document-body {
		line-height: 1.4;
		margin: 0;
	}
	.document-body p,
	.document-body [data-annotation-mark] {
		font-size: inherit;
		line-height: inherit;
	}
	.document-body p {
		margin: 0;
	}
	.document-body p + p {
		margin-block-start: 0.7em;
	}
	.document-body [data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
</style>
