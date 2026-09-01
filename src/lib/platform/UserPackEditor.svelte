<script lang="ts">
	import { packState } from './engine-state.svelte';
	import type { LightDirection } from './packs/resolve';
	import {
		armUserPackDelete,
		deleteBoundUserPack,
		disarmUserPackDelete,
		editBoundUserPack,
		editableUserPackManifest,
		userPackAuthoring
	} from './user-pack-authoring.svelte';
	import Field from './Field.svelte';
	import UserPackFontRow from './UserPackFontRow.svelte';
	import { getRgbColorChannels } from '$lib/utils/color';

	// The bound User Pack, role by role (ADR-0055). Every control writes through
	// `editBoundUserPack`, which previews the draft on the render and autosaves
	// it through the store's validated save; a refused save names its issues
	// here against the role that caused them. Roles without a control below
	// round-trip untouched.
	const manifest = $derived(editableUserPackManifest(packState.slug));

	const COLOR_CORES = [
		['fill-treatment', 'Fill'],
		['ink-treatment', 'Ink'],
		['accent-treatment', 'Accent'],
		['field-treatment', 'Field']
	] as const;
	const EDGE_MODES = ['clean', 'soft', 'irregular', 'torn', 'none'] as const;
	const LIGHT_DIRECTIONS: readonly LightDirection[] = [
		'upper-left',
		'upper-right',
		'top',
		'left',
		'right'
	];

	function roleValue(role: string): unknown {
		const entry = manifest?.roles[role];
		return entry?.kind === 'style' ? entry.value : undefined;
	}

	// <input type="color"> only accepts #rrggbb — expand shorthand hexes.
	function swatchHex(value: unknown, fallback = '#000000'): string {
		if (typeof value !== 'string') return fallback;
		try {
			const { red, green, blue } = getRgbColorChannels(value);
			return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
		} catch {
			return fallback;
		}
	}

	function setStyleRole(role: string, value: unknown): void {
		editBoundUserPack((draft) => {
			draft.roles[role] = { kind: 'style', value };
		});
	}

	function removeRole(role: string): void {
		editBoundUserPack((draft) => {
			delete draft.roles[role];
		});
	}

	function inputValue(event: Event): string {
		return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	}

	// ---- edge: bare keyword or { mode, … }; only the mode is edited, the rest round-trips ----
	const edgeMode = $derived.by(() => {
		const value = roleValue('edge-treatment');
		if (typeof value === 'string') return value;
		return typeof value === 'object' && value !== null && 'mode' in value
			? String(value.mode)
			: 'none';
	});

	function setEdgeMode(event: Event): void {
		const mode = inputValue(event);
		const value = roleValue('edge-treatment');
		setStyleRole(
			'edge-treatment',
			typeof value === 'object' && value !== null ? { ...value, mode } : mode
		);
	}

	// ---- depth: 'none' | hard-offset rig | glow rig ----
	type DepthKind = 'none' | 'offset' | 'glow';
	const depth = $derived.by(() => {
		const value = roleValue('depth-treatment');
		if (typeof value === 'object' && value !== null) {
			const rig = value as {
				glow?: { radius?: number; color?: string; intensity?: number };
				hardOffset?: { dx?: number; dy?: number; blur?: number; color?: string };
				offset?: { dx?: number; dy?: number; blur?: number; color?: string };
			};
			if (rig.glow) {
				return {
					kind: 'glow' as const,
					radius: rig.glow.radius ?? 24,
					color: rig.glow.color ?? 'fg',
					intensity: rig.glow.intensity ?? 0.85
				};
			}
			const offset = rig.hardOffset ?? rig.offset;
			if (offset) {
				return {
					kind: 'offset' as const,
					dx: offset.dx ?? 0,
					dy: offset.dy ?? 0,
					blur: offset.blur ?? 0,
					color: offset.color ?? 'fg'
				};
			}
		}
		return { kind: 'none' as const };
	});

	function setDepthKind(event: Event): void {
		const kind = inputValue(event) as DepthKind;
		if (kind === 'none') setStyleRole('depth-treatment', 'none');
		else if (kind === 'glow')
			setStyleRole('depth-treatment', { glow: { radius: 24, intensity: 0.85 } });
		else setStyleRole('depth-treatment', { hardOffset: { dx: 6, dy: 6, blur: 0 } });
	}

	function setOffsetField(field: 'dx' | 'dy' | 'blur', event: Event): void {
		if (depth.kind !== 'offset') return;
		const { kind, ...offset } = depth;
		void kind;
		const next = { ...offset, [field]: Number(inputValue(event)) };
		setStyleRole('depth-treatment', { hardOffset: next });
	}

	function setOffsetColor(event: Event): void {
		if (depth.kind !== 'offset') return;
		const { kind, ...offset } = depth;
		void kind;
		setStyleRole('depth-treatment', { hardOffset: { ...offset, color: inputValue(event) } });
	}

	function setGlowField(field: 'radius' | 'intensity', event: Event): void {
		if (depth.kind !== 'glow') return;
		const { kind, ...glow } = depth;
		void kind;
		setStyleRole('depth-treatment', { glow: { ...glow, [field]: Number(inputValue(event)) } });
	}

	// ---- light: 'none' | { direction, intensity } ----
	const light = $derived.by(() => {
		const value = roleValue('light-treatment');
		if (typeof value === 'object' && value !== null && 'direction' in value) {
			const shaped = value as { direction: string; intensity?: number };
			return { direction: shaped.direction, intensity: shaped.intensity ?? 0.45 };
		}
		return null;
	});

	function setLightDirection(event: Event): void {
		const direction = inputValue(event);
		if (direction === 'none') setStyleRole('light-treatment', 'none');
		else setStyleRole('light-treatment', { direction, intensity: light?.intensity ?? 0.45 });
	}

	function setLightIntensity(event: Event): void {
		if (!light) return;
		setStyleRole('light-treatment', {
			direction: light.direction,
			intensity: Number(inputValue(event))
		});
	}

	// ---- issues, per role path ----
	const issueLines = $derived(
		userPackAuthoring.issues.map((issue) => ({
			key: issue.path.join('.') || '<root>',
			message: issue.message
		}))
	);

	let deleteError = $state<string | null>(null);

	async function handleDelete(): Promise<void> {
		if (!userPackAuthoring.deleteArmed) {
			armUserPackDelete();
			return;
		}
		try {
			await deleteBoundUserPack();
			deleteError = null;
		} catch (cause) {
			console.error('Failed to delete the User Pack.', cause);
			deleteError = cause instanceof Error ? cause.message : 'Failed to delete the User Pack.';
		}
	}
