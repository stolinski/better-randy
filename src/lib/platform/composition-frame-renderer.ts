import { crtScanlinePass } from '$lib/pipelines/shader-passes/crt-scanline';
import {
	edgeTreatmentPass,
	type EdgeTreatmentTarget
} from '$lib/pipelines/shader-passes/edge-treatment';
import { hexToRgbaFloat } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';
import { measureOverlayBoundsPx } from '$lib/utils/overlay-bounds';
import type { Effect, EngineState } from './engine-schema';
import type { GpuHost } from './gpu-host';
import type { PackManifest } from './packs/types';
import {
	resolveAppearanceVars,
	resolveDepthTreatment,
	resolveEdgeTreatment,
	resolveLightTreatment,
	resolveMaterialTreatment,
	type LightTreatment,
	type ResolvedMaterialTreatment
} from './packs/resolve';
import { getSurfaceRenderer, PIPELINE_REGISTRY } from './pipelines';
import { CompositionPlanes, type CompositeBackdrop } from './pipelines/composition-planes';
import { DepthStage } from './pipelines/depth-stage';
import { STAGE_CAM_Z, stageCameraPose } from './pipelines/depth-stage-camera';
import { EffectChain } from './pipelines/effect-chain';
import { ShaderPassDispatcher, type ShaderPassDispatchList } from './pipelines/shader-pass-runner';
import type { CompiledTransitionWipe } from './pipelines/transition-pass';
import type { TransitionSnapshotFrameTextures } from './pipelines/transition-snapshots';
import type {
	OverlayRenderer,
	ShaderPass,
	SurfaceRenderInputs,
	SurfaceRenderInstance
} from './pipelines/types';

const SELF_FADING_SURFACE_TYPES = new Set(['chapter-card', 'title-sequence', 'pullquote-on-photo']);

const NO_BACKDROP: CompositeBackdrop = {
	strength: 0,
	edgeBlur: 0,
	vignette: 0,
	speckle: 0,
	color: [0, 0, 0],
	grain: 0
};

interface CompositionFrameTimebase {
	progress: number;
	timestamp: number;
}

interface ResolvedDofFrame {
	focusZ: number;
	aperture: number;
	surfaceZ: number;
	overlayZ: number;
	backdrop: CompositeBackdrop;
	otherEffects: readonly Effect[];
}

interface ResolvedStageFrame {
	focusZ: number;
	aperture: number;
	focusBand: number;
	backdropColor: [number, number, number];
	backdropAsset: string | null;
	backdropContrast: number;
	cameraMove: 'static' | 'push' | 'drift';
	cameraAmount: number;
	hasOverlayPlane: boolean;
	overlayZ: number;
	light: LightTreatment | null;
	effects: readonly Effect[];
}

interface PreparedFramePackTreatments {
	edgeTarget: EdgeTreatmentTarget | null;
	material: ResolvedMaterialTreatment | null;
	light: LightTreatment | null;
	chromeEffects: readonly Effect[];
}

export interface CompositionFrameRenderResources {
	host: GpuHost | null;
	pipeline: SurfaceRenderInstance | null;
	effectChain: EffectChain | null;
	shaderPassDispatcher: ShaderPassDispatcher | null;
	compositionPlanes: CompositionPlanes | null;
	depthStage: DepthStage | null;
}

export interface CachedTransitionFrame {
	snapshots: TransitionSnapshotFrameTextures;
	wipe: CompiledTransitionWipe;
}

export interface CompositionFrameRenderRequest {
	outputView: GPUTextureView;
	timestamp: number;
	state: EngineState;
	pack: PackManifest;
	paperVisibility: number;
	compositionElement: HTMLElement | null;
	overlayRootElement: HTMLElement | null;
	substrateTexture: GPUTexture | null;
	resources: CompositionFrameRenderResources;
	cachedTransition: CachedTransitionFrame | null;
	buildSurfaceInputs(timestamp: number): SurfaceRenderInputs;
}

