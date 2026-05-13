<script lang="ts">
	import {
		QUOTE_FOCUS_FONT_FAMILIES,
		getQuoteFocusSegments,
		quoteFocusState
	} from './quote-focus-state.svelte';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable(null) }: Props = $props();

	const fontFamily = $derived(QUOTE_FOCUS_FONT_FAMILIES[quoteFocusState.fontFamily]);
	const segments = $derived(getQuoteFocusSegments(quoteFocusState.body, quoteFocusState.quote));
	const showMetadata = $derived(
		quoteFocusState.showSourceMetadata &&
			(quoteFocusState.author.trim().length > 0 ||
				quoteFocusState.source.trim().length > 0 ||
				quoteFocusState.dateLabel.trim().length > 0)
	);
</script>

<article
	bind:this={element}
	class="quote-focus-source"
	style:background-color={quoteFocusState.paperColor}
	style:color={quoteFocusState.inkColor}
	style:font-family={fontFamily.stack}
>
	<section class="quote-focus-source__body">
		<p>
			{#if segments.matched}
				{segments.beforeQuote}<span data-quote-target>{segments.quote}</span>{segments.afterQuote}
			{:else}
				{quoteFocusState.body}
			{/if}
		</p>
	</section>

	{#if showMetadata}
		<footer class="quote-focus-source__attribution">
			{#if quoteFocusState.author}
				<span class="quote-focus-source__author">{quoteFocusState.author}</span>
			{/if}
			{#if quoteFocusState.source}
				<cite>{quoteFocusState.source}</cite>
			{/if}
			{#if quoteFocusState.dateLabel}
				<span class="quote-focus-source__date">{quoteFocusState.dateLabel}</span>
			{/if}
		</footer>
	{/if}
</article>

<style>
	.quote-focus-source {
		box-sizing: border-box;
		display: grid;
		gap: 2.4rem;
		grid-template-rows: minmax(0, 1fr) auto;
		block-size: 1358px;
		inline-size: 960px;
		padding: 5rem 4.5rem;
		overflow: hidden;
		transform-origin: top left;
	}

	.quote-focus-source__body p {
		font-size: 1.85rem;
		line-height: 1.5;
		margin: 0;
	}

	.quote-focus-source__body span[data-quote-target] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	.quote-focus-source__attribution {
		border-block-start: 2px solid currentColor;
		display: flex;
		flex-wrap: wrap;
		font-family: ui-monospace, monospace;
		font-size: 0.95rem;
		gap: 1.2rem;
		padding-block-start: 1.2rem;
		text-transform: uppercase;
	}

	.quote-focus-source__attribution cite {
		font-style: normal;
	}
</style>
