<script lang="ts">
	import { resolve } from '$app/paths';

	import type { SurfaceType } from '$lib/platform/engine-schema';
	import { posterUrl } from '$lib/platform/posters';
	import { SURFACE_LABELS } from './surface-labels';
	import SurfaceIcon from './SurfaceIcon.svelte';

	interface Props {
		slug: string;
		// Content key of this composition's own poster — passed ONLY when the
		// route's server load says the poster exists in the store. Null means
		// "no own poster": the card starts on the surface default immediately
		// instead of discovering absence through a 404 (console noise).
		thumbKey: string | null;
		name: string;
		type: SurfaceType;
		badge: string | null;
	}

	let { slug, thumbKey, name, type, badge }: Props = $props();

	// Fallback chain: this composition's own poster (capture-on-view) → the
	// committed surface-type default → the surface glyph. The base level comes
	// from poster knowledge; onerror only downgrades on a genuinely missing
	// file — it is a backstop, not the discovery mechanism.
	let downgrade = $state<'surface' | 'failed' | null>(null);
	const level = $derived(downgrade ?? (thumbKey !== null ? 'composition' : 'surface'));
	let ready = $state(false);

	const src = $derived(
		level === 'surface'
			? `/surface-posters/${type}.webp`
			: level === 'composition' && thumbKey !== null
				? posterUrl(thumbKey)
				: ''
	);

	function handleLoad(): void {
		ready = true;
	}

	function handleError(): void {
		ready = false;
		downgrade = level === 'composition' ? 'surface' : 'failed';
	}
</script>

<a class="poster-card" href={resolve('/p/[slug]', { slug })}>
	<span class="poster-card__preview">
		{#if src}
			<span
				class="poster-card__backdrop"
				class:is-ready={ready}
				style="background-image: url('{src}')"
				aria-hidden="true"
			></span>
			<img
				class="poster-card__thumb"
				class:is-ready={ready}
				{src}
				alt=""
				loading="lazy"
				onload={handleLoad}
				onerror={handleError}
			/>
		{/if}
		{#if !ready}
			{#if level === 'failed'}
				<span class="poster-card__glyph"><SurfaceIcon {type} /></span>
			{:else}
				<span class="poster-card__skeleton" aria-hidden="true"></span>
			{/if}
		{/if}
	</span>
	<span class="poster-card__body">
		<span class="poster-card__name">{name}</span>
		<span class="poster-card__meta">
			<span class="poster-card__surface">{SURFACE_LABELS[type]}</span>
			{#if badge}
				<span class="poster-card__badge">{badge}</span>
			{/if}
		</span>
	</span>
</a>

<style>
	/* Palette rides the page-level spec-ladder custom properties (DESIGN.md);
	   fallbacks keep the card correct if rendered outside .home. */
	.poster-card {
		background: var(--panel, #131315);
		border: 1px solid var(--line, #26262a);
		border-radius: 4px;
		color: var(--text, #e8e8ea);
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		text-decoration: none;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.poster-card:hover {
		background: var(--raised, #1a1a1d);
		border-color: #3a3a3e;
	}

	.poster-card:focus-visible {
		border-color: var(--selection, #ffd608);
		outline: 2px solid var(--selection, #ffd608);
		outline-offset: 3px;
	}

	/* Preview stage — 16:9, edge-to-edge. The poster is shown whole (object-fit
	   contain) over a blurred, cover-scaled copy of itself, so a portrait fills
	   the frame with its own soft colour instead of dead bars, and a full-frame
	   piece just covers it. */
	.poster-card__preview {
		aspect-ratio: 16 / 9;
		background: var(--ink, #0c0c0e);
		overflow: hidden;
		position: relative;
	}

	.poster-card__backdrop {
		background-position: center;
		background-size: cover;
		filter: blur(28px) brightness(0.5) saturate(1.2);
		inset: 0;
		opacity: 0;
		position: absolute;
		transform: scale(1.25);
		transition: opacity 320ms var(--ease-smooth, ease);
	}

	.poster-card__backdrop.is-ready {
		opacity: 1;
	}

	.poster-card__thumb {
		block-size: 100%;
		inline-size: 100%;
		inset: 0;
		object-fit: contain;
		opacity: 0;
		position: absolute;
		transition: opacity 300ms var(--ease-smooth, ease);
	}

	.poster-card__thumb.is-ready {
		opacity: 1;
	}

	.poster-card__glyph {
		block-size: 34%;
		color: var(--muted, #8a8a90);
		inset-block-start: 50%;
		inset-inline-start: 50%;
		position: absolute;
		translate: -50% -50%;
	}

	.poster-card__skeleton {
		background: linear-gradient(
			100deg,
			transparent 30%,
			color-mix(in oklab, var(--line, #26262a) 70%, transparent) 50%,
			transparent 70%
		);
		background-size: 220% 100%;
		inset: 0;
		position: absolute;
		animation: poster-shimmer 1.4s ease-in-out infinite;
	}

	@keyframes poster-shimmer {
		from {
			background-position: 220% 0;
		}
		to {
			background-position: -120% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.poster-card__skeleton {
			animation: none;
		}
	}

	.poster-card__body {
		align-content: start;
		border-block-start: 1px solid var(--line, #26262a);
		display: grid;
		gap: 0.35rem;
		min-inline-size: 0;
		padding: 0.75rem;
	}

	.poster-card__name {
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: var(--text, #e8e8ea);
		display: -webkit-box;
		font-family: Archivo, sans-serif;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: -0.006em;
		line-height: 1.28;
		/* Reserve two lines so every card body is the same height. */
		min-block-size: 2lh;
		overflow: hidden;
	}

	/* Single-column grids have no cross-card rows to equalize, so the reserved
	   second line would just read as a hole. The grid is an inline-size
	   container; below two 13rem tracks + gap it is single column. */
	@container (width < 26.9rem) {
		.poster-card__name {
			min-block-size: auto;
		}
	}

	.poster-card__meta {
		align-items: center;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.4rem;
		min-inline-size: 0;
	}

	.poster-card__surface {
		color: var(--muted, #8a8a90);
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.poster-card__badge {
		background: var(--ink, #0c0c0e);
		border: 1px solid var(--line, #26262a);
		border-radius: 2px;
		color: var(--text, #e8e8ea);
		flex-shrink: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding-block: 0.1em;
		padding-inline: 0.45em;
		white-space: nowrap;
	}
</style>
