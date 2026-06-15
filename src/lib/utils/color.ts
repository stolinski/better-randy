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

export function getCanvasRgbColor(color: string, opacity: number): string {
	const { red, green, blue } = getRgbColorChannels(color);
	const alpha = clampNumber(opacity, 0, 1);

	return `rgb(${red} ${green} ${blue} / ${alpha})`;
}
