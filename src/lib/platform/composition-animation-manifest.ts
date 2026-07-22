import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

import type { RenderAnimState } from './anim-state.svelte.ts';
import type { AnimationManifest, AnimationTweenSpec } from './animation-manager.ts';
import {
	DEFAULT_BLOCK_ENTER,
	DEFAULT_OVERLAY_ENTER,
	resolveCascadeTimings
} from './cascade-timing.ts';
import {
	getEaseGsap,
	listMarkInstances,
	resolveMarkForIndex,
	SUGAR_OPACITY_EXIT_EASES,
	type EngineState,
	type Keyframe,
	type TextAnimation,
	type Transport
} from './engine-schema.ts';
import { clampNumber } from '$lib/utils/math';

const COMPOSITION_CHANNEL_KEYS = ['opacity', 'x', 'y', 'scale', 'rotation'] as const;

export interface CompositionTextAnimationCompiler {
	rebuild(
		root: HTMLElement | null,
		entries: readonly TextAnimation[],
		transport: Transport
	): AnimationTweenSpec[];
}

export interface CompositionAnimationManifestInput {
	state: EngineState;
	runtime: RenderAnimState;
	textAnimationRoot: HTMLElement | null;
	textAnimationCompiler: CompositionTextAnimationCompiler;
	resolveMarkColor: (style: AnnotationMarkStyle) => string;
}

function clampCompositionTweenStart(start: number, duration: number): number {
	return clampNumber(start, 0, Math.max(0, 1 - duration));
}

function appendChannelKeyframeTweens(options: {
	tweens: AnimationTweenSpec[];
	keyPrefix: string;
	frames: readonly Keyframe[];
	clipStartFraction: number;
	durationMs: number;
	write: (value: number) => void;
}): void {
	const { tweens, keyPrefix, frames, clipStartFraction, durationMs, write } = options;
	const toFraction = (milliseconds: number): number => milliseconds / durationMs;

	if (frames.length === 1) {
		const only = frames[0];
		tweens.push({
			key: `${keyPrefix}-0`,
			start: clampCompositionTweenStart(clipStartFraction + toFraction(only.atMs), 0),
			duration: 0,
			ease: 'none',
			from: only.value,
			to: only.value,
			onUpdate: write
		});
		return;
	}

	for (let index = 1; index < frames.length; index += 1) {
		const previous = frames[index - 1];
		const next = frames[index];
		const duration = Math.min(toFraction(next.atMs - previous.atMs), 1);
		tweens.push({
			key: `${keyPrefix}-${index}`,
			start: clampCompositionTweenStart(
				clipStartFraction + toFraction(previous.atMs),
				duration
			),
			duration,
			ease: getEaseGsap(next.ease ?? 'smooth'),
			from: previous.value,
			to: next.value,
			onUpdate: write
		});
	}
}

function resizeCompositionProgress(values: number[], length: number): void {
	while (values.length < length) values.push(0);
	while (values.length > length) values.pop();
}

function synchronizeBlockAnimationRecords(runtime: RenderAnimState, ids: readonly string[]): void {
	for (const record of [runtime.blockProgresses, runtime.blockAlphas, runtime.blockChannels]) {
		for (const key of Object.keys(record)) {
			if (!ids.includes(key)) delete record[key];
		}
	}
	for (const id of ids) {
		runtime.blockProgresses[id] ??= 0;
		runtime.blockAlphas[id] ??= 1;
		runtime.blockChannels[id] ??= null;
	}
}

/**
 * Build the frame-deterministic tween manifest for one composition. The input
 * owns both authored state and live animation values; this module only derives
 * tween ordering, resolved starts, and corrective writers.
 */
