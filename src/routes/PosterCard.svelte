<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';

	import type { SurfaceType } from '$lib/platform/engine-schema';
	import { imageContentViewBoxInset } from '$lib/utils/image-alpha-bounds';
	import SurfaceIcon from './SurfaceIcon.svelte';

	// Content-crop per poster URL, cached module-wide so aspect flips and
	// re-renders never rescan the same image.
	const contentViewBoxCache = new SvelteMap<string, string | null>();

	interface Props {
		slug: string;
		// URL of this composition's own poster — a committed still for a library
		// Preset, the store's capture for a User composition — passed ONLY when
		// the server load knows it exists. Null means "no own poster": the card
		// starts on the surface default immediately instead of discovering
		// absence through a 404 (console noise).
		thumbSrc: string | null;
		name: string;
		type: SurfaceType;
		badge: string | null;
		/** Family / surface chip under the name (e.g. "Checklist", "Social beats"). */
		kindLabel: string;
		/** Composition run length; null while a user composition is still resolving. */
		durationSeconds: number | null;
		/** Deliverables reflow 16:9 ↔ 9:16 by doctrine — fixtures don't claim it. */
		reflow: boolean;
		/** Grid-wide preview aspect from the toolrow toggle. */
		aspect: 'wide' | 'tall';
	}

	let { slug, thumbSrc, name, type, badge, kindLabel, durationSeconds, reflow, aspect }: Props =
		$props();

	// Fallback chain: this composition's own poster → the committed
	// surface-type default → the surface glyph. The base level comes from
	// poster knowledge; onerror only downgrades on a genuinely missing file —
	// it is a backstop, not the discovery mechanism.
	let downgrade = $state<'surface' | 'failed' | null>(null);
	const level = $derived(downgrade ?? (thumbSrc !== null ? 'composition' : 'surface'));
	let ready = $state(false);
	let shouldLoad = $state(false);

	const loadVisiblePoster: Attachment<HTMLElement> = (element) => {
		if (typeof IntersectionObserver === 'undefined') {
			shouldLoad = true;
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			shouldLoad = true;
			observer.disconnect();
		});
		observer.observe(element);
		return () => observer.disconnect();
	};

	const src = $derived(
		level === 'surface'
			? `/surface-posters/${type}.webp`
			: level === 'composition' && thumbSrc !== null
				? thumbSrc
				: ''
	);

	// object-view-box crop zooming the poster to its alpha content (mock parity:
	// the composition reads LARGE in the thumb, not tiny in a 4K frame). Null =
	// full-frame poster, shown whole.
	let contentViewBox = $state<string | null>(null);

	function handleLoad(event: Event): void {
		ready = true;
		const image = event.currentTarget as HTMLImageElement;
		const source = image.currentSrc || image.src;
		const cached = contentViewBoxCache.get(source);
		if (cached !== undefined) {
			contentViewBox = cached;
			return;
		}

		// Alpha scanning is presentation refinement, not image readiness. Keep it
		// out of the load event so a burst of local poster decodes can paint first.
		const measureContentCrop = (): void => {
			if (!ready || (image.currentSrc || image.src) !== source) return;
			const inset = imageContentViewBoxInset(image);
			contentViewBoxCache.set(source, inset);
			contentViewBox = inset;
		};
		if ('requestIdleCallback' in window) {
			window.requestIdleCallback(measureContentCrop, { timeout: 1_000 });
		} else {
			globalThis.setTimeout(measureContentCrop, 0);
		}
	}

	function handleError(): void {
		ready = false;
		contentViewBox = null;
		downgrade = level === 'composition' ? 'surface' : 'failed';
	}
</script>

<a class="poster-card" href={resolve('/p/[slug]', { slug })}>
	<span class="poster-card__preview" class:is-tall={aspect === 'tall'} {@attach loadVisiblePoster}>
		{#if src && shouldLoad}
			<img
				class="poster-card__thumb"
				class:is-ready={ready}
				{src}
				alt=""
				decoding="async"
				style:object-view-box={contentViewBox}
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
			<span class="poster-card__kind">{kindLabel}</span>
			{#if badge}
				<span class="poster-card__badge">{badge}</span>
			{/if}
			{#if reflow}
				<span
					class="poster-card__reflow"
					title="Reflows 16:9 ↔ 9:16"
					aria-label="Reflows 16:9 and 9:16">▭▯</span
				>
			{/if}
			{#if durationSeconds !== null}
				<span class="poster-card__duration">{durationSeconds.toFixed(1)} s</span>
			{/if}
		</span>
	</span>
</a>

<style>
	/* Palette rides the page-level spec-ladder custom properties (DESIGN.md);
	   fallbacks keep the card correct if rendered outside .home. */
	.poster-card {
		background: var(--panel, #131315);
		font-size: 1rem;
		border-top: 1px solid var(--line, #26262a);
		border-radius: 7px;
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
		border-color: #aaa;
	}

	.poster-card:focus-visible {
		border-color: var(--selection, #ffd608);
		outline: 2px solid var(--selection, #ffd608);
		outline-offset: 3px;
	}

	/* Preview stage — edge-to-edge on the alpha checker, the same ground the
	   Workspace canvas uses: transparent compositions read as transparent, and a
	   poster shown whole (object-fit contain) letterboxes onto checker, never
	   onto dead black. */
	.poster-card__preview {
		aspect-ratio: 16 / 9;
		background: repeating-conic-gradient(#17171a 0% 25%, #101013 0% 50%) 0 0 / 18px 18px;
		overflow: hidden;
		position: relative;
		transition: aspect-ratio 160ms var(--ease-smooth, ease);
	}

	.poster-card__preview.is-tall {
		aspect-ratio: 9 / 16;
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

		.poster-card__preview {
			transition: none;
		}
	}

	.poster-card__body {
		align-content: start;
		border-block-start: 1px solid var(--line, #26262a);
		display: grid;
		gap: 0.32rem;
		min-inline-size: 0;
		padding: 0.6rem 0.7rem 0.65rem;
	}

	.poster-card__name {
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: var(--text, #e8e8ea);
		display: -webkit-box;
		font-family: Archivo, sans-serif;
		font-size: 0.78125rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1.28;
		overflow: hidden;
	}

	.poster-card__meta {
		align-items: center;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.42rem;
		min-inline-size: 0;
	}

	.poster-card__kind {
		border: 1px solid var(--line, #26262a);
		border-radius: 4px;
		color: var(--muted, #8a8a90);
		font-family: 'Paper Mono', monospace;
		font-size: 0.59375rem;
		font-weight: 400;
		letter-spacing: 0.06em;
		overflow: hidden;
		padding: 1px 6px;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.poster-card__badge {
		background: var(--ink, #0c0c0e);
		border: 1px solid var(--line, #26262a);
		border-radius: 4px;
		color: var(--text, #e8e8ea);
		flex-shrink: 0;
		font-family: 'Paper Mono', monospace;
		font-size: 0.59375rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		padding: 0.12em 0.5em;
		white-space: nowrap;
	}

	.poster-card__reflow {
		color: var(--muted, #8a8a90);
		flex-shrink: 0;
		font-family: 'Paper Mono', monospace;
		font-size: 0.59375rem;
		letter-spacing: 0.1em;
	}

	.poster-card__duration {
		color: var(--muted, #8a8a90);
		flex-shrink: 0;
		font-family: 'Paper Mono', monospace;
		font-size: 0.59375rem;
		font-variant-numeric: tabular-nums;
		font-weight: 400;
		margin-inline-start: auto;
		white-space: nowrap;
	}
</style>
