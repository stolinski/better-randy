<script lang="ts">
	import CascadeSection from './CascadeSection.svelte';
	import {
		ENGINE_EASES,
		type Cascade,
		type DiagramEdgeArrow,
		type DiagramElement,
		type DiagramEndpoint,
		type Ease,
		type Transition
	} from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import KeyframesSection from './KeyframesSection.svelte';
	import SoundSection from './SoundSection.svelte';

	// Per-type inspector for diagram Block elements (ADR-0036 §7). Explicit
	// placement is the authoring model, so every positional number is a
	// first-class field; route/control/direction are the edge's content; stroke
	// appearance never appears here (it is the Pack's, not the composition's).

	interface Props {
		blockId: string;
	}

	let { blockId }: Props = $props();

	const element = $derived(
		(engineState.surface.diagram ?? []).find((entry) => entry.id === blockId) ?? null
	);

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	// Stroke elements expose opacity only (their reveal is the draw-on); DOM
	// elements take the full ADR-0035 channel set.
	const channelNames = $derived(
		element && (element.type === 'edge-arrow' || element.type === 'timeline-segment')
			? (['opacity'] as const)
			: (['opacity', 'x', 'y', 'scale', 'rotation'] as const)
	);

	const nodeOptions = $derived(
		(engineState.surface.diagram ?? []).filter((entry) => entry.type === 'node')
	);

	function fraction(value: string): number | null {
		const n = Number(value);
		return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
	}

	function setPoint(point: { x: number; y: number }, axis: 'x' | 'y', value: string): void {
		const n = fraction(value);
		if (n !== null) point[axis] = n;
	}

	function setScale(el: DiagramElement & { scale?: number }, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		el.scale = Math.max(0.25, Math.min(4, n));
	}

	// Endpoint editing: a node ref or an explicit point. Switching to `point`
	// materialises the endpoint's current node centre-ish default; switching to
	// `node` takes the first node.
	function endpointMode(endpoint: DiagramEndpoint): 'node' | 'point' {
		return 'node' in endpoint ? 'node' : 'point';
	}

	function setEndpointMode(edge: DiagramEdgeArrow, end: 'from' | 'to', mode: string): void {
		const current = edge[end];
		if (mode === 'node') {
			const first = nodeOptions[0];
			if (!first) return;
			edge[end] = { node: 'node' in current ? current.node : first.id };
		} else {
			edge[end] = 'node' in current ? { x: 0.5, y: 0.5 } : current;
		}
	}

	function setEndpointNode(edge: DiagramEdgeArrow, end: 'from' | 'to', id: string): void {
		edge[end] = { node: id };
	}

	function toggleControl(edge: DiagramEdgeArrow, enabled: boolean): void {
		edge.control = enabled ? { x: 0.5, y: 0.4 } : undefined;
	}

	function setCascade(el: DiagramElement, next: Cascade | undefined): void {
		if (next === undefined) {
			if (!el.animation) return;
			el.animation.cascade = undefined;
			if (!el.animation.channels || Object.keys(el.animation.channels).length === 0) {
				el.animation = undefined;
			}
			return;
		}
		if (!el.animation) el.animation = {};
		el.animation.cascade = next;
	}

	function ensureTransition(el: DiagramElement, field: 'enter' | 'exit'): Transition {
		const existing = el[field];
		if (existing) return existing;
		const next: Transition =
			field === 'enter'
				? { start: 0.08, duration: 0.05, ease: 'settled' }
				: { start: 0.86, duration: 0.04, ease: 'smooth' };
		el[field] = next;
		return next;
	}

	function transitionInput(
		el: DiagramElement,
		field: 'enter' | 'exit',
		key: 'start' | 'duration',
		value: string
	): void {
		const n = fraction(value);
		if (n === null) return;
		ensureTransition(el, field)[key] = n;
	}

	function setStatNumber(
		el: DiagramElement & { from?: unknown },
		key: 'from' | 'to',
		value: string
	): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		(el as { [K in 'from' | 'to']?: number })[key] = n;
	}
</script>

