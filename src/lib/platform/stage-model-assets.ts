import crtFw900Url from '$lib/assets/models/crt-fw900.stagemesh?url';

import { decodeStageMesh, type StageMeshData } from './stage-mesh-format';
import { getStageModel } from './stage-models';

// The bundled bytes of every registered stage model (ADR-0051 phase 2), the
// same discipline as `substrate-textures.ts` and `capture-assets.ts`: Vite-
// imported so the mesh ships in the build and decodes identically in preview
// and export, with no network or cache variance. The registry in
// `stage-models.ts` names the model; this file is the only place that knows
// where its bytes live.

const STAGE_MODEL_URLS: Record<string, string> = {
	'crt-fw900': crtFw900Url
};

// Decode is async and memoised per slug so each model is fetched once.
const meshCache = new Map<string, Promise<StageMeshData>>();

/** Fetch and decode a registered model's bundled mesh; null for an unknown slug. */
export function loadStageModelMesh(slug: string): Promise<StageMeshData> | null {
	if (typeof window === 'undefined') return null;
	const url = STAGE_MODEL_URLS[slug];
	const model = getStageModel(slug);
	if (!url || !model) return null;
	let pending = meshCache.get(slug);
	if (!pending) {
		pending = fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`Stage model "${slug}" failed to load (${response.status}).`);
				}
				return response.arrayBuffer();
			})
			.then((buffer) => {
				const mesh = decodeStageMesh(buffer);
				if (mesh.indexCount !== model.triangles * 3 || mesh.vertexCount !== model.vertices) {
					throw new Error(
						`Stage model "${slug}" bytes do not match the registry: ${mesh.indexCount / 3} triangles, ${mesh.vertexCount} vertices.`
					);
				}
				if (mesh.regionCount > model.materials.length) {
					throw new Error(
						`Stage model "${slug}" references ${mesh.regionCount} regions; the registry names ${model.materials.length} materials.`
					);
				}
				return mesh;
			})
			.catch((error: unknown) => {
				meshCache.delete(slug);
				throw error;
			});
		meshCache.set(slug, pending);
	}
	return pending;
}