export type CompositionFrameRenderBranch = 'transition' | 'stage' | 'dof' | 'flat';
export type CompositionFrameRenderResult = CompositionFrameRenderBranch | 'unavailable';

/** A non-self-fading surface with an authored opacity channel needs a separate
 * Surface plane so its alpha can be multiplied on the GPU. */
export function hasCompositionOwnedSurfaceOpacity(state: EngineState): boolean {
	return (
		Boolean(state.surface.animation?.channels?.opacity?.length) &&
		!SELF_FADING_SURFACE_TYPES.has(state.surface.type)
	);
}

/** Whether Composition must hoist the Overlay layer into a separately-capturable
 * direct child for DOF, GPU surface opacity, or overlay-at-depth. */
export function shouldSplitCompositionPlanes(state: EngineState): boolean {
	const hasDof = state.effects.some((effect) => effect.type === 'depth-of-field');
	const hasStageOverlay = state.stage?.type === 'depth' && state.overlays.length > 0;
	return hasDof || hasCompositionOwnedSurfaceOpacity(state) || hasStageOverlay;
}

/** Ordered branch policy for one frame. Stage has first live precedence, then
 * multiplane DOF, then flat. A prepared transition excludes every live branch. */
export function resolveCompositionFrameBranchOrder(
	state: EngineState,
	hasCachedTransition: boolean
): readonly CompositionFrameRenderBranch[] {
	if (hasCachedTransition) {
		return ['transition'];
	}
	const branches: CompositionFrameRenderBranch[] = [];
	if (state.stage?.type === 'depth') {
		branches.push('stage');
	}
	if (
		state.effects.some((effect) => effect.type === 'depth-of-field') ||
		hasCompositionOwnedSurfaceOpacity(state)
	) {
		branches.push('dof');
	}
	branches.push('flat');
	return branches;
}

function frameTimebase(state: EngineState, timestamp: number): CompositionFrameTimebase {
	const duration = state.transport.durationSeconds;
	return {
		progress: duration > 0 ? clampNumber(timestamp / duration, 0, 1) : 0,
		timestamp
	};
}

function findOverlayRenderer(type: string): OverlayRenderer | null {
	for (const renderer of Object.values(PIPELINE_REGISTRY.overlays)) {
		if (renderer.type === type) {
			return renderer as OverlayRenderer;
		}
	}
	return null;
}

function prepareFramePackTreatments(
	state: EngineState,
	pack: PackManifest
): PreparedFramePackTreatments {
	const surfaceRenderer = getSurfaceRenderer(state.surface.type);
	let edgeTarget: EdgeTreatmentTarget | null = null;
	if (surfaceRenderer?.edgeTreatment) {
		const treatment = resolveEdgeTreatment(pack, state.surface.type);
		if (treatment && treatment.mode !== 'none') {
			let shadow: EdgeTreatmentTarget['shadow'] = null;
			if (treatment.mode === 'torn' || treatment.mode === 'irregular') {
				const inkHex = resolveAppearanceVars(pack, state.surface.type)['--ink'] ?? '#000000';
				const rig = resolveDepthTreatment(pack, state.surface.type, inkHex);
				if (rig?.kind === 'hardOffset') {
					let rgba: [number, number, number, number];
					try {
						rgba = hexToRgbaFloat(rig.color);
					} catch {
						rgba = [0, 0, 0, 1];
					}
					shadow = { dx: rig.dx, dy: rig.dy, rgb: [rgba[0], rgba[1], rgba[2]] };
				}
			}
			edgeTarget = {
				treatment,
				seedSource: state.surface.content.title ?? state.surface.type,
				shadow
			};
		}
	}

	const material = surfaceRenderer?.disablePackMaterial ? null : resolveMaterialTreatment(pack);
	const role = state.backgroundFill ? pack.roles['chrome'] : undefined;
	const chromeEffects: Effect[] =
		role?.kind === 'chrome'
			? role.effects.map((entry, index) => ({
					type: entry.type,
					id: `pack-chrome-${index}`,
					params: entry.params ?? {}
				}))
			: [];

	return {
		edgeTarget,
		material,
		light: resolveLightTreatment(pack),
		chromeEffects
	};
}

