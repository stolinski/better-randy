<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<main class="home stack">
	<h1>Hiviz</h1>
	<a href={resolve('/tools/research-paper')}>Research Paper</a>
</main>

<style>
	.home {
		padding: var(--pad-l);
	}

	h1 {
		margin: 0;
	}
</style>
