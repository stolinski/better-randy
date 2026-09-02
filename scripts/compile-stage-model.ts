// Compile an authored part into a bundled Dimensional Stage model (ADR-0051
// phase 2, the compiled-model lane).
//
//   node --experimental-strip-types scripts/compile-stage-model.ts <slug> <part.glb>
//
// Reads one glTF binary the part's own exporter wrote (one node, one mesh, one
// triangle primitive with float positions and normals), assigns every triangle
// to the registered model's material region from its centroid, duplicates
// vertices where regions meet so the region never interpolates, and writes
// `src/lib/assets/models/<slug>.stagemesh`. It prints the facts the registry
// declares — triangle and vertex counts, bounds, the source's sha256 — so a
// mismatch is visible before the tests catch it. This is the only path that
// turns a model file into stage geometry; nothing loads a glTF at runtime.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { getStageModel } from '../src/lib/platform/stage-models.ts';
import {
	encodeStageMesh,
	STAGE_MESH_VERTEX_FLOATS
} from '../src/lib/platform/stage-mesh-format.ts';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT16 = 5123;
const COMPONENT_UINT32 = 5125;

interface GltfAccessor {
	bufferView: number;
	byteOffset?: number;
	componentType: number;
	count: number;
	type: string;
}

interface GltfBufferView {
	byteOffset?: number;
	byteLength: number;
	byteStride?: number;
}

