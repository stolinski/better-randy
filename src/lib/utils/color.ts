import { clampNumber } from './math';

export interface RgbColorChannels {
	blue: number;
	green: number;
	red: number;
}

const HEX_COLOR_PATTERN = /^#(?<value>[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function getRgbColorChannels(color: string): RgbColorChannels {
	const match = HEX_COLOR_PATTERN.exec(color.trim());
	const hexValue = match?.groups?.value;

	if (!hexValue) {
		throw new TypeError(`Expected a hex color, received "${color}".`);
	}

	const expandedHex =
		hexValue.length === 3
			? hexValue
					.split('')
					.map((character) => `${character}${character}`)
					.join('')
			: hexValue;
	const colorValue = Number.parseInt(expandedHex, 16);

	return {
		red: (colorValue >> 16) & 255,
		green: (colorValue >> 8) & 255,
		blue: colorValue & 255
	};
}

export function hexToRgbaFloat(hex: string): [number, number, number, number] {
	const { red, green, blue } = getRgbColorChannels(hex);
	return [red / 255, green / 255, blue / 255, 1.0];
}

/** Rec. 709 relative luminance of a hex color, 0 (black) … 1 (white). */
export function relativeLuminance(hex: string): number {
	const [red, green, blue] = hexToRgbaFloat(hex);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * True when a surface background reads as dark (light text / UI sits on it).
 * Drives the highlight mode: dark surfaces punch light text to ink under the
 * amber mark, light surfaces multiply (paper). Threshold at mid-luminance.
 * Returns `false` (treat as light) for any non-hex value rather than throwing.
 */
export function isDarkSurfaceColor(hex: string): boolean {
	try {
		return relativeLuminance(hex) < 0.5;
	} catch {
		// Not a parseable hex (e.g. a named/transparent value) — default to light.
		return false;
	}
}

export function getCanvasRgbColor(color: string, opacity: number): string {
	const { red, green, blue } = getRgbColorChannels(color);
	const alpha = clampNumber(opacity, 0, 1);

	return `rgb(${red} ${green} ${blue} / ${alpha})`;
}
