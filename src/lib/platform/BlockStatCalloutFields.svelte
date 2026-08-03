<script lang="ts">
	import type { DiagramStatCallout } from './engine-schema';
	import Field from './Field.svelte';

	// The stat roll's content fields (ADR-0036 §7): the from/to numbers, their
	// format, the caption, and the roll's own timing window.
	interface Props {
		primitive: DiagramStatCallout;
	}

	let { primitive: el }: Props = $props();

	function fraction(value: string): number | null {
		const n = Number(value);
		return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
	}

	function setStatNumber(key: 'from' | 'to', value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		el[key] = n;
	}
</script>

<Field label="From">
	<input
		type="number"
		step="any"
		value={el.from}
		oninput={(e) => setStatNumber('from', (e.currentTarget as HTMLInputElement).value)}
	/>
</Field>
<Field label="To">
	<input
		type="number"
		step="any"
		value={el.to}
		oninput={(e) => setStatNumber('to', (e.currentTarget as HTMLInputElement).value)}
	/>
</Field>
<Field label="Format">
	<select
		value={el.format ?? 'integer'}
		onchange={(e) => {
			el.format = (e.currentTarget as HTMLSelectElement).value as typeof el.format;
		}}
	>
		<option value="integer">integer</option>
		<option value="currency">currency</option>
		<option value="percent">percent</option>
		<option value="timecode">timecode</option>
	</select>
</Field>
<Field label="Caption">
	<input
		type="text"
		value={el.label ?? ''}
		oninput={(e) => {
			const v = (e.currentTarget as HTMLInputElement).value;
			el.label = v.length > 0 ? v : undefined;
		}}
	/>
</Field>
<Field label="Roll start">
	<input
		type="number"
		min="0"
		max="1"
		step="any"
		value={el.rollStart ?? ''}
		placeholder="enter start"
		oninput={(e) => {
			const n = fraction((e.currentTarget as HTMLInputElement).value);
			if (n !== null) el.rollStart = n;
		}}
	/>
</Field>
<Field label="Roll window">
	<input
		type="number"
		min="0"
		max="1"
		step="any"
		value={el.rollWindow ?? ''}
		placeholder="0.5"
		oninput={(e) => {
			const n = fraction((e.currentTarget as HTMLInputElement).value);
			if (n !== null) el.rollWindow = n;
		}}
	/>
</Field>