interface GltfDocument {
	accessors: GltfAccessor[];
	bufferViews: GltfBufferView[];
	meshes: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
	nodes?: { mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
}

function usage(): never {
	throw new Error(
		'Usage: node --experimental-strip-types scripts/compile-stage-model.ts <slug> <part.glb>'
	);
}

function readGlb(bytes: Buffer): { document: GltfDocument; binary: Buffer } {
	if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new TypeError('Not a glTF binary.');
	let offset = 12;
	let document: GltfDocument | null = null;
	let binary: Buffer | null = null;
	while (offset < bytes.length) {
		const length = bytes.readUInt32LE(offset);
		const type = bytes.readUInt32LE(offset + 4);
		const chunk = bytes.subarray(offset + 8, offset + 8 + length);
		if (type === CHUNK_JSON) document = JSON.parse(chunk.toString('utf8')) as GltfDocument;
		if (type === CHUNK_BIN) binary = chunk;
		offset += 8 + length;
	}
	if (!document || !binary) throw new TypeError('glTF binary is missing its JSON or BIN chunk.');
	return { document, binary };
}

function readAccessor(
	document: GltfDocument,
	binary: Buffer,
	index: number,
	expectedType: string
): Float32Array | Uint32Array {
	const accessor = document.accessors[index];
	if (!accessor) throw new TypeError(`Accessor ${index} is missing.`);
	if (accessor.type !== expectedType) {
		throw new TypeError(`Accessor ${index} is ${accessor.type}; expected ${expectedType}.`);
	}
	const view = document.bufferViews[accessor.bufferView];
	const components = expectedType === 'VEC3' ? 3 : expectedType === 'SCALAR' ? 1 : 0;
	if (components === 0) throw new TypeError(`Accessor type ${expectedType} is not supported.`);
	const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	if (view.byteStride !== undefined && view.byteStride !== components * 4 && view.byteStride !== components * 2) {
		throw new TypeError('Interleaved buffer views are not supported.');
	}
	const count = accessor.count * components;
	if (accessor.componentType === COMPONENT_FLOAT) {
		const out = new Float32Array(count);
		for (let i = 0; i < count; i += 1) out[i] = binary.readFloatLE(start + i * 4);
		return out;
	}
	if (accessor.componentType === COMPONENT_UINT32) {
		const out = new Uint32Array(count);
		for (let i = 0; i < count; i += 1) out[i] = binary.readUInt32LE(start + i * 4);
		return out;
	}
	if (accessor.componentType === COMPONENT_UINT16) {
		const out = new Uint32Array(count);
		for (let i = 0; i < count; i += 1) out[i] = binary.readUInt16LE(start + i * 2);
		return out;
	}
	throw new TypeError(`Component type ${accessor.componentType} is not supported.`);
}

async function main(): Promise<void> {
	const [slug, partPath] = process.argv.slice(2);
	if (!slug || !partPath) usage();
	const model = getStageModel(slug);
	if (!model) throw new Error(`"${slug}" is not a registered stage model.`);
	const bytes = await readFile(resolve(partPath));
	const sha256 = createHash('sha256').update(bytes).digest('hex');
	const { document, binary } = readGlb(bytes);
	const node = document.nodes?.[0];
	if (!document.nodes || document.nodes.length !== 1 || node?.mesh !== 0) {
		throw new TypeError('The part must export exactly one node carrying mesh 0.');
	}
	if (node.matrix || node.translation || node.rotation || node.scale) {
		throw new TypeError('The part node must carry no transform; author the placement in the part.');
	}
	const primitives = document.meshes[0]?.primitives ?? [];
	if (document.meshes.length !== 1 || primitives.length !== 1) {
		throw new TypeError('The part must export one mesh with one primitive.');
	}
	const primitive = primitives[0];
	if ((primitive.mode ?? 4) !== 4) throw new TypeError('The primitive must be a triangle list.');
	if (primitive.indices === undefined) throw new TypeError('The primitive must be indexed.');
	const positions = readAccessor(document, binary, primitive.attributes.POSITION, 'VEC3');
	const normals = readAccessor(document, binary, primitive.attributes.NORMAL, 'VEC3');
	const indices = readAccessor(document, binary, primitive.indices, 'SCALAR');
	if (positions.length !== normals.length) throw new TypeError('Position and normal counts differ.');

	// Regions per triangle from the centroid; vertices split where regions meet.
	const remap = new Map<string, number>();
	const vertices: number[] = [];
	const outIndices: number[] = [];
	let regionCount = 0;
	const emit = (vertex: number, region: number): number => {
		const key = `${vertex}:${region}`;
		const existing = remap.get(key);
		if (existing !== undefined) return existing;
		const id = vertices.length / STAGE_MESH_VERTEX_FLOATS;
		vertices.push(
			positions[vertex * 3],
			positions[vertex * 3 + 1],
			positions[vertex * 3 + 2],
			normals[vertex * 3],
			normals[vertex * 3 + 1],
			normals[vertex * 3 + 2],
			region
		);
		remap.set(key, id);
		return id;
	};
	let degenerate = 0;
	for (let t = 0; t < indices.length; t += 3) {
		const a = indices[t];
		const b = indices[t + 1];
		const c = indices[t + 2];
		if (a === b || b === c || a === c) {
			degenerate += 1;
			continue;
		}
		const centroid: [number, number, number] = [
			(positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3,
			(positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3,
			(positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3
		];
		const region = model.regionOf(centroid);
		if (region < 0 || region >= model.materials.length) {
			throw new RangeError(`Region ${region} has no material on "${slug}".`);
		}
		regionCount = Math.max(regionCount, region + 1);
		outIndices.push(emit(a, region), emit(b, region), emit(c, region));
	}
	const encoded = encodeStageMesh({
		vertices: new Float32Array(vertices),
		indices: new Uint32Array(outIndices),
		regionCount
	});
	const outputPath = resolve('src/lib/assets/models', `${slug}.stagemesh`);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, encoded);

	const triangles = outIndices.length / 3;
	const vertexCount = vertices.length / STAGE_MESH_VERTEX_FLOATS;
	const bounds = [0, 1, 2].map((axis) => {
		let min = Infinity;
		let max = -Infinity;
		for (let i = axis; i < positions.length; i += 3) {
			min = Math.min(min, positions[i]);
			max = Math.max(max, positions[i]);
		}
		return `${min.toFixed(1)}..${max.toFixed(1)}`;
	});
	process.stdout.write(
		[
			`wrote ${outputPath} (${encoded.byteLength} bytes)`,
			`source sha256 ${sha256}`,
			`triangles ${triangles} (registry ${model.triangles}${degenerate ? `, ${degenerate} degenerate dropped` : ''})`,
			`vertices ${vertexCount} after region split (source ${positions.length / 3}, registry ${model.vertices})`,
			`regions ${regionCount} of ${model.materials.length} materials`,
			`bounds x ${bounds[0]} y ${bounds[1]} z ${bounds[2]} ${model.units}`,
			''
		].join('\n')
	);
	if (sha256 !== model.source.sha256) {
		process.stdout.write(`registry sha256 differs: update source.sha256 to ${sha256}\n`);
	}
}

await main();