function appendPackChrome(
	effects: readonly Effect[],
	chromeEffects: readonly Effect[]
): readonly Effect[] {
	if (chromeEffects.length === 0) {
		return effects;
	}
	const authoredTypes = new Set(effects.map((effect) => effect.type));
	return [...effects, ...chromeEffects.filter((effect) => !authoredTypes.has(effect.type))];
}

function buildShaderPassDispatchList(
	request: CompositionFrameRenderRequest,
	treatments: PreparedFramePackTreatments,
	scope: 'flat' | 'stage'
): ShaderPassDispatchList {
	const { state, compositionElement } = request;
	const { host } = request.resources;
	const compositionSize = {
		width: host?.canvas.width ?? 0,
		height: host?.canvas.height ?? 0
	};
	const bounds = { x: 0, y: 0, width: compositionSize.width, height: compositionSize.height };
	const entries: Array<{
		pass: ShaderPass<unknown>;
		target: unknown;
		bounds: typeof bounds;
	}> = [];
	const surfaceRenderer = getSurfaceRenderer(state.surface.type);

	// Pack edge treatment runs before the Surface's own physics so those physics
	// operate on the treated silhouette.
	if (treatments.edgeTarget) {
		entries.push({
			pass: edgeTreatmentPass as ShaderPass<unknown>,
			target: treatments.edgeTarget,
			bounds
		});
	}

	if (
		surfaceRenderer?.shaderPass &&
		!(scope === 'stage' && (surfaceRenderer.shaderPass as ShaderPass<unknown>).environment)
	) {
		entries.push({
			pass: surfaceRenderer.shaderPass as ShaderPass<unknown>,
			target: state.surface,
			bounds
		});
	}

	if (scope === 'flat') {
		for (const overlay of state.overlays) {
			const renderer = findOverlayRenderer(overlay.type);
			if (!renderer?.shaderPass) {
				continue;
			}
			entries.push({
				pass: renderer.shaderPass as ShaderPass<unknown>,
				target: overlay.content,
				bounds: measureOverlayBoundsPx(overlay, compositionElement, compositionSize)
			});
		}
	}

	// Material is last: in flat mode it treats the merged element pixels once;
	// on stage it stays attached to the Surface plane before staging.
	if (treatments.material) {
		entries.push({
			pass: crtScanlinePass as ShaderPass<unknown>,
			target: treatments.material,
			bounds
		});
	}

	return entries;
}

