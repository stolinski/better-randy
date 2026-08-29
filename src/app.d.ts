// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { WebmcpModelContextHost } from '$lib/platform/webmcp-tool-controller';

declare global {
	interface Document {
		/**
		 * The WebMCP tool surface, absent outside a browser that ships it and
		 * outside the Permissions Policy that grants `tools` (ADR-0054 §7). Only
		 * `WebmcpToolController` touches it.
		 */
		modelContext?: WebmcpModelContextHost;
	}

	interface CanvasRenderingContext2D {
		drawElementImage?: (
			element: Element,
			dx: number,
			dy: number,
			dwidth: number,
			dheight: number
		) => DOMMatrix;
	}

	interface OffscreenCanvasRenderingContext2D {
		drawElementImage?: (
			element: Element,
			dx: number,
			dy: number,
			dwidth: number,
			dheight: number
		) => DOMMatrix;
	}

	interface HTMLCanvasElement {
		requestPaint?: () => void;
		onpaint?: ((event: Event & { changedElements?: readonly Element[] }) => void) | null;
	}

	namespace App {
		// No `Platform`: the public runtime is a plain Node server (ADR-0052),
		// so request handlers get Node APIs directly rather than an edge binding
		// object.
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

declare module 'svelte/elements' {
	interface HTMLCanvasAttributes {
		layoutsubtree?: boolean | '';
	}
}

export {};
