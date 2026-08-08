import { createHash } from 'node:crypto';
import { createServer, type ViteDevServer } from 'vite';

import type { PackManifest } from '../src/lib/platform/packs/types.ts';
import type {
	ChartMarkFillRole,
	ResolvedChartMarkFill
} from '../src/lib/platform/packs/resolve.ts';
import type {
	ChartMarkFillSampleInput,
	ChartPremultipliedRgba
} from '../src/lib/pipelines/shader-passes/chart-mark-fill.ts';

interface RegistryModule {
	PACK_REGISTRY: Readonly<Record<string, PackManifest>>;
}

interface ResolverModule {
	resolveChartMarkFillTreatment(
		manifest: PackManifest,
		role: ChartMarkFillRole
	): ResolvedChartMarkFill;
}

interface ColorModule {
	cssColorToRgbaFloat(color: string): [number, number, number, number];
}

interface SamplerModule {
	sampleChartMarkFillReference(
		base: ResolvedChartMarkFill,
		emphasis: ResolvedChartMarkFill,
		input: ChartMarkFillSampleInput
	): ChartPremultipliedRgba;
}

interface ProbeMetrics {
	pack: string;
	role: ChartMarkFillRole;
	orientation: 'horizontal' | 'vertical';
	mask: 'circle' | 'rectangle' | 'rounded-aa';
	outsideMaskNonzero: number;
	transparentRgbMax: number;
	premultiplicationViolations: number;
	fractionalMaskSamples: number;
	terminalOccupancyError: number;
	stableHash: string;
	primaryFieldContrast: number;
	secondaryFieldContrast: number;
	secondaryContrastReview: 'passed' | 'deferred-renderer-visual';
}

function hashSamples(samples: readonly ChartPremultipliedRgba[]): string {
	const values = new Float64Array(samples.length * 4);
	for (let index = 0; index < samples.length; index += 1) {
		values.set(samples[index], index * 4);
	}
	return createHash('sha256')
		.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
		.digest('hex');
}

function matrixSize(matrix: ResolvedChartMarkFill['matrix']): number {
	return matrix === '2x2' ? 2 : matrix === '4x4' ? 4 : 8;
}

function relativeLuminance(color: readonly [number, number, number, number]): number {
	const linear = color
		.slice(0, 3)
		.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
	return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(
	a: readonly [number, number, number, number],
	b: readonly [number, number, number, number]
): number {
	const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (lighter + 0.05) / (darker + 0.05);
}

function syntheticMaskAlpha(
	mask: 'circle' | 'rectangle' | 'rounded-aa',
	localX: number,
	localY: number
): number {
	if (mask === 'rectangle')
		return localX >= 0 && localX <= 24 && localY >= 0 && localY <= 24 ? 1 : 0;
	if (mask === 'circle') {
		const dx = localX - 12;
		const dy = localY - 12;
		return dx * dx + dy * dy <= 144 ? 1 : 0;
	}
	const radius = 5;
	const offsetX = Math.abs(localX - 12) - (12 - radius);
	const offsetY = Math.abs(localY - 12) - (12 - radius);
	const outside = Math.hypot(Math.max(offsetX, 0), Math.max(offsetY, 0));
	const inside = Math.min(Math.max(offsetX, offsetY), 0);
	const signedDistance = outside + inside - radius;
	return Math.max(0, Math.min(0.5 - signedDistance, 1));
}

function runMaskProbe(input: {
	pack: string;
	role: ChartMarkFillRole;
	orientation: 'horizontal' | 'vertical';
	mask: 'circle' | 'rectangle' | 'rounded-aa';
	canvasWidth: number;
	canvasHeight: number;
	base: ResolvedChartMarkFill;
	emphasis: ResolvedChartMarkFill;
	fieldColor: readonly [number, number, number, number];
	sample: SamplerModule['sampleChartMarkFillReference'];
}): ProbeMetrics {
	const samples: ChartPremultipliedRgba[] = [];
	let outsideMaskNonzero = 0;
	let transparentRgbMax = 0;
	let premultiplicationViolations = 0;
	let fractionalMaskSamples = 0;
	for (let y = 0; y < 40; y += 1) {
		for (let x = 0; x < 40; x += 1) {
			const localX = x - 8 + 0.5;
			const localY = y - 8 + 0.5;
			const maskAlpha = syntheticMaskAlpha(input.mask, localX, localY);
			if (maskAlpha > 0 && maskAlpha < 1) fractionalMaskSamples += 1;
			const output = input.sample(input.base, input.emphasis, {
				localUv: { x: localX / 24, y: localY / 24 },
				localPx: { x: localX, y: localY },
				canvasWidth: input.canvasWidth,
				canvasHeight: input.canvasHeight,
				maskAlpha,
				terminalCoverage: 1,
				emphasisProgress: 0.375,
				seriesIndex: 2
			});
			samples.push(output);
			if (maskAlpha === 0 && output[3] !== 0) outsideMaskNonzero += 1;
			if (output[3] === 0) transparentRgbMax = Math.max(transparentRgbMax, ...output.slice(0, 3));
			if (
				output.some((channel) => !Number.isFinite(channel)) ||
				output[3] < 0 ||
				output[3] > 1 ||
				output.slice(0, 3).some((channel) => channel < 0 || channel > output[3] + 1e-9)
			) {
				premultiplicationViolations += 1;
			}
		}
	}
	const repeatedHash = hashSamples(samples);
	const repeatedSamples = samples.map((_, index) => {
		const x = index % 40;
		const y = Math.floor(index / 40);
		const localX = x - 8 + 0.5;
		const localY = y - 8 + 0.5;
		const maskAlpha = syntheticMaskAlpha(input.mask, localX, localY);
		return input.sample(input.base, input.emphasis, {
			localUv: { x: localX / 24, y: localY / 24 },
			localPx: { x: localX, y: localY },
			canvasWidth: input.canvasWidth,
			canvasHeight: input.canvasHeight,
			maskAlpha,
			terminalCoverage: 1,
			emphasisProgress: 0.375,
			seriesIndex: 2
		});
	});
	if (hashSamples(repeatedSamples) !== repeatedHash) {
		throw new Error(
			`Chart mark fill hash drifted for ${input.pack}/${input.role}/${input.orientation}.`
		);
	}
	const size = matrixSize(input.base.matrix);
	const referenceScale = Math.min(input.canvasWidth, input.canvasHeight) / 2160;
	const cellSize = input.base.cellPx * referenceScale;
	const terminalCoverage = 0.37;
	let occupied = 0;
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const output = input.sample(input.base, input.emphasis, {
				localUv: { x: (x + 0.5) / size, y: (y + 0.5) / size },
				localPx: { x: (x + 0.5) * cellSize, y: (y + 0.5) * cellSize },
				canvasWidth: input.canvasWidth,
				canvasHeight: input.canvasHeight,
				maskAlpha: 1,
				terminalCoverage,
				emphasisProgress: 0,
				seriesIndex: 0
			});
			if (output[3] > 0) occupied += 1;
		}
	}
	return {
		pack: input.pack,
		role: input.role,
		orientation: input.orientation,
		mask: input.mask,
		outsideMaskNonzero,
		transparentRgbMax,
		premultiplicationViolations,
		fractionalMaskSamples,
		terminalOccupancyError: Math.abs(occupied / (size * size) - terminalCoverage),
		stableHash: repeatedHash,
		primaryFieldContrast: contrastRatio(input.base.colorA, input.fieldColor),
		secondaryFieldContrast: contrastRatio(input.base.colorB, input.fieldColor),
		secondaryContrastReview:
			contrastRatio(input.base.colorB, input.fieldColor) >= 3
				? 'passed'
				: 'deferred-renderer-visual'
	};
}

