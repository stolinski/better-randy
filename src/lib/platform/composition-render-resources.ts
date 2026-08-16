import type { CompositionFrameRenderResources } from './composition-frame-renderer';
import type { GpuHost } from './gpu-host';
import { getLoadedSurfaceRenderer } from './pipelines/runtime-loader';
import { CompositionPlanes } from './pipelines/composition-planes';
import { DepthStage } from './pipelines/depth-stage';
import { EffectChain } from './pipelines/effect-chain';
import { ShaderPassDispatcher } from './pipelines/shader-pass-runner';
import type { SurfaceRenderInstance } from './pipelines/types';

export interface CompositionRenderResourceIdentity {
	height: number;
	host: GpuHost;
	sourceElement: HTMLElement;
	surfaceType: string;
	width: number;
}

export interface CompositionRenderResourceFactories {
	createCompositionPlanes(identity: CompositionRenderResourceIdentity): CompositionPlanes;
	createDepthStage(identity: CompositionRenderResourceIdentity): DepthStage;
	createEffectChain(identity: CompositionRenderResourceIdentity): EffectChain;
	createShaderPassDispatcher(identity: CompositionRenderResourceIdentity): ShaderPassDispatcher;
	createSurfacePipeline(identity: CompositionRenderResourceIdentity): SurfaceRenderInstance;
}

const DEFAULT_FACTORIES: CompositionRenderResourceFactories = {
	createSurfacePipeline: (identity) => {
		const renderer = getLoadedSurfaceRenderer(identity.surfaceType);
		if (!renderer) throw new Error(`No Surface renderer registered for "${identity.surfaceType}".`);
		return renderer.createPipeline({ host: identity.host, sourceElement: identity.sourceElement });
	},
	createEffectChain: ({ host, width, height }) => new EffectChain({ host, width, height }),
	createShaderPassDispatcher: ({ host, width, height }) =>
		new ShaderPassDispatcher({ host, width, height }),
	createCompositionPlanes: ({ host, width, height }) =>
		new CompositionPlanes({ host, width, height }),
	createDepthStage: ({ host, width, height }) => new DepthStage({ host, width, height })
};

function sameIdentity(
	left: CompositionRenderResourceIdentity,
	right: CompositionRenderResourceIdentity
): boolean {
	return (
		left.host === right.host &&
		left.sourceElement === right.sourceElement &&
		left.surfaceType === right.surfaceType &&
		left.width === right.width &&
		left.height === right.height
	);
}

export class CompositionRenderResourceSet {
	readonly identity: CompositionRenderResourceIdentity;
	readonly pipeline: SurfaceRenderInstance;
	readonly effectChain: EffectChain;
	readonly shaderPassDispatcher: ShaderPassDispatcher;
	readonly compositionPlanes: CompositionPlanes;
	readonly depthStage: DepthStage;
	#isDisposed = false;

	constructor(
		identity: CompositionRenderResourceIdentity,
		resources: Omit<CompositionFrameRenderResources, 'host'> & {
			pipeline: SurfaceRenderInstance;
			effectChain: EffectChain;
			shaderPassDispatcher: ShaderPassDispatcher;
			compositionPlanes: CompositionPlanes;
			depthStage: DepthStage;
		}
	) {
		this.identity = identity;
		this.pipeline = resources.pipeline;
		this.effectChain = resources.effectChain;
		this.shaderPassDispatcher = resources.shaderPassDispatcher;
		this.compositionPlanes = resources.compositionPlanes;
		this.depthStage = resources.depthStage;
	}

	snapshot(): CompositionFrameRenderResources {
		if (this.#isDisposed) {
			return {
				host: null,
				pipeline: null,
				effectChain: null,
				shaderPassDispatcher: null,
				compositionPlanes: null,
				depthStage: null
			};
		}
		return {
			host: this.identity.host,
			pipeline: this.pipeline,
			effectChain: this.effectChain,
			shaderPassDispatcher: this.shaderPassDispatcher,
			compositionPlanes: this.compositionPlanes,
			depthStage: this.depthStage
		};
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.depthStage.dispose();
		this.compositionPlanes.dispose();
		this.shaderPassDispatcher.dispose();
		this.effectChain.dispose();
		this.pipeline.dispose();
	}
}

/** Atomically constructs and replaces the complete GPU resource set for one render identity. */
export class CompositionRenderResourceController {
	readonly #factories: CompositionRenderResourceFactories;
	#current: CompositionRenderResourceSet | null = null;
	#isDisposed = false;

	constructor(factories: CompositionRenderResourceFactories = DEFAULT_FACTORIES) {
		this.#factories = factories;
	}

	replace(identity: CompositionRenderResourceIdentity): CompositionRenderResourceSet {
		if (this.#isDisposed) throw new Error('Composition render resources are disposed.');
		if (this.#current && sameIdentity(this.#current.identity, identity)) return this.#current;

		const disposables: Array<{ dispose(): void }> = [];
		try {
			const pipeline = this.#factories.createSurfacePipeline(identity);
			disposables.push(pipeline);
			const effectChain = this.#factories.createEffectChain(identity);
			disposables.push(effectChain);
			const shaderPassDispatcher = this.#factories.createShaderPassDispatcher(identity);
			disposables.push(shaderPassDispatcher);
			const compositionPlanes = this.#factories.createCompositionPlanes(identity);
			disposables.push(compositionPlanes);
			const depthStage = this.#factories.createDepthStage(identity);
			disposables.push(depthStage);
			const next = new CompositionRenderResourceSet(identity, {
				pipeline,
				effectChain,
				shaderPassDispatcher,
				compositionPlanes,
				depthStage
			});
			const previous = this.#current;
			this.#current = next;
			previous?.dispose();
			return next;
		} catch (error) {
			for (const disposable of disposables.reverse()) disposable.dispose();
			throw error;
		}
	}

	current(): CompositionRenderResourceSet | null {
		return this.#current;
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#current?.dispose();
		this.#current = null;
	}
}
