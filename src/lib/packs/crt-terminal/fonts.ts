/**
 * CRT Terminal Pack typefaces.
 *
 * One family everywhere — the terminal has one voice
 * (docs/packs/crt-terminal/aesthetic.md § Type System). JetBrains Mono is the
 * channel's practical mono and is already self-hosted via `@fontsource`
 * (the Syntax kicker thread bundles the same woff2 files, so this adds no new
 * font assets); the imports here make the Pack self-sufficient if Syntax is
 * ever unloaded. The period feel comes from the phosphor MATERIAL (glow,
 * raster, persistence), never from bitmap/pixel faces — those read
 * retro-game at 4K and fail long-body readability (rejected by the aesthetic
 * doc).
 */
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';

import type { PackFont } from '$lib/platform/packs/types';

export const crtTerminalFonts: readonly PackFont[] = [
	{ family: 'JetBrains Mono', weights: [400, 500, 700] }
];
