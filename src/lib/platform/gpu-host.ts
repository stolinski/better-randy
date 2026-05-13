import tgpu, { type TgpuRoot } from 'typegpu';

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