async function main(): Promise<void> {
	let server: ViteDevServer | undefined;
	try {
		server = await createServer({
			server: { middlewareMode: true },
			appType: 'custom',
			logLevel: 'silent'
		});
		const registry = (await server.ssrLoadModule(
			'/src/lib/platform/packs/registry.ts'
		)) as RegistryModule;
		const resolver = (await server.ssrLoadModule(
			'/src/lib/platform/packs/resolve.ts'
		)) as ResolverModule;
		const sampler = (await server.ssrLoadModule(
			'/src/lib/pipelines/shader-passes/chart-mark-fill.ts'
		)) as SamplerModule;
		const colors = (await server.ssrLoadModule('/src/lib/utils/color.ts')) as ColorModule;
		const metrics: ProbeMetrics[] = [];
		for (const [pack, manifest] of Object.entries(registry.PACK_REGISTRY)) {
			const fieldRole = manifest.roles['field-treatment'];
			if (fieldRole?.kind !== 'style' || typeof fieldRole.value !== 'string') {
				throw new Error(`Pack ${pack} has no color-valued field-treatment.`);
			}
			const fieldColor = colors.cssColorToRgbaFloat(fieldRole.value);
			const emphasis = resolver.resolveChartMarkFillTreatment(manifest, 'emphasis');
			for (const role of ['default', 'series', 'emphasis'] as const) {
				const base = resolver.resolveChartMarkFillTreatment(manifest, role);
				for (const target of [
					{ orientation: 'horizontal' as const, canvasWidth: 3840, canvasHeight: 2160 },
					{ orientation: 'vertical' as const, canvasWidth: 2160, canvasHeight: 3840 }
				]) {
					if (Math.min(target.canvasWidth, target.canvasHeight) / 2160 !== 1) {
						throw new Error(`Native ${target.orientation} chart texture scale is not 1.`);
					}
					for (const mask of ['circle', 'rectangle', 'rounded-aa'] as const) {
						metrics.push(
							runMaskProbe({
								pack,
								role,
								mask,
								...target,
								base,
								emphasis,
								fieldColor,
								sample: sampler.sampleChartMarkFillReference
							})
						);
					}
				}
			}
		}
		for (const metric of metrics) {
			const size = matrixSize(
				resolver.resolveChartMarkFillTreatment(registry.PACK_REGISTRY[metric.pack], metric.role)
					.matrix
			);
			if (
				metric.outsideMaskNonzero !== 0 ||
				metric.transparentRgbMax !== 0 ||
				metric.premultiplicationViolations !== 0 ||
				(metric.mask === 'rounded-aa' && metric.fractionalMaskSamples === 0) ||
				metric.primaryFieldContrast < 3 ||
				metric.terminalOccupancyError > 1 / (size * size) + Number.EPSILON
			) {
				throw new Error(`Chart mark fill probe failed: ${JSON.stringify(metric)}`);
			}
		}
		const deferredVisualCalibrations = [
			...new Map(
				metrics
					.filter((metric) => metric.secondaryContrastReview === 'deferred-renderer-visual')
					.map((metric) => [
						`${metric.pack}:${metric.role}`,
						{
							pack: metric.pack,
							role: metric.role,
							secondaryFieldContrast: metric.secondaryFieldContrast,
							reason: 'Textured secondary endpoint requires actual-renderer Pack legibility review.'
						}
					])
			).values()
		];
		console.log(
			JSON.stringify(
				{
					probe: 'chart-mark-fill',
					status: 'passed',
					cases: metrics.length,
					deferredVisualCalibrations,
					metrics
				},
				null,
				2
			)
		);
	} finally {
		await server?.close();
	}
}

await main();
