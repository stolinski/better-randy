import { chromium } from 'playwright';
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
interface SamplerModule {
	createChartMarkFillWgsl(): string;
	sampleChartMarkFillReference(
		base: ResolvedChartMarkFill,
		emphasis: ResolvedChartMarkFill,
		input: ChartMarkFillSampleInput
	): ChartPremultipliedRgba;
}
interface GpuProbeCase {
	name: string;
	base: ResolvedChartMarkFill;
	emphasis: ResolvedChartMarkFill;
	input: ChartMarkFillSampleInput;
}

function wgslFloat(value: number): string {
	const rounded = Math.fround(value);
	if (!Number.isFinite(rounded)) throw new RangeError(`wgslFloat cannot encode ${value}.`);
	if (Object.is(rounded, -0) || rounded === 0) return '0.0';
	const text = String(rounded);
	return /[.eE]/.test(text) ? text : `${text}.0`;
}

function wgslVec(values: readonly number[]): string {
	return `vec${values.length}f(${values.map(wgslFloat).join(', ')})`;
}

function caseExpression(probeCase: GpuProbeCase, index: number): string {
	const { input } = probeCase;
	return `resolveChartMarkFillSample(
		${[
			`packed[${index}u].baseMode`,
			`packed[${index}u].baseColorA`,
			`packed[${index}u].baseColorB`,
			`packed[${index}u].baseGradientAxis`,
			`packed[${index}u].baseMatrixBits`,
			`packed[${index}u].baseCellPx`,
			`packed[${index}u].emphasisMode`,
			`packed[${index}u].emphasisColorA`,
			`packed[${index}u].emphasisColorB`,
			`packed[${index}u].emphasisGradientAxis`,
			`packed[${index}u].emphasisMatrixBits`,
			`packed[${index}u].emphasisCellPx`,
			wgslVec([input.localUv.x, input.localUv.y]),
			wgslVec([input.localPx.x, input.localPx.y]),
			`packed[${index}u].canvasSize`,
			`${input.seriesIndex}u`,
			wgslFloat(input.maskAlpha),
			wgslFloat(input.terminalCoverage),
			wgslFloat(input.emphasisProgress)
		].join(',\n\t\t')}
	)`;
}

function syntheticTreatment(
	mode: ResolvedChartMarkFill['mode'],
	overrides: Partial<ResolvedChartMarkFill> = {}
): ResolvedChartMarkFill {
	return {
		mode,
		colorA: [1, 0.2, 0.1, 0.75],
		colorB: [0.1, 0.8, 1, 0.4],
		gradientAxis: 'inline',
		matrix: '4x4',
		cellPx: 8,
		...overrides
	};
}

function commonInput(overrides: Partial<ChartMarkFillSampleInput> = {}): ChartMarkFillSampleInput {
	return {
		localUv: { x: 0.31, y: 0.67 },
		localPx: { x: 19.5, y: 27.25 },
		canvasWidth: 3840,
		canvasHeight: 2160,
		maskAlpha: 0.625,
		terminalCoverage: 0.63,
		emphasisProgress: 0.37,
		seriesIndex: 2,
		...overrides
	};
}

