import type { GpuHost } from './gpu-host';
import type { DecodedVideoAssetFrame } from './video-asset-decoder';

const VIDEO_UNDERLAY_TEXTURE_USAGE =
	0x04 /* TEXTURE_BINDING */ | 0x02 /* COPY_DST */ | 0x10; /* RENDER_ATTACHMENT */

export interface PreparedVideoUnderlayTexture {
	texture: GPUTexture;
	width: number;
	height: number;
	displayWidth: number;
	displayHeight: number;
	rotation: 0 | 90 | 180 | 270;
}

/** Uploads decoded pixels immediately; final-present GPU math owns display
 * rotation, pixel-aspect-aware cover crop, and target scaling. */
export class VideoUnderlayFrameTexture {
	readonly #host: GpuHost;
	#texture: GPUTexture | null = null;
	#width = 0;
	#height = 0;

	constructor(host: GpuHost) {
		this.#host = host;
	}

	upload(frame: DecodedVideoAssetFrame): PreparedVideoUnderlayTexture {
		const width = Math.max(1, Math.round(frame.visibleRect.width));
		const height = Math.max(1, Math.round(frame.visibleRect.height));
		if (!this.#texture || width !== this.#width || height !== this.#height) {
			this.#texture?.destroy();
			this.#width = width;
			this.#height = height;
			this.#texture = this.#host.device.createTexture({
				size: [width, height, 1],
				format: 'rgba8unorm',
				usage: VIDEO_UNDERLAY_TEXTURE_USAGE
			});
		}

		this.#host.device.queue.copyExternalImageToTexture(
			{ source: frame.sample.toCanvasImageSource() },
			{ texture: this.#texture },
			[width, height]
		);
		return {
			texture: this.#texture,
			width,
			height,
			displayWidth: frame.displayWidth,
			displayHeight: frame.displayHeight,
			rotation: frame.rotation
		};
	}

	dispose(): void {
		this.#texture?.destroy();
		this.#texture = null;
		this.#width = 0;
		this.#height = 0;
	}
}
