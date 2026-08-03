export interface BicubicSampleWgslOptions {
	prefix: string;
	result: string;
	sampler: string;
	texture: string;
	uv: string;
}

/**
 * Emits a scoped sharp cubic-convolution sample with bounded local edge
 * restoration. `textureLoad` avoids derivative-uniformity constraints when
 * optical geometry branches per pixel.
 */
export function createBicubicSampleWgsl({
	prefix,
	result,
	sampler,
	texture,
	uv
}: BicubicSampleWgslOptions): string {
	return /* wgsl */ `
		let ${prefix}Size = vec2i(textureDimensions(${texture}));
		let ${prefix}Position = (${uv}) * vec2f(${prefix}Size) - vec2f(0.5);
		let ${prefix}Base = vec2i(floor(${prefix}Position));
		let ${prefix}Fraction = fract(${prefix}Position);
		let ${prefix}Fraction2 = ${prefix}Fraction * ${prefix}Fraction;
		let ${prefix}Fraction3 = ${prefix}Fraction2 * ${prefix}Fraction;
		let ${prefix}WeightsX = vec4f(
			-0.75 * ${prefix}Fraction.x + 1.5 * ${prefix}Fraction2.x - 0.75 * ${prefix}Fraction3.x,
			1.0 - 2.25 * ${prefix}Fraction2.x + 1.25 * ${prefix}Fraction3.x,
			0.75 * ${prefix}Fraction.x + 1.5 * ${prefix}Fraction2.x - 1.25 * ${prefix}Fraction3.x,
			-0.75 * ${prefix}Fraction2.x + 0.75 * ${prefix}Fraction3.x
		);
		let ${prefix}WeightsY = vec4f(
			-0.75 * ${prefix}Fraction.y + 1.5 * ${prefix}Fraction2.y - 0.75 * ${prefix}Fraction3.y,
			1.0 - 2.25 * ${prefix}Fraction2.y + 1.25 * ${prefix}Fraction3.y,
			0.75 * ${prefix}Fraction.y + 1.5 * ${prefix}Fraction2.y - 1.25 * ${prefix}Fraction3.y,
			-0.75 * ${prefix}Fraction2.y + 0.75 * ${prefix}Fraction3.y
		);
		var ${prefix}Value = vec4f(0.0);
		for (var ${prefix}Y = 0; ${prefix}Y < 4; ${prefix}Y = ${prefix}Y + 1) {
			for (var ${prefix}X = 0; ${prefix}X < 4; ${prefix}X = ${prefix}X + 1) {
				let ${prefix}Coordinate = clamp(
					${prefix}Base + vec2i(${prefix}X - 1, ${prefix}Y - 1),
					vec2i(0),
					${prefix}Size - vec2i(1)
				);
				${prefix}Value = ${prefix}Value
					+ textureLoad(${texture}, ${prefix}Coordinate, 0)
						* ${prefix}WeightsX[${prefix}X] * ${prefix}WeightsY[${prefix}Y];
			}
		}
		let ${prefix}Texel = vec2f(1.0) / vec2f(${prefix}Size);
		let ${prefix}NeighborRgb = (
			textureSampleLevel(${texture}, ${sampler}, (${uv}) + vec2f(${prefix}Texel.x, 0.0), 0.0).rgb
			+ textureSampleLevel(${texture}, ${sampler}, (${uv}) - vec2f(${prefix}Texel.x, 0.0), 0.0).rgb
			+ textureSampleLevel(${texture}, ${sampler}, (${uv}) + vec2f(0.0, ${prefix}Texel.y), 0.0).rgb
			+ textureSampleLevel(${texture}, ${sampler}, (${uv}) - vec2f(0.0, ${prefix}Texel.y), 0.0).rgb
		) * 0.25;
		let ${prefix}Rgb = clamp(
			${prefix}Value.rgb + (${prefix}Value.rgb - ${prefix}NeighborRgb) * 0.5,
			vec3f(0.0),
			vec3f(1.0)
		);
		let ${result} = vec4f(${prefix}Rgb, clamp(${prefix}Value.a, 0.0, 1.0));
	`;
}
