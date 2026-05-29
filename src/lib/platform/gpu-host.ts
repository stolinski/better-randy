import tgpu, { type TgpuRoot } from 'typegpu';

/**
 * Format for every off-screen intermediate — surface output texture, shader-pass
 * and effect-chain ping-pong. 16-bit float preserves gradient and compositing
 * precision through the whole chain; the effect chain's final present pass
 * dithers this down to the 8-bit canvas (`GpuHost.format`), which is where
 * banding would otherwise appear. DOM/marks source textures stay `rgba8unorm`.
 */
export const INTERMEDIATE_FORMAT: GPUTextureFormat = 'rgba16float';

export interface GpuHost {
	canvas: HTMLCanvasElement;
	context: GPUCanvasContext;
	device: GPUDevice;
	format: GPUTextureFormat;
	root: TgpuRoot;
	dispose(): void;
}

export async function createGpuHost(canvas: HTMLCanvasElement): Promise<GpuHost> {
	if (!navigator.gpu) {
		throw new Error('WebGPU is not available in this browser.');
	}

	const root = await tgpu.init();
	const format = navigator.gpu.getPreferredCanvasFormat();
	const rawContext = canvas.getContext('webgpu') as GPUCanvasContext | null;

	if (!rawContext) {
		root.destroy();
		throw new Error('Failed to acquire a WebGPU context on the host canvas.');
	}

	const context: GPUCanvasContext = rawContext;
	context.configure({
		device: root.device,
		format,
		alphaMode: 'premultiplied'
	});

	return {
		canvas,
		context,
		device: root.device,
		format,
		root,
		dispose() {
			root.destroy();
		}
	};
}