function resolveDofFrame(state: EngineState, progress: number): ResolvedDofFrame | null {
	const dofEffect = state.effects.find((effect) => effect.type === 'depth-of-field');
	if (!dofEffect) {
		if (hasCompositionOwnedSurfaceOpacity(state)) {
			return {
				focusZ: 0,
				aperture: 0,
				surfaceZ: 0,
				overlayZ: clampNumber(state.overlays[0]?.z ?? 0.7, 0, 1),
				backdrop: NO_BACKDROP,
				otherEffects: state.effects
			};
		}
		return null;
	}

	const raw = (dofEffect.params ?? {}) as {
		focusZ?: unknown;
		aperture?: unknown;
		focusPull?: { from?: unknown; to?: unknown; start?: unknown; duration?: unknown };
		backdrop?: {
			strength?: unknown;
			edgeBlur?: unknown;
			vignette?: unknown;
			speckle?: unknown;
			color?: unknown;
			grain?: unknown;
		};
	};
	const aperture = Math.max(0, typeof raw.aperture === 'number' ? raw.aperture : 0);
	let focusZ = clampNumber(typeof raw.focusZ === 'number' ? raw.focusZ : 0, 0, 1);
	const pull = raw.focusPull;
	if (pull && typeof pull.from === 'number' && typeof pull.to === 'number') {
		const start = typeof pull.start === 'number' ? pull.start : 0;
		const duration = typeof pull.duration === 'number' && pull.duration > 0 ? pull.duration : 1;
		const local = clampNumber((progress - start) / duration, 0, 1);
		const eased = local * local * (3 - 2 * local);
		focusZ = clampNumber(pull.from + (pull.to - pull.from) * eased, 0, 1);
	}

	let backdrop = NO_BACKDROP;
	const rawBackdrop = raw.backdrop;
	if (rawBackdrop && typeof rawBackdrop.strength === 'number' && rawBackdrop.strength > 0) {
		const rgb =
			typeof rawBackdrop.color === 'string'
				? hexToRgbaFloat(rawBackdrop.color)
				: [0.06, 0.06, 0.08, 1];
		backdrop = {
			strength: clampNumber(rawBackdrop.strength, 0, 1),
			edgeBlur: clampNumber(
				typeof rawBackdrop.edgeBlur === 'number' ? rawBackdrop.edgeBlur : 1,
				0,
				1
			),
			vignette: clampNumber(
				typeof rawBackdrop.vignette === 'number' ? rawBackdrop.vignette : 0.5,
				0,
				1
			),
			speckle: clampNumber(
				typeof rawBackdrop.speckle === 'number' ? rawBackdrop.speckle : 0.5,
				0,
				1
			),
			color: [rgb[0], rgb[1], rgb[2]],
			grain: Math.max(0, typeof rawBackdrop.grain === 'number' ? rawBackdrop.grain : 0.02)
		};
	}

	return {
		focusZ,
		aperture,
		surfaceZ: 0,
		overlayZ: clampNumber(state.overlays[0]?.z ?? 0.7, 0, 1),
		backdrop,
		otherEffects: state.effects.filter((effect) => effect.type !== 'depth-of-field')
	};
}

function resolveStageFrame(
	state: EngineState,
	progress: number,
	light: LightTreatment | null
): ResolvedStageFrame | null {
	const stage = state.stage;
	if (!stage || stage.type !== 'depth') {
		return null;
	}
	let focusZ = clampNumber(stage.focus.focusZ, 0, 1);
	const pull = stage.focus.pull;
	if (pull) {
		const duration = pull.duration > 0 ? pull.duration : 1;
		const local = clampNumber((progress - pull.start) / duration, 0, 1);
		const eased = local * local * (3 - 2 * local);
		focusZ = clampNumber(pull.from + (pull.to - pull.from) * eased, 0, 1);
	}
	const background = state.backgroundFill ? hexToRgbaFloat(state.backgroundFill) : undefined;
	return {
		focusZ,
		aperture: clampNumber(stage.focus.aperture, 0, 1),
		focusBand: clampNumber(stage.focus.band, 0, 1),
		backdropColor: background ? [background[0], background[1], background[2]] : [0.1, 0.09, 0.08],
		backdropAsset: stage.backdrop?.image?.asset ?? null,
		backdropContrast: clampNumber(stage.backdrop?.contrast ?? 0, 0, 1),
		cameraMove: stage.camera.move,
		cameraAmount: clampNumber(stage.camera.amount, 0, 1),
		hasOverlayPlane: state.overlays.length > 0,
		overlayZ: clampNumber(state.overlays[0]?.z ?? 0.7, 0, 1),
		light,
		effects: state.effects
	};
}

function surfaceFadeAlpha(state: EngineState, paperVisibility: number): number {
	return hasCompositionOwnedSurfaceOpacity(state) ? clampNumber(paperVisibility, 0, 1) : 1;
}

