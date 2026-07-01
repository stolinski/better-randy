<script lang="ts">
	import type { SurfaceType } from '$lib/platform/engine-schema';
	import { posterUrl } from '$lib/platform/posters';
	import SurfaceIcon from './SurfaceIcon.svelte';

	interface Props {
		slug: string;
		// Content key of this composition's own poster. Null while a user comp's
		// key resolves. When its poster exists (from capture-on-view) it overrides
		// the surface default; otherwise the card rides the surface poster.
		thumbKey: string | null;
		name: string;
		type: SurfaceType;
		orientation: 'horizontal' | 'vertical';
		badge: string | null;
	}

	let { slug, thumbKey, name, type, orientation, badge }: Props = $props();

	const SURFACE_LABELS: Record<SurfaceType, string> = {
		paper: 'Paper',
		plain: 'Plain',
		newspaper: 'Newspaper',
		'pullquote-on-photo': 'Pullquote on photo',
		'chapter-card': 'Chapter card',
		'title-sequence': 'Title sequence',
		'type-hero': 'Type hero',
		'web-document': 'Web document',
		imessage: 'iMessage'
	};

	// Fallback chain: this composition's own poster (capture-on-view) → the
	// committed surface-type default → the surface glyph.
	let level = $state<'composition' | 'surface' | 'failed'>('composition');
	let ready = $state(false);

	const src = $derived(
		level === 'surface'
			? `/surface-posters/${type}.webp`
			: level === 'composition' && thumbKey
				? posterUrl(thumbKey)
				: ''
	);

	function handleLoad(): void {
		ready = true;
	}

	function handleError(): void {
		ready = false;
		if (level === 'composition') level = 'surface';
		else if (level === 'surface') level = 'failed';
	}
</script>

<a class="poster-card" href="/p/{slug}">
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
	.poster-card {
		background: var(--fg-05);
		border: var(--border-1);
		border-radius: var(--br-m);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.22);
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		text-decoration: none;
		transition:
			border-color 160ms ease,
			box-shadow 220ms var(--ease-smooth, ease),
			transform 220ms var(--ease-smooth, ease);
	}

	.poster-card:hover {
		border-color: var(--fg-3);
		box-shadow: 0 16px 34px -12px rgb(0 0 0 / 0.6);
		transform: translateY(-4px);
	}

	@media (prefers-reduced-motion: reduce) {
		.poster-card {
			transition-property: border-color, box-shadow;
		}
		.poster-card:hover {
			transform: none;
		}
	}

	/* Preview stage — 16:9, edge-to-edge. The poster is shown whole (object-fit
	   contain) over a blurred, cover-scaled copy of itself, so a portrait fills
	   the frame with its own soft colour instead of dead bars, and a full-frame
	   piece just covers it. */
	.poster-card__preview {
		aspect-ratio: 16 / 9;
		background: var(--bg);
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
		color: var(--fg-4);
		inset-block-start: 50%;
		inset-inline-start: 50%;
		position: absolute;
		translate: -50% -50%;
	}

	.poster-card__skeleton {
		background: linear-gradient(
			100deg,
			transparent 30%,
			color-mix(in oklab, var(--fg-2) 70%, transparent) 50%,
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
		display: grid;
		gap: 0.35rem;
		min-inline-size: 0;
		padding: 0.75rem 0.85rem 0.85rem;
	}

	.poster-card__name {
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: var(--fg);
		display: -webkit-box;
		font-size: 0.9rem;
		font-weight: var(--fw-semibold);
		letter-spacing: -0.006em;
		line-height: 1.28;
		/* Reserve two lines so every card body is the same height. */
		min-block-size: 2lh;
		overflow: hidden;
	}

	.poster-card__meta {
		align-items: center;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.4rem;
		min-inline-size: 0;
	}

	.poster-card__surface {
		color: var(--fg-5);
		font-size: 0.72rem;
		letter-spacing: 0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.poster-card__badge {
		background: var(--fg-1);
		border-radius: 999px;
		color: var(--fg-6);
		flex-shrink: 0;
		font-size: 0.63rem;
		font-weight: var(--fw-medium);
		letter-spacing: 0.02em;
		padding-block: 0.2em;
		padding-inline: 0.55em;
		white-space: nowrap;
	}
</style>
