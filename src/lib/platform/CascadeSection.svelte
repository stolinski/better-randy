<script lang="ts">
	import { cascadeNodeKey } from './cascade-timing';
	import type { Cascade, CascadeAnchor } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	// Cascade weld editor (ADR-0035 §4): anchor picker (the same identities the
	// timeline rows use), start/end event edge, signed ms offset. A cycle
	// attempt surfaces the lint error inline and never applies — fail fast at
	// authoring time, exactly like the schema does at parse time.

	interface Props {
		/** This element's cascade node key, e.g. `overlay:main` / `mark:0`. */
		selfKey: string;
		getCascade: () => Cascade | undefined;
		setCascade: (next: Cascade | undefined) => void;
	}

	let { selfKey, getCascade, setCascade }: Props = $props();

	let cycleError = $state<string | null>(null);

	const cascade = $derived(getCascade());

	// Every anchorable element (excluding self) — the timeline-row identities.
	const anchorOptions = $derived.by(() => {
		const options: { key: string; label: string; anchor: CascadeAnchor }[] = [
			{ key: 'surface', label: 'Surface', anchor: 'surface' }
		];
		for (const overlay of engineState.overlays) {
			options.push({
				key: `overlay:${overlay.id}`,
				label: `${overlay.type} · ${overlay.id}`,
				anchor: { overlay: overlay.id }
			});
		}
		engineState.marks.timings.forEach((_, index) => {
			options.push({ key: `mark:${index}`, label: `Mark ${index + 1}`, anchor: { mark: index } });
		});
		for (const entry of engineState.textAnimations) {
			options.push({
				key: `textAnimation:${entry.id}`,
				label: `Text · ${entry.id}`,
				anchor: { textAnimation: entry.id }
			});
		}
		return options.filter((option) => option.key !== selfKey);
	});

	// Would welding self → anchorKey close a loop? Walk the existing anchor
	// chain from the candidate; out-degree is ≤ 1, so a plain walk suffices.
	function wouldCycle(anchorKey: string): boolean {
		// Transient lookup for one walk — plain object, not reactive state.
		const outgoing: Record<string, string> = {};
		for (const overlay of engineState.overlays) {
			const c = overlay.animation?.cascade;
			if (c) outgoing[`overlay:${overlay.id}`] = cascadeNodeKey(c.anchor);
		}
		engineState.marks.timings.forEach((timing, index) => {
			if (timing.cascade) outgoing[`mark:${index}`] = cascadeNodeKey(timing.cascade.anchor);
		});
		for (const entry of engineState.textAnimations) {
			if (entry.cascade)
				outgoing[`textAnimation:${entry.id}`] = cascadeNodeKey(entry.cascade.anchor);
		}
		let node: string | undefined = anchorKey;
		const seen: string[] = [];
		while (node) {
			if (node === selfKey) return true;
			if (seen.includes(node)) return false; // pre-existing loop elsewhere; not ours
			seen.push(node);
			node = outgoing[node];
		}
		return false;
	}

	function applyAnchor(key: string): void {
		const option = anchorOptions.find((o) => o.key === key);
		if (!option) return;
		if (wouldCycle(option.key)) {
			cycleError = `Cascade cycle: ${selfKey} → ${option.key} → … → ${selfKey}. Anchor chains must end at an element without a cascade.`;
			return;
		}
		cycleError = null;
		const current = getCascade();
		setCascade({
			anchor: option.anchor,
			event: current?.event ?? 'end',
			offsetMs: current?.offsetMs ?? 120
		});
	}

	function toggle(enabled: boolean): void {
		cycleError = null;
		if (!enabled) {
			setCascade(undefined);
			return;
		}
		const first = anchorOptions.find((option) => !wouldCycle(option.key));
		if (first) {
			setCascade({ anchor: first.anchor, event: 'end', offsetMs: 120 });
		}
	}
</script>

<InspectorSection label="Cascade">
	{#snippet action()}
		<input
			type="checkbox"
			checked={cascade !== undefined}
			onchange={(e) => toggle((e.currentTarget as HTMLInputElement).checked)}
		/>
	{/snippet}
	{#if cascade}
		<Field label="Anchor">
			<select
				value={cascadeNodeKey(cascade.anchor)}
				onchange={(e) => applyAnchor((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each anchorOptions as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
		</Field>
		<Field label="Event">
			<select
				value={cascade.event}
				onchange={(e) => {
					cascade.event = (e.currentTarget as HTMLSelectElement).value as Cascade['event'];
				}}
			>
				<option value="start">start</option>
				<option value="end">end</option>
			</select>
		</Field>
		<Field label="Offset ms">
			<input
				type="number"
				step="10"
				value={cascade.offsetMs}
				oninput={(e) => {
					const n = Number((e.currentTarget as HTMLInputElement).value);
					if (Number.isFinite(n)) cascade.offsetMs = n;
				}}
			/>
		</Field>
	{/if}
	{#if cycleError}
		<p class="cascade-error">{cycleError}</p>
	{/if}
</InspectorSection>

<style>
	.cascade-error {
		color: #e6322a;
		font-size: 0.72rem;
		line-height: 1.4;
		margin: 0;
	}
</style>