export function buildCompositionAnimationManifest(
	input: CompositionAnimationManifestInput
): AnimationManifest {
	const { state, runtime, textAnimationRoot, textAnimationCompiler, resolveMarkColor } = input;
	const surface = state.surface;
	const marks = listMarkInstances(surface.content);
	const durationMs = state.transport.durationSeconds * 1000;

	resizeCompositionProgress(runtime.markProgresses, marks.length);
	resizeCompositionProgress(runtime.overlayProgresses, state.overlays.length);

	// Cascade welds resolve before every tween and before sound derivation.
	const cascadeWindows = resolveCascadeTimings(state);
	const tweens: AnimationTweenSpec[] = [];

	const surfaceOpacity = surface.animation?.channels?.opacity;
	if (surfaceOpacity && surfaceOpacity.length > 0) {
		appendChannelKeyframeTweens({
			tweens,
			keyPrefix: 'paper-opacity',
			frames: surfaceOpacity,
			clipStartFraction: surface.enter?.start ?? 0,
			durationMs,
			write: (value) => {
				runtime.paperVisibility = value;
			}
		});
	} else {
		if (surface.enter) {
			tweens.push({
				key: 'paper-enter',
				start: surface.enter.start,
				duration: surface.enter.duration,
				ease: getEaseGsap(surface.enter.ease),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					runtime.paperVisibility = value;
				}
			});
		}
		if (surface.exit) {
			tweens.push({
				key: 'paper-exit',
				start: surface.exit.start,
				duration: surface.exit.duration,
				ease: SUGAR_OPACITY_EXIT_EASES[surface.exit.ease],
				from: 1,
				to: 0,
				onUpdate: (value) => {
					runtime.paperVisibility = value;
				}
			});
		}
		if (!surface.enter && !surface.exit) runtime.paperVisibility = 1;
	}

	marks.forEach((mark, index) => {
		if (mark.window === 'static') {
			runtime.markProgresses[index] = 1;
			return;
		}
		if (mark.window !== undefined) {
			tweens.push({
				key: `mark-${index}`,
				start: mark.window.start,
				duration: mark.window.duration,
				ease: 'power1.inOut',
				onUpdate: (value) => {
					runtime.markProgresses[index] = value;
				}
			});
			return;
		}

		const resolved = resolveMarkForIndex(
			mark.style,
			index,
			state.marks,
			resolveMarkColor(mark.style)
		);
		tweens.push({
			key: `mark-${index}`,
			start: cascadeWindows.get(`mark:${index}`)?.startFraction ?? resolved.start,
			duration: resolved.duration,
			ease: 'power1.inOut',
			onUpdate: (value) => {
				runtime.markProgresses[index] = value;
			}
		});
	});

	const resolvedTextAnimations = state.textAnimations.map((entry) => {
		const resolvedStart = cascadeWindows.get(`textAnimation:${entry.id}`)?.startFraction;
		if (resolvedStart === undefined || resolvedStart === entry.enter.start) return entry;
		return { ...entry, enter: { ...entry.enter, start: resolvedStart } };
	});
	tweens.push(
		...textAnimationCompiler.rebuild(
			textAnimationRoot,
			resolvedTextAnimations,
			state.transport
		)
	);

	runtime.overlayChannels = state.overlays.map((overlay) => {
		const channels = overlay.animation?.channels;
		if (!channels || !COMPOSITION_CHANNEL_KEYS.some((key) => (channels[key]?.length ?? 0) > 0)) {
			return null;
		}
		return {
			opacity: channels.opacity?.[0]?.value ?? 1,
			x: channels.x?.[0]?.value ?? 0,
			y: channels.y?.[0]?.value ?? 0,
			scale: channels.scale?.[0]?.value ?? overlay.position.scale ?? 1,
			rotation: channels.rotation?.[0]?.value ?? overlay.position.rotation ?? 0
		};
	});

	state.overlays.forEach((overlay, index) => {
		const channelValues = runtime.overlayChannels[index];
		const window = cascadeWindows.get(`overlay:${overlay.id}`);
		if (channelValues) {
			const channels = overlay.animation?.channels;
			const clipStart = window?.startFraction ?? overlay.enter?.start ?? 0;
			for (const channel of COMPOSITION_CHANNEL_KEYS) {
				const frames = channels?.[channel];
				if (!frames || frames.length === 0) continue;
				appendChannelKeyframeTweens({
					tweens,
					keyPrefix: `overlay-${overlay.id}-${channel}`,
					frames,
					clipStartFraction: clipStart,
					durationMs,
					write: (value) => {
						const slot = runtime.overlayChannels[index];
						if (slot) slot[channel] = value;
					}
				});
			}
			runtime.overlayProgresses[index] = 1;
			return;
		}

		const enter = overlay.enter ?? DEFAULT_OVERLAY_ENTER;
		tweens.push({
			key: `overlay-${overlay.id}-enter`,
			start: window?.startFraction ?? enter.start,
			duration: enter.duration,
			ease: getEaseGsap(enter.ease),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				runtime.overlayProgresses[index] = value;
			}
		});
		if (overlay.exit) {
			tweens.push({
				key: `overlay-${overlay.id}-exit`,
				start: overlay.exit.start,
				duration: overlay.exit.duration,
				ease: getEaseGsap(overlay.exit.ease),
				from: 1,
				to: 0,
				onUpdate: (value) => {
					runtime.overlayProgresses[index] = value;
				}
			});
		}
	});

	const diagramPrimitives = surface.diagram ?? [];
	synchronizeBlockAnimationRecords(
		runtime,
		diagramPrimitives.map((primitive) => primitive.id)
	);
	for (const primitive of diagramPrimitives) {
		const channels = primitive.animation?.channels as
			| Partial<Record<(typeof COMPOSITION_CHANNEL_KEYS)[number], Keyframe[]>>
			| undefined;
		const window = cascadeWindows.get(`block:${primitive.id}`);
		const hasChannels =
			channels !== undefined &&
			COMPOSITION_CHANNEL_KEYS.some((key) => (channels[key]?.length ?? 0) > 0);

		if (hasChannels && channels) {
			const staticScale = 'scale' in primitive ? (primitive.scale ?? 1) : 1;
			runtime.blockChannels[primitive.id] = {
				opacity: channels.opacity?.[0]?.value ?? 1,
				x: channels.x?.[0]?.value ?? 0,
				y: channels.y?.[0]?.value ?? 0,
				scale: channels.scale?.[0]?.value ?? staticScale,
				rotation: channels.rotation?.[0]?.value ?? 0
			};
			const clipStart = window?.startFraction ?? primitive.enter?.start ?? 0;
			for (const channel of COMPOSITION_CHANNEL_KEYS) {
				const frames = channels[channel];
				if (!frames || frames.length === 0) continue;
				appendChannelKeyframeTweens({
					tweens,
					keyPrefix: `block-${primitive.id}-${channel}`,
					frames,
					clipStartFraction: clipStart,
					durationMs,
					write: (value) => {
						const slot = runtime.blockChannels[primitive.id];
						if (slot) slot[channel] = value;
					}
				});
			}
			runtime.blockProgresses[primitive.id] = 1;
			runtime.blockAlphas[primitive.id] = 1;
			continue;
		}

		runtime.blockChannels[primitive.id] = null;
		runtime.blockAlphas[primitive.id] = 1;
		const enter = primitive.enter ?? DEFAULT_BLOCK_ENTER;
		const isStroke = primitive.type === 'edge-arrow' || primitive.type === 'timeline-segment';
		tweens.push({
			key: `block-${primitive.id}-enter`,
			start: window?.startFraction ?? enter.start,
			duration: enter.duration,
			ease: isStroke ? 'power1.inOut' : getEaseGsap(enter.ease),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				runtime.blockProgresses[primitive.id] = value;
			}
		});
		if (primitive.exit) {
			tweens.push({
				key: `block-${primitive.id}-exit`,
				start: primitive.exit.start,
				duration: primitive.exit.duration,
				ease: SUGAR_OPACITY_EXIT_EASES[primitive.exit.ease],
				from: 1,
				to: 0,
				onUpdate: (value) => {
					runtime.blockAlphas[primitive.id] = value;
				}
			});
		}
	}

	return { tweens };
}
