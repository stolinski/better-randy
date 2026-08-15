import { createContext } from 'svelte';

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

export const pipelineRendererRuntime = new PipelineRendererRuntime(pipelineRendererController);

export const [getPipelineRendererRuntime, setPipelineRendererRuntime] =
	createContext<PipelineRendererRuntime>();