</script>

{#if manifest}
	<Field label="Label">
		<input
			type="text"
			aria-label="Label"
			value={manifest.label}
			oninput={(event) => {
				const label = inputValue(event);
				editBoundUserPack((draft) => {
					draft.label = label;
				});
			}}
		/>
	</Field>
	<Field label="Description">
		<input
			type="text"
			aria-label="Description"
			value={manifest.description}
			oninput={(event) => {
				const description = inputValue(event);
				editBoundUserPack((draft) => {
					draft.description = description;
				});
			}}
		/>
	</Field>

	{#each COLOR_CORES as [role, label] (role)}
		<Field {label}>
			<input
				type="color"
				aria-label={`${label} colour`}
				value={swatchHex(roleValue(role))}
				oninput={(event) => setStyleRole(role, inputValue(event))}
			/>
		</Field>
	{/each}

	<Field label="Field ink">
		{#if roleValue('field-ink-treatment') !== undefined}
			<input
				type="color"
				aria-label="Field ink colour"
				value={swatchHex(roleValue('field-ink-treatment'))}
				oninput={(event) => setStyleRole('field-ink-treatment', inputValue(event))}
			/>
			<button
				type="button"
				class="pack-ghost"
				aria-label="Remove the field ink claim"
				title="× falls back to the ink colour"
				onclick={() => removeRole('field-ink-treatment')}>×</button
			>
		{:else}
			<button
				type="button"
				class="pack-ghost"
				onclick={() => setStyleRole('field-ink-treatment', swatchHex(roleValue('ink-treatment')))}
				>Claim</button
			>
		{/if}
	</Field>

	<Field label="Edge">
		<select value={edgeMode} onchange={setEdgeMode} aria-label="Edge treatment">
			{#each EDGE_MODES as mode (mode)}
				<option value={mode}>{mode}</option>
			{/each}
		</select>
	</Field>

	<Field label="Depth">
		<select value={depth.kind} onchange={setDepthKind} aria-label="Depth treatment">
			<option value="none">none</option>
			<option value="offset">hard offset</option>
			<option value="glow">glow</option>
		</select>
	</Field>
	{#if depth.kind === 'offset'}
		<Field label="Offset">
			<input
				type="number"
				aria-label="Offset dx"
				value={depth.dx}
				onchange={(event) => setOffsetField('dx', event)}
			/>
			<input
				type="number"
				aria-label="Offset dy"
				value={depth.dy}
				onchange={(event) => setOffsetField('dy', event)}
			/>
		</Field>
		<Field label="Shadow">
			<input
				type="number"
				aria-label="Offset blur"
				min="0"
				value={depth.blur}
				onchange={(event) => setOffsetField('blur', event)}
			/>
			<input
				type="color"
				aria-label="Offset colour"
				value={swatchHex(depth.color, swatchHex(roleValue('ink-treatment')))}
				oninput={setOffsetColor}
			/>
		</Field>
	{:else if depth.kind === 'glow'}
		<Field label="Glow">
			<input
				type="number"
				aria-label="Glow radius"
				min="0"
				value={depth.radius}
				onchange={(event) => setGlowField('radius', event)}
			/>
			<input
				type="range"
				aria-label="Glow intensity"
				min="0"
				max="1"
				step="0.05"
				value={depth.intensity}
				oninput={(event) => setGlowField('intensity', event)}
			/>
		</Field>
	{/if}

	<Field label="Light">
		<select
			value={light?.direction ?? 'none'}
			onchange={setLightDirection}
			aria-label="Light direction"
		>
			<option value="none">none</option>
			{#each LIGHT_DIRECTIONS as direction (direction)}
				<option value={direction}>{direction}</option>
			{/each}
		</select>
		{#if light}
			<input
				type="range"
				aria-label="Light intensity"
				min="0"
				max="1"
				step="0.05"
				value={light.intensity}
				oninput={setLightIntensity}
			/>
		{/if}
	</Field>

	<UserPackFontRow role="font-treatment" label="Type" />
	<UserPackFontRow role="font-label-treatment" label="Labels" />

	{#if issueLines.length > 0}
		<ul class="pack-issues" role="alert">
			{#each issueLines as issue (issue.key + issue.message)}
				<li><span>{issue.key}</span>{issue.message}</li>
			{/each}
		</ul>
	{/if}
	{#if userPackAuthoring.saveError || deleteError}
		<p class="pack-issues" role="alert">{userPackAuthoring.saveError ?? deleteError}</p>
	{/if}

	<div class="pack-delete">
		<button
			type="button"
			class="pack-ghost"
			class:armed={userPackAuthoring.deleteArmed}
			onclick={handleDelete}
			>{userPackAuthoring.deleteArmed ? 'Delete pack?' : 'Delete pack'}</button
		>
		{#if userPackAuthoring.deleteArmed}
			<button type="button" class="pack-ghost" onclick={disarmUserPackDelete}>Keep</button>
		{/if}
	</div>
{/if}

<style>
	/* Quiet ghost controls at the row's control scale, like the typography reset. */
	.pack-ghost {
		background: none;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-family: 'Paper Mono', monospace;
		font-size: 0.66rem;
		padding: 0;
	}

	.pack-ghost:hover,
	.pack-ghost:focus-visible {
		color: var(--chrome-text);
		outline: none;
	}

	.pack-ghost.armed {
		color: #f0453d;
	}

	.pack-delete {
		display: flex;
		gap: var(--vs-s);
		justify-content: flex-end;
	}

	.pack-issues {
		color: #f0453d;
		font-size: 0.7rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.pack-issues li {
		display: grid;
		gap: 2px;
	}

	.pack-issues span {
		color: var(--chrome-muted);
		font-family: 'Paper Mono', monospace;
		font-size: 0.6rem;
	}
</style>