function stageSurfaceFadeAlpha(state: EngineState, paperVisibility: number): number {
	const renderer = getSurfaceRenderer(state.surface.type);
	const fadeCarrierSkipped = Boolean(
		(renderer?.shaderPass as ShaderPass<unknown> | undefined)?.environment
	);
	return fadeCarrierSkipped || hasCompositionOwnedSurfaceOpacity(state)
		? clampNumber(paperVisibility, 0, 1)
		: 1;
}

function dofInputTexture(planes: CompositionPlanes, surfacePlane: GPUTexture): GPUTexture {
	if (typeof window !== 'undefined') {
		if (window.__supersDofPreviewPlane === 'surface') {
			return surfacePlane;
		}
		if (window.__supersDofPreviewPlane === 'overlay') {
			return planes.overlayPlaneTexture();
		}
	}
	return planes.compositeTexture();
}

function renderDofFrame(
	request: CompositionFrameRenderRequest,
	dof: ResolvedDofFrame,
	inputs: SurfaceRenderInputs,
	timebase: CompositionFrameTimebase,
	treatments: PreparedFramePackTreatments
): boolean {
	const { pipeline, host, effectChain, compositionPlanes } = request.resources;
	const { overlayRootElement } = request;
	if (!pipeline || !host || !effectChain || !compositionPlanes || !overlayRootElement) {
		return false;
	}

	pipeline.render(inputs);
	const surfaceOutput = pipeline.getOutputTexture();
	compositionPlanes.captureOverlay(overlayRootElement);
	compositionPlanes.composite({
		surfacePlaneView: surfaceOutput.createView(),
		focusZ: dof.focusZ,
		aperture: dof.aperture,
		surfaceZ: dof.surfaceZ,
		overlayZ: dof.overlayZ,
		backdrop: dof.backdrop,
		time: timebase.progress,
		surfaceAlpha: surfaceFadeAlpha(request.state, request.paperVisibility)
	});
	effectChain.apply({
		commandEncoder: host.device.createCommandEncoder(),
		effects: appendPackChrome(dof.otherEffects, treatments.chromeEffects),
		inputTexture: dofInputTexture(compositionPlanes, surfaceOutput),
		outputView: request.outputView,
		...timebase,
		background: request.state.backgroundFill
			? hexToRgbaFloat(request.state.backgroundFill)
			: undefined
	});
	return true;
}

function renderStageFrame(
	request: CompositionFrameRenderRequest,
	stage: ResolvedStageFrame,
	inputs: SurfaceRenderInputs,
	timebase: CompositionFrameTimebase,
	treatments: PreparedFramePackTreatments
): boolean {
	const { pipeline, host, effectChain, depthStage, shaderPassDispatcher, compositionPlanes } =
		request.resources;
	if (!pipeline || !host || !effectChain || !depthStage || !shaderPassDispatcher) {
		return false;
	}

	pipeline.render(inputs);
	const stagedSurfaceTexture = shaderPassDispatcher.apply({
		commandEncoder: host.device.createCommandEncoder(),
		passes: buildShaderPassDispatchList(request, treatments, 'stage'),
		inputTexture: pipeline.getOutputTexture(),
		ctx: timebase
	});
	let overlayPlaneView: GPUTextureView | undefined;
	if (stage.hasOverlayPlane && compositionPlanes && request.overlayRootElement) {
		compositionPlanes.captureOverlay(request.overlayRootElement);
		compositionPlanes.premultiplyOverlay();
		overlayPlaneView = compositionPlanes.overlayPlaneTexture().createView();
	}
	depthStage.render({
		surfacePlaneView: stagedSurfaceTexture.createView(),
		overlayPlaneView,
		overlayZ: stage.overlayZ,
		focusZ: stage.focusZ,
		aperture: stage.aperture,
		focusBand: stage.focusBand,
		backdropColor: stage.backdropColor,
		backdropTextureView:
			stage.backdropAsset && request.substrateTexture
				? request.substrateTexture.createView()
				: undefined,
		backdropContrast: stage.backdropContrast,
		cameraMove: stage.cameraMove,
		cameraAmount: stage.cameraAmount,
		light: stage.light,
		surfaceFadeAlpha: stageSurfaceFadeAlpha(request.state, request.paperVisibility),
		time: timebase.progress
	});
	const { eyeZ } = stageCameraPose(stage.cameraMove, stage.cameraAmount, timebase.progress);
	effectChain.apply({
		commandEncoder: host.device.createCommandEncoder(),
		effects: appendPackChrome(stage.effects, treatments.chromeEffects),
		inputTexture: depthStage.outputTexture(),
		outputView: request.outputView,
		...timebase,
		stageContentScale: STAGE_CAM_Z / eyeZ,
		background: undefined
	});
	return true;
}

