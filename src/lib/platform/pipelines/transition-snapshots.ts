import type { GpuHost } from '$lib/platform/gpu-host';

/**
 * Owns the two cached colour textures a multi-state transition wipes between
 * (ADR-0026). Each holds the finished composite of one state (`from` / `to`),
 * captured once via the normal render path with the present pass pointed at the
 * snapshot's view instead of the canvas. The transition Effect then samples both
 * every frame and animates its mask over them — no per-frame re-render of either
 * state, no two live compositions.
 *
 * Textures are the host's canvas format (the present pass's output format) with
 * RENDER_ATTACHMENT (capture target) + TEXTURE_BINDING (sampled by the wipe).
 * Sized to the canvas at construction, like EffectChain / ShaderPassDispatcher;
 * disposed alongside the host.
 */

const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const SNAPSHOT_TEXTURE_USAGE = TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT;

export interface TransitionSnapshotsOptions {
	host: GpuHost;
	width: number;
	height: number;
}

export interface TransitionSnapshotFrameTextures {
	fromTarget(): GPUTextureView;
	toTarget(): GPUTextureView;
	fromTexture(): GPUTexture;
	toTexture(): GPUTexture;
	dispose(): void;
}

export class TransitionSnapshots implements TransitionSnapshotFrameTextures {
	#fromTexture: GPUTexture;
	#toTexture: GPUTexture;

	constructor({ host, width, height }: TransitionSnapshotsOptions) {
		const descriptor: GPUTextureDescriptor = {
			size: [width, height, 1],
			format: host.format,
			usage: SNAPSHOT_TEXTURE_USAGE
		};
		this.#fromTexture = host.device.createTexture(descriptor);
		this.#toTexture = host.device.createTexture(descriptor);
	}

	/** Render-attachment view to capture the `from` state's finished frame into. */
	fromTarget(): GPUTextureView {
		return this.#fromTexture.createView();
	}

	/** Render-attachment view to capture the `to` state's finished frame into. */
	toTarget(): GPUTextureView {
		return this.#toTexture.createView();
	}

	/** Sampled view of the captured `from` snapshot, bound by the transition Effect. */
	fromTexture(): GPUTexture {
		return this.#fromTexture;
	}

	/** Sampled view of the captured `to` snapshot, bound by the transition Effect. */
	toTexture(): GPUTexture {
		return this.#toTexture;
	}

	dispose(): void {
		this.#fromTexture.destroy();
		this.#toTexture.destroy();
	}
}