function buildCases(registry: RegistryModule, resolver: ResolverModule): GpuProbeCase[] {
	const cases: GpuProbeCase[] = [];
	for (const [pack, manifest] of Object.entries(registry.PACK_REGISTRY)) {
		const emphasis = resolver.resolveChartMarkFillTreatment(manifest, 'emphasis');
		for (const [roleIndex, role] of (['default', 'series', 'emphasis'] as const).entries()) {
			const base = resolver.resolveChartMarkFillTreatment(manifest, role);
			for (const [targetIndex, target] of [
				{ name: 'horizontal', canvasWidth: 3840, canvasHeight: 2160 },
				{ name: 'vertical', canvasWidth: 2160, canvasHeight: 3840 }
			].entries()) {
				cases.push({
					name: `${pack}/${role}/${target.name}`,
					base,
					emphasis,
					input: commonInput({
						canvasWidth: target.canvasWidth,
						canvasHeight: target.canvasHeight,
						seriesIndex: roleIndex + targetIndex * 3
					})
				});
			}
		}
	}
	for (const [seriesIndex, matrix] of (['2x2', '4x4', '8x8'] as const).entries()) {
		cases.push({
			name: `synthetic/dither/${matrix}`,
			base: syntheticTreatment('ordered-dither', { matrix }),
			emphasis: syntheticTreatment('solid'),
			input: commonInput({ seriesIndex })
		});
	}
	cases.push(
		{
			name: 'synthetic/gradient/block',
			base: syntheticTreatment('gradient', { gradientAxis: 'block' }),
			emphasis: syntheticTreatment('gradient'),
			input: commonInput({ terminalCoverage: 1 })
		},
		{
			name: 'synthetic/mask-zero',
			base: syntheticTreatment('ordered-dither'),
			emphasis: syntheticTreatment('gradient'),
			input: commonInput({ maskAlpha: 0, terminalCoverage: 1 })
		},
		{
			name: 'synthetic/terminal-zero',
			base: syntheticTreatment('solid'),
			emphasis: syntheticTreatment('solid'),
			input: commonInput({ terminalCoverage: 0, emphasisProgress: 1 })
		},
		{
			name: 'synthetic/emphasis-start',
			base: syntheticTreatment('solid'),
			emphasis: syntheticTreatment('gradient'),
			input: commonInput({ emphasisProgress: 0, terminalCoverage: 1 })
		},
		{
			name: 'synthetic/emphasis-end',
			base: syntheticTreatment('solid'),
			emphasis: syntheticTreatment('gradient'),
			input: commonInput({ emphasisProgress: 1, terminalCoverage: 1 })
		},
		{
			name: 'synthetic/non-unit-scale',
			base: syntheticTreatment('ordered-dither'),
			emphasis: syntheticTreatment('ordered-dither', { matrix: '8x8' }),
			input: commonInput({ canvasWidth: 1920, canvasHeight: 1080 })
		}
	);
	return cases;
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
		const cases = buildCases(registry, resolver);
		const assignments = cases
			.map(
				(probeCase, index) =>
					`case ${index}u: { output.values[${index}u] = ${caseExpression(probeCase, index)}; }`
			)
			.join('\n');

		const code = `${sampler.createChartMarkFillWgsl()}
struct ChartMarkFillPacked {
	baseColorA: vec4f,
	baseColorB: vec4f,
	emphasisColorA: vec4f,
	emphasisColorB: vec4f,
	canvasSize: vec2f,
	baseMode: u32,
	baseGradientAxis: u32,
	baseMatrixBits: u32,
	baseCellPx: f32,
	emphasisMode: u32,
	emphasisGradientAxis: u32,
	emphasisMatrixBits: u32,
	emphasisCellPx: f32,
}
struct ChartMarkFillProbeOutput { values: array<vec4f, ${cases.length}> }
@group(0) @binding(0) var<storage, read> packed: array<ChartMarkFillPacked, ${cases.length}>;
@group(0) @binding(1) var<storage, read_write> output: ChartMarkFillProbeOutput;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3u) {
	switch id.x {
${assignments}
		default: {}
	}
}`;
		const expected = cases.map((probeCase) =>
			sampler.sampleChartMarkFillReference(probeCase.base, probeCase.emphasis, probeCase.input)
		);
		const packingInputs = cases.map((probeCase) => ({
			base: probeCase.base,
			emphasis: probeCase.emphasis,
			canvasWidth: probeCase.input.canvasWidth,
			canvasHeight: probeCase.input.canvasHeight
		}));
		const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
		try {
			const context = browser.contexts()[0];
			const page = context.pages()[0] ?? (await context.newPage());
			await page.goto('http://localhost:7263', { waitUntil: 'domcontentloaded', timeout: 30_000 });
			const result = await page.evaluate(
				async ({ shaderCode, caseCount, packingInputs }) => {
					if (!navigator.gpu) throw new Error('Chart mark fill GPU probe requires navigator.gpu.');
					const adapter = await navigator.gpu.requestAdapter();
					if (!adapter) throw new Error('Chart mark fill GPU probe found no WebGPU adapter.');
					const device = await adapter.requestDevice();
					const module = device.createShaderModule({ code: shaderCode });
					const info = await module.getCompilationInfo();
					const errors = info.messages
						.filter((message) => message.type === 'error')
						.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
					if (errors.length > 0) return { errors, values: [] as number[][] };
					const pipeline = await device.createComputePipelineAsync({
						layout: 'auto',
						compute: { module, entryPoint: 'main' }
					});
					const byteLength = caseCount * 16;
					const { createChartMarkFillGpuProbeBuffer } =
						await import('/src/lib/pipelines/shader-passes/chart-mark-fill-gpu-probe-buffer.ts');
					const packed = createChartMarkFillGpuProbeBuffer(device, packingInputs);
					const output = device.createBuffer({ size: byteLength, usage: 0x80 | 0x04 });
					const readback = device.createBuffer({ size: byteLength, usage: 0x01 | 0x08 });
					const bindGroup = device.createBindGroup({
						layout: pipeline.getBindGroupLayout(0),
						entries: [
							{ binding: 0, resource: { buffer: packed.buffer } },
							{ binding: 1, resource: { buffer: output } }
						]
					});
					const encoder = device.createCommandEncoder();
					const pass = encoder.beginComputePass();
					pass.setPipeline(pipeline);
					pass.setBindGroup(0, bindGroup);
					pass.dispatchWorkgroups(caseCount);
					pass.end();
					encoder.copyBufferToBuffer(output, 0, readback, 0, byteLength);
					device.queue.submit([encoder.finish()]);
					await readback.mapAsync(0x01);
					const floats = new Float32Array(readback.getMappedRange().slice(0));
					const values = Array.from({ length: caseCount }, (_, index) =>
						Array.from(floats.slice(index * 4, index * 4 + 4))
					);
					readback.unmap();
					packed.destroy();
					output.destroy();
					readback.destroy();
					device.destroy();
					return { errors, values };
				},
				{ shaderCode: code, caseCount: cases.length, packingInputs }
			);
			if (result.errors.length > 0) {
				throw new Error(`Chart mark fill WGSL compilation failed:
${result.errors.join('\n')}`);
			}
			let maximumError = 0;
			for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
				for (let channel = 0; channel < 4; channel += 1) {
					maximumError = Math.max(
						maximumError,
						Math.abs(result.values[caseIndex][channel] - expected[caseIndex][channel])
					);
				}
				if (
					cases[caseIndex].input.maskAlpha === 0 &&
					result.values[caseIndex].some((value) => value !== 0)
				) {
					throw new Error(`Chart mark fill GPU mask leak in ${cases[caseIndex].name}.`);
				}
			}
			if (maximumError > 1e-5) {
				throw new Error(`Chart mark fill GPU/CPU parity error ${maximumError} exceeds 1e-5.`);
			}
			console.log(
				JSON.stringify(
					{
						probe: 'chart-mark-fill-gpu',
						status: 'passed',
						cases: cases.length,
						seriesPhases: [...new Set(cases.map((probeCase) => probeCase.input.seriesIndex))],
						maximumError
					},
					null,
					2
				)
			);
		} finally {
			await browser.close();
		}
	} finally {
		await server?.close();
	}
}

await main();