function renderFlatFrame(
	request: CompositionFrameRenderRequest,
	inputs: SurfaceRenderInputs,
	timebase: CompositionFrameTimebase,
	treatments: PreparedFramePackTreatments
): boolean {
	const { pipeline, host, effectChain, shaderPassDispatcher } = request.resources;
	if (!pipeline || !host || !effectChain || !shaderPassDispatcher) {
		return false;
	}
	pipeline.render(inputs);
	const commandEncoder = host.device.createCommandEncoder();
	const postShaderTexture = shaderPassDispatcher.apply({
		commandEncoder,
		passes: buildShaderPassDispatchList(request, treatments, 'flat'),
		inputTexture: pipeline.getOutputTexture(),
		ctx: timebase
	});
	effectChain.apply({
		commandEncoder,
		effects: appendPackChrome(request.state.effects, treatments.chromeEffects),
		inputTexture: postShaderTexture,
		outputView: request.outputView,
		...timebase,
		background: request.state.backgroundFill
			? hexToRgbaFloat(request.state.backgroundFill)
			: undefined
	});
	return true;
}

/** Render one deterministic composition frame. Preview, transition snapshots,
 * and export all call this exact seam with an explicit output view + timestamp. */
export function renderCompositionFrameTo(
	request: CompositionFrameRenderRequest
): CompositionFrameRenderResult {
	const branches = resolveCompositionFrameBranchOrder(
		request.state,
		request.cachedTransition !== null
	);
	if (branches[0] === 'transition' && request.cachedTransition) {
		const timebase = frameTimebase(request.state, request.timestamp);
		request.cachedTransition.wipe.apply({
			fromView: request.cachedTransition.snapshots.fromTexture().createView(),
			toView: request.cachedTransition.snapshots.toTexture().createView(),
			outputView: request.outputView,
			progress: timebase.progress
		});
		return 'transition';
	}

	const { pipeline, host, effectChain, shaderPassDispatcher } = request.resources;
	if (!pipeline || !host || !effectChain || !shaderPassDispatcher) {
		return 'unavailable';
	}

	const timebase = frameTimebase(request.state, request.timestamp);
	const inputs = request.buildSurfaceInputs(request.timestamp);
	const treatments = prepareFramePackTreatments(request.state, request.pack);

	// copyElementImageToTexture is queue-ordered once before every live branch.
	// Branch-local Surface render and Overlay capture therefore consume the same
	// current DOM in preview, export, and transition endpoint capture.
	pipeline.uploadDom();

	for (const branch of branches) {
		if (branch === 'stage') {
			const stage = resolveStageFrame(request.state, timebase.progress, treatments.light);
			if (stage && renderStageFrame(request, stage, inputs, timebase, treatments)) {
				return 'stage';
			}
			continue;
		}
		if (branch === 'dof') {
			const dof = resolveDofFrame(request.state, timebase.progress);
			if (dof && renderDofFrame(request, dof, inputs, timebase, treatments)) {
				return 'dof';
			}
			continue;
		}
		if (branch === 'flat' && renderFlatFrame(request, inputs, timebase, treatments)) {
			return 'flat';
		}
	}

	return 'unavailable';
}
