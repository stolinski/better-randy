/**
 * The seam the `delivery` family exports through
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * An export needs the live canvas, the GPU host, the animation manifest, and
 * the DOM settle loop — all of which the mounted Workspace owns and none of
 * which an operation may reach for itself. So the Workspace registers its
 * export runner here, exactly as it registers the transport through
 * `timelineHandle`, and `delivery.export-video` calls it and waits for the real
 * outcome.
 *
 * A `null` runner is the honest state of a page with no Workspace on screen:
 * there is nothing to encode, and the operation refuses instead of reporting a
 * file that does not exist.
 */
import type { CompositionExportOutcome } from './composition-export-controller';
import type { SyncExportRequest } from './export-video';

export type CompositionExportRunner = (options: {
	request?: SyncExportRequest;
	signal?: AbortSignal;
}) => Promise<CompositionExportOutcome>;

export const compositionExportHandle = $state<{ current: CompositionExportRunner | null }>({
	current: null
});
