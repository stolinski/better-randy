import { env } from '$env/dynamic/public';

import { isHostedOrigin } from './public-runtime-contract';

/**
 * Whether this page is served by the hosted gfx.computer origin — a Cloudflare
 * Worker with no encoder and no disk
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md)
 * amendment). Read once from the `PUBLIC_GFX_HOSTED` input the origin reads too,
 * so the page and the server never disagree about where they are. Every client
 * decision that hangs off it — the browser export lane, the formats offered,
 * the disk-backed authoring hidden — reads this one value.
 */
export const IS_HOSTED_ORIGIN: boolean = isHostedOrigin(env);
