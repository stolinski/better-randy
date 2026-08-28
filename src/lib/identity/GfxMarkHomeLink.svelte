<script lang="ts">
	import { resolve } from '$app/paths';

	import gfxMark from '$lib/assets/identity/gfx-mark.svg';
	import { GFX_PRODUCT_NAME } from './gfx-brand';
</script>

<!-- The mark is the identity's only appearance inside the editor chrome, and it
     is the way back to the library (docs/identity/README.md). The 28px slot
     centres the 22px artwork 3px in, so a chrome bar padded 12px stands the mark
     15px from the viewport edge — the point the listing masthead holds it at.
     Every chrome bar that carries the mark renders this element, so opening a
     composition cannot shift it. -->
<a class="gfx-mark-home-link" href={resolve('/')} aria-label="{GFX_PRODUCT_NAME} — all compositions">
	<img src={gfxMark} alt="" width="22" height="22" />
</a>

<style>
	.gfx-mark-home-link {
		align-items: center;
		block-size: 28px;
		border-radius: 6px;
		display: inline-flex;
		flex-shrink: 0;
		inline-size: 28px;
		justify-content: center;
		text-decoration: none;
		transition: background 100ms ease;
	}

	.gfx-mark-home-link:hover {
		background: var(--chrome-raised, #1a1a1d);
	}
</style>
