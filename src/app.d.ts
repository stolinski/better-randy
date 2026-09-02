// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type {
	WebmcpExposureRefusal,
	WebmcpModelContextHost
} from '$lib/platform/webmcp-tool-controller';

declare global {
	interface Document {
		/**
		 * The WebMCP tool surface, absent outside a browser that ships it and
		 * outside the Permissions Policy that grants `tools` (ADR-0054 §7). Only
		 * `WebmcpToolController` touches it.
		 */
		modelContext?: WebmcpModelContextHost;
	}

	interface Window {
		/**
		 * Why this document registers no WebMCP tools, or `null` when it may. A
		 * refusal is silent by design (ADR-0054 §5), so this is the one place a
		 * headless harness can read it. Set once by the root layout, before any
		 * route mounts and whether or not the CanvasDrawElement gate is open.
		 */
		__gfxWebmcpExposureRefusal?: WebmcpExposureRefusal | null;
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
		interface Locals {
			/**
			 * Set by `handleError` once Sentry has captured an unhandled exception
			 * for this request, so `logErrorResponses` can tell that failure apart
			 * from an intentional `error(5xx, ...)` and not file it twice. Absent on
			 * every request that did not crash.
			 *
			 * Carried on `locals` because that is the one object SvelteKit shares by
			 * reference between the two: it builds `locals: {}` once per request and
			 * every event copy handed to a hook spreads that same reference.
			 */
			serverExceptionReportedToSentry?: boolean;
		}
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
