import {
	pipelineRendererController,
	type PipelineRendererController,
	type PipelineRendererRequirements,
	type ResolvedPipelineRendererBundle
} from './runtime-loader';

/** Reactive Svelte view over the process-wide renderer controller. */
export class PipelineRendererRuntime {
	#revision = $state(0);
	readonly #controller: PipelineRendererController;

	constructor(controller: PipelineRendererController) {
		this.#controller = controller;
		controller.subscribeToActivation(() => {
			this.#revision += 1;
		});
	}

	activationRevision(): number {
		return this.#revision;
	}

	current(): ResolvedPipelineRendererBundle {
		this.activationRevision();
		return this.#controller.current();
	}

	resolve(requirements: PipelineRendererRequirements): Promise<ResolvedPipelineRendererBundle> {
		return this.#controller.resolve(requirements);
	}

	activate(bundle: ResolvedPipelineRendererBundle): void {
		this.#controller.activate(bundle);
	}

	ensureSurface(type: string): Promise<void> {
		return this.#controller.ensureSurface(type);
	}

	ensureAnnotation(type: string): Promise<void> {
		return this.#controller.ensureAnnotation(type);
	}

	ensureOverlay(type: string): Promise<void> {
		return this.#controller.ensureOverlay(type);
	}

	ensureEffect(type: string): Promise<void> {
		return this.#controller.ensureEffect(type);
	}

	ensureTransition(type: string): Promise<void> {
		return this.#controller.ensureTransition(type);
	}
}

// The one reactive view every mount and inspector reads. It is imported
// directly rather than handed down through Svelte context: the value is a
// process-wide singleton with a single producer, so a context only added a
// failure mode — any consumer instantiated outside the providing component's
// context chain (a hot-module replacement re-render, for example) threw
// `missing_context` instead of reaching the runtime that was already there.
// Reading the module singleton where it is used cannot fail that way, and the
// `$state` revision inside it keeps every reader reactive exactly as before.
export const pipelineRendererRuntime = new PipelineRendererRuntime(pipelineRendererController);
