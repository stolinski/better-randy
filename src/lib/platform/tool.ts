import type { AnimationManifest } from './animation-manager';
import type { GpuHost } from './gpu-host';
import type { TimelineTrack } from './TimelineTrackView.svelte';
import type { VideoOrientation } from '$lib/utils/video-frame';

export type ExportFormat = 'webm' | 'prores';

export interface ToolPipeline {
	uploadDom(): void;
	render(inputs: unknown): void;
	dispose(): void;
}

export interface ToolTransportState {
	orientation: VideoOrientation;
	durationSeconds: number;
	fps: number;
	format: ExportFormat;
}

export interface ToolPipelineFactoryOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

export interface ToolExportOptions {
	canvas: HTMLCanvasElement;
	pipeline: ToolPipeline;
	onProgress(value: number): void;
}

export interface Tool {
	title: string;
	kicker?: string;
	controlsId: string;
	transport: ToolTransportState;
	createPipeline(options: ToolPipelineFactoryOptions): ToolPipeline;
	buildAnimationManifest(): AnimationManifest;
	buildTracks(): TimelineTrack[];
	buildRenderInputs(timestamp: number): unknown;
	touchDomState?(): void;
	touchRenderState?(): void;
	syncDerived?(): void;
	exportToFile(options: ToolExportOptions): Promise<void>;
}