{#if element}
	{@const el = element}

	<InspectorSection label={el.type}>
		{#if el.type === 'node'}
			<Field label="Form">
				<select
					value={el.form}
					onchange={(e) => {
						el.form = (e.currentTarget as HTMLSelectElement).value as typeof el.form;
					}}
				>
					<option value="box">box</option>
					<option value="pin">pin</option>
					<option value="dot">dot</option>
				</select>
			</Field>
			<Field label="Text">
				<input
					type="text"
					value={el.text ?? ''}
					oninput={(e) => {
						const v = (e.currentTarget as HTMLInputElement).value;
						el.text = v.length > 0 ? v : undefined;
					}}
				/>
			</Field>
		{:else if el.type === 'label'}
			<Field label="Text">
				<input
					type="text"
					value={el.text}
					oninput={(e) => {
						el.text = (e.currentTarget as HTMLInputElement).value;
					}}
				/>
			</Field>
		{:else if el.type === 'stat-callout'}
			<Field label="From">
				<input
					type="number"
					value={el.from}
					oninput={(e) => setStatNumber(el, 'from', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="To">
				<input
					type="number"
					value={el.to}
					oninput={(e) => setStatNumber(el, 'to', (e.currentTarget as HTMLInputElement).value)}
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
					step="0.01"
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
					step="0.01"
					value={el.rollWindow ?? ''}
					placeholder="0.5"
					oninput={(e) => {
						const n = fraction((e.currentTarget as HTMLInputElement).value);
						if (n !== null) el.rollWindow = n;
					}}
				/>
			</Field>
		{:else if el.type === 'edge-arrow'}
			{#each ['from', 'to'] as const as end (end)}
				{@const endpoint = el[end]}
				<Field label={end === 'from' ? 'From' : 'To'}>
					<select
						value={endpointMode(endpoint)}
						onchange={(e) => setEndpointMode(el, end, (e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="node" disabled={nodeOptions.length === 0}>node</option>
						<option value="point">point</option>
					</select>
					{#if 'node' in endpoint}
						<select
							value={endpoint.node}
							onchange={(e) =>
								setEndpointNode(el, end, (e.currentTarget as HTMLSelectElement).value)}
						>
							{#each nodeOptions as candidate (candidate.id)}
								<option value={candidate.id}>{candidate.id}</option>
							{/each}
						</select>
					{:else}
						<input
							type="number"
							min="0"
							max="1"
							step="0.005"
							value={endpoint.x}
							aria-label="{end} x"
							oninput={(e) => setPoint(endpoint, 'x', (e.currentTarget as HTMLInputElement).value)}
						/>
						<input
							type="number"
							min="0"
							max="1"
							step="0.005"
							value={endpoint.y}
							aria-label="{end} y"
							oninput={(e) => setPoint(endpoint, 'y', (e.currentTarget as HTMLInputElement).value)}
						/>
					{/if}
				</Field>
			{/each}
			<Field label="Route">
				<select
					value={el.route}
					onchange={(e) => {
						el.route = (e.currentTarget as HTMLSelectElement).value as typeof el.route;
					}}
				>
					<option value="straight">straight</option>
					<option value="elbow">elbow</option>
					<option value="arc">arc</option>
				</select>
			</Field>
			<Field label="Control">
				<input
					type="checkbox"
					checked={el.control !== undefined}
					onchange={(e) => toggleControl(el, (e.currentTarget as HTMLInputElement).checked)}
				/>
				{#if el.control}
					{@const control = el.control}
					<input
						type="number"
						min="0"
						max="1"
						step="0.005"
						value={control.x}
						aria-label="control x"
						oninput={(e) => setPoint(control, 'x', (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.005"
						value={control.y}
						aria-label="control y"
						oninput={(e) => setPoint(control, 'y', (e.currentTarget as HTMLInputElement).value)}
					/>
				{/if}
			</Field>
			<Field label="Direction">
				<select
					value={el.direction ?? 'forward'}
					onchange={(e) => {
						el.direction = (e.currentTarget as HTMLSelectElement).value as typeof el.direction;
					}}
				>
					<option value="forward">forward</option>
					<option value="both">both</option>
					<option value="none">none</option>
				</select>
			</Field>
		{:else}
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
		{/if}
		<!-- Ink is a Role SELECTION (which pen), not appearance (what the pen looks
		     like — still the Pack's): 'accent' routes the element to the Pack's
		     core accent-treatment for emphasis hierarchy. -->
		<Field label="Ink">
			<select
				value={el.ink ?? 'ink'}
				onchange={(e) => {
					const v = (e.currentTarget as HTMLSelectElement).value;
					el.ink = v === 'accent' ? 'accent' : undefined;
				}}
			>
				<option value="ink">ink</option>
				<option value="accent">accent</option>
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection label="Position">
		{#if el.type === 'edge-arrow'}
			<p class="position-note">Endpoints above — an edge lives between its ends.</p>
		{:else if el.type === 'timeline-segment'}
			{#each ['from', 'to'] as const as end (end)}
				{@const point = el[end]}
				<Field label={end === 'from' ? 'From' : 'To'}>
					<input
						type="number"
						min="0"
						max="1"
						step="0.005"
						value={point.x}
						aria-label="{end} x"
						oninput={(e) => setPoint(point, 'x', (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.005"
						value={point.y}
						aria-label="{end} y"
						oninput={(e) => setPoint(point, 'y', (e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
			{/each}
		{:else}
			<Field label="X">
				<input
					type="number"
					min="0"
					max="1"
					step="0.005"
					value={el.position.x}
					oninput={(e) => setPoint(el.position, 'x', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Y">
				<input
					type="number"
					min="0"
					max="1"
					step="0.005"
					value={el.position.y}
					oninput={(e) => setPoint(el.position, 'y', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Scale">
				<input
					type="number"
					min="0.25"
					max="4"
					step="0.05"
					value={el.scale ?? 1}
					oninput={(e) => setScale(el, (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Enter">
		{#snippet action()}
			<input
				type="checkbox"
				checked={el.enter !== undefined}
				onchange={(e) => {
					if ((e.currentTarget as HTMLInputElement).checked) {
						ensureTransition(el, 'enter');
					} else {
						el.enter = undefined;
					}
				}}
			/>
		{/snippet}
		{#if el.enter}
			<Field label="Start">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={el.enter.start}
					oninput={(e) =>
						transitionInput(el, 'enter', 'start', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={el.enter.duration}
					oninput={(e) =>
						transitionInput(el, 'enter', 'duration', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Ease">
				<select
					value={el.enter.ease}
					onchange={(e) => {
						ensureTransition(el, 'enter').ease = (e.currentTarget as HTMLSelectElement)
							.value as Ease;
					}}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Exit">
		{#snippet action()}
			<input
				type="checkbox"
				checked={el.exit !== undefined}
				onchange={(e) => {
					if ((e.currentTarget as HTMLInputElement).checked) {
						ensureTransition(el, 'exit');
					} else {
						el.exit = undefined;
					}
				}}
			/>
		{/snippet}
		{#if el.exit}
			<Field label="Start">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={el.exit.start}
					oninput={(e) =>
						transitionInput(el, 'exit', 'start', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={el.exit.duration}
					oninput={(e) =>
						transitionInput(el, 'exit', 'duration', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Ease">
				<select
					value={el.exit.ease}
					onchange={(e) => {
						ensureTransition(el, 'exit').ease = (e.currentTarget as HTMLSelectElement)
							.value as Ease;
					}}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
	</InspectorSection>

	<KeyframesSection selfKey={`block:${el.id}`} {channelNames} />

	<CascadeSection
		selfKey={`block:${el.id}`}
		getCascade={() => el.animation?.cascade}
		setCascade={(next) => setCascade(el, next)}
	/>

	<SoundSection
		motions={[
			...(el.enter ? [{ label: 'Enter', cueId: `block:${el.id}:enter`, window: el.enter }] : [])
		]}
	/>
{/if}

<style>
	.position-note {
		color: var(--fg-4);
		font-size: 0.72rem;
		line-height: 1.4;
		margin: 0;
	}
</style>
