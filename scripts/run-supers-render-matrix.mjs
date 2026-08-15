import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

import { classifyProbeOutputClass } from './_probe-output-class.ts';
import {
	buildSupersRenderMatrixCellVerdict,
	createSupersEdgeAliasingProbeCandidate,
	createSupersShadowBandingProbeCandidate,
	createSupersTextEdgeProbeCandidate,
	groupSupersRenderMatrixCoordinates,
	runBoundedSupersRenderMatrixFanout,
	SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES,
	verifySupersRenderEvidenceIndex
} from './supers-render-matrix-runner.ts';

const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE_URL = process.env.SUPERS_BASE_URL ?? 'http://localhost:7263';
const WAIT_MS = Number(process.env.SUPERS_RENDER_MATRIX_WAIT_MS ?? 60_000);
const REQUIRED_CODES = SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES;

function hash(value) {
	const canonical = (entry) =>
		Array.isArray(entry)
			? entry.map(canonical)
			: entry && typeof entry === 'object'
				? Object.fromEntries(
						Object.entries(entry)
							.filter(([, child]) => child !== undefined)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([key, child]) => [key, canonical(child)])
					)
				: entry;
	return createHash('sha256')
		.update(JSON.stringify(canonical(value)))
		.digest('hex');
}

function decodeDataUrl(value) {
	const separator = value.indexOf(',');
	if (separator < 0) throw new Error('Malformed PNG data URL');
	return Buffer.from(value.slice(separator + 1), 'base64');
}

async function sourceIdentity(expectedRevision, expectedFingerprint) {
	const response = await fetch(`${BASE_URL}/api/verification/source-identity`);
	if (!response.ok) throw new Error(`Served source identity unavailable (${response.status})`);
	const identity = await response.json();
	if (
		identity.sourceRevision !== expectedRevision ||
		identity.treeFingerprint !== expectedFingerprint
	) {
		throw new Error('Served source identity does not match the requested checkout');
	}
	return identity;
}

async function openPage(slug) {
	const response = await fetch(
		`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`Could not create CDP target (${response.status})`);
	const target = await response.json();
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolveSocket, reject) => {
		socket.onopen = resolveSocket;
		socket.onerror = reject;
	});
	let nextId = 1;
	const pending = new Map();
	socket.onmessage = (event) => {
		const message = JSON.parse(event.data);
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		if (message.error) request.reject(new Error(message.error.message));
		else request.resolve(message.result);
	};
	const send = (method, params = {}) =>
		new Promise((resolveRequest, reject) => {
			const id = nextId++;
			pending.set(id, { resolve: resolveRequest, reject });
			socket.send(JSON.stringify({ id, method, params }));
		});
	await Promise.all([send('Page.enable'), send('Runtime.enable')]);
	await send('Page.navigate', { url: `${BASE_URL}/p/${encodeURIComponent(slug)}?source=builtin` });
	const deadline = Date.now() + WAIT_MS;
	while (Date.now() < deadline) {
		const ready = await send('Runtime.evaluate', {
			expression: `document.readyState === 'complete' && typeof window.__configureSupersDeterministicRenderCell === 'function' && typeof window.__captureSupersDeterministicRenderRegionManifest === 'function'`,
			returnByValue: true
		});
		if (ready.result?.value === true) return { socket, send };
		await new Promise((settle) => setTimeout(settle, 200));
	}
	throw new Error(`${slug}: deterministic render seams did not become ready`);
}

async function evaluate(send, expression) {
	const response = await send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true
	});
	if (response.exceptionDetails)
		throw new Error(response.exceptionDetails.exception?.description ?? 'CDP evaluation failed');
	return response.result.value;
}

async function canvasPng(send) {
	return decodeDataUrl(
		await evaluate(
			send,
			`(async()=>{const c=document.querySelector('canvas');if(!c)throw new Error('canvas unavailable');const b=await new Promise(r=>c.toBlob(r,'image/png'));if(!b)throw new Error('png unavailable');return await new Promise((r,j)=>{const f=new FileReader();f.onerror=()=>j(f.error);f.onload=()=>r(f.result);f.readAsDataURL(b)})})()`
		)
	);
}

function evidenceReference(path, bytes, kind = 'probe', region = null) {
	return { kind, path, sha256: createHash('sha256').update(bytes).digest('hex'), region };
}

function unavailableChecks(evidence, reason = 'capture-failed') {
	return REQUIRED_CODES.map((code) => ({
		checkId: code,
		code,
		outcome: 'unavailable',
		unavailableReason: reason,
		evidence: [evidence]
	}));
}

function runJsonProbe(script, args) {
	const result = spawnSync('node', ['--experimental-strip-types', script, ...args], {
		encoding: 'utf8'
	});
	if (result.status !== 0 && result.status !== 1)
		throw new Error(`${script} probe failed: ${result.stderr || result.stdout}`);
	const parsed = JSON.parse(result.stdout.trim());
	return { parsed, bytes: Buffer.from(JSON.stringify(parsed)) };
}

function regionArgument(region) {
	return `${region.x},${region.y},${region.width},${region.height}`;
}

function evidenceRegion(region) {
	return {
		x: Math.max(0, Math.floor(region.x)),
		y: Math.max(0, Math.floor(region.y)),
		width: Math.max(1, Math.ceil(region.width)),
		height: Math.max(1, Math.ceil(region.height))
	};
}

function maximumGeometryDelta(frames, candidateIds) {
	if (frames.length < 2 || candidateIds.length === 0) return null;
	let maximum = 0;
	for (const candidateId of candidateIds) {
		const rects = frames.map((frame) => frame.elements[candidateId]);
		if (rects.some((rect) => !rect)) return null;
		const first = rects[0];
		for (const rect of rects.slice(1)) {
			maximum = Math.max(
				maximum,
				Math.abs(rect.x - first.x),
				Math.abs(rect.y - first.y),
				Math.abs(rect.width - first.width),
				Math.abs(rect.height - first.height)
			);
		}
	}
	return maximum;
}

function measurementCandidate(code, measurement, evidence) {
	return { code, measurement, evidence: Array.isArray(evidence) ? evidence : [evidence] };
}

function unavailableCandidate(code, unavailableReason, evidence) {
	return {
		code,
		outcome: 'unavailable',
		unavailableReason,
		evidence: Array.isArray(evidence) ? evidence : [evidence]
	};
}

function notApplicableCandidate(code, reason, evidence, extra = {}) {
	return {
		code,
		outcome: 'not-applicable',
		reason,
		evidence: Array.isArray(evidence) ? evidence : [evidence],
		...extra
	};
}

async function main() {
	const [manifestPath, snapshotPath, outputPath] = process.argv.slice(2);
	if (!manifestPath || !snapshotPath || !outputPath)
		throw new Error(
			'usage: run-supers-render-matrix.mjs <manifest.json> <snapshot.json> <output.json>'
		);
	const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
	const snapshot = JSON.parse(await readFile(resolve(snapshotPath), 'utf8'));
	const launch = spawnSync('bash', ['scripts/launch-cdp-chrome.sh'], { encoding: 'utf8' });
	if (launch.status !== 0)
		throw new Error(`Sanctioned CDP Chrome unavailable: ${launch.stderr || launch.stdout}`);
	const servedBefore = await sourceIdentity(manifest.sourceRevision, manifest.engineFingerprint);
	const evidenceRoot = resolve(
		dirname(outputPath),
		'render-matrix-evidence',
		manifest.manifestDigest
	);
	await mkdir(evidenceRoot, { recursive: true });
	const groups = groupSupersRenderMatrixCoordinates(manifest.coordinates);
	const results = await runBoundedSupersRenderMatrixFanout({
		groups,
		executeGroup: async (group) => {
			const startedAt = new Date().toISOString();
			await sourceIdentity(manifest.sourceRevision, manifest.engineFingerprint);
			const { socket, send } = await openPage(group.presetSlug);
			const cells = [];
			const evidence = [];
			try {
				const runtime = await evaluate(send, 'window.__readSupersRuntimeRenderRegistryIdentity()');
				const expectedRuntime = {
					deliverablePresets: snapshot.deliverablePresets.map((entry) => ({
						id: entry.slug,
						fingerprint: entry.presetFingerprint
					})),
					packs: snapshot.packs.map((entry) => ({
						id: entry.id,
						fingerprint: entry.packFingerprint
					}))
				};
				if (
					JSON.stringify(runtime.deliverablePresets) !==
						JSON.stringify(expectedRuntime.deliverablePresets) ||
					JSON.stringify(runtime.packs) !== JSON.stringify(expectedRuntime.packs)
				) {
					throw new Error('Browser runtime registry identity differs from the immutable snapshot');
				}
				for (const coordinate of group.coordinates) {
					const configuration = await evaluate(
						send,
						`window.__configureSupersDeterministicRenderCell(${JSON.stringify({ presetSlug: coordinate.presetSlug, packId: coordinate.packId, orientation: coordinate.orientation })})`
					);
					if (
						configuration.width !== coordinate.width ||
						configuration.height !== coordinate.height ||
						configuration.frameRate.num !== coordinate.frameRate.num ||
						configuration.frameRate.den !== coordinate.frameRate.den
					)
						throw new Error(`${coordinate.cellId}: configured identity mismatch`);
					const directory = resolve(evidenceRoot, coordinate.cellId);
					await mkdir(directory, { recursive: true });
					const logicalBase = `render-matrix-evidence/${manifest.manifestDigest}/${coordinate.cellId}`;
					const registerEvidence = (reference, bytes) => {
						evidence.push({ path: reference.path, sha256: reference.sha256, bytes: bytes.length });
						return reference;
					};
					const captureFrame = async (frameIndex) => {
						const address = {
							frameIndex,
							timestampMicroseconds: Math.round(
								(frameIndex * coordinate.frameRate.den * 1_000_000) / coordinate.frameRate.num
							)
						};
						const request = { address, frameRate: coordinate.frameRate };
						const frameManifest = await evaluate(
							send,
							`window.__captureSupersDeterministicRenderRegionManifest(${JSON.stringify(request)})`
						);
						const png = await canvasPng(send);
						const geometry = await evaluate(
							send,
							`window.__captureSupersDeterministicFrameGeometry(${JSON.stringify(coordinate.sample.stableGeometryCandidateIds)})`
						);
						return { address, manifest: frameManifest, png, geometry };
					};

					const primary = await captureFrame(coordinate.sample.frameIndex);
					const readableArtifacts = new Map();
					for (const readable of primary.manifest.readableIdentityEvidence) {
						const dataUrls = await evaluate(
							send,
							`window.__captureSupersDeterministicReadablePngArtifacts(${JSON.stringify(readable.id)})`
						);
						if (dataUrls) readableArtifacts.set(readable.id, dataUrls);
					}
					const replay = await captureFrame(coordinate.sample.frameIndex);
					const auxiliaryFrames = [];
					for (const frameIndex of coordinate.sample.auxiliaryFrameIndices) {
						auxiliaryFrames.push(await captureFrame(frameIndex));
					}

					const runtimeBytes = Buffer.from(JSON.stringify(primary.manifest));
					const canonicalPath = resolve(directory, 'canonical.png');
					const replayPath = resolve(directory, 'replay.png');
					const primaryGeometryBytes = Buffer.from(
						JSON.stringify({ address: primary.address, ...primary.geometry })
					);
					const replayGeometryBytes = Buffer.from(
						JSON.stringify({ address: replay.address, ...replay.geometry })
					);
					await Promise.all([
						writeFile(canonicalPath, primary.png),
						writeFile(replayPath, replay.png),
						writeFile(resolve(directory, 'runtime-manifest.json'), runtimeBytes),
						writeFile(resolve(directory, 'canonical-geometry.json'), primaryGeometryBytes),
						writeFile(resolve(directory, 'replay-geometry.json'), replayGeometryBytes)
					]);
					const runtimeEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/runtime-manifest.json`, runtimeBytes, 'dom'),
						runtimeBytes
					);
					const canonicalEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/canonical.png`, primary.png, 'capture'),
						primary.png
					);
					const replayEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/replay.png`, replay.png, 'capture'),
						replay.png
					);
					const primaryGeometryEvidence = registerEvidence(
						evidenceReference(
							`${logicalBase}/canonical-geometry.json`,
							primaryGeometryBytes,
							'dom'
						),
						primaryGeometryBytes
					);
					const replayGeometryEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/replay-geometry.json`, replayGeometryBytes, 'dom'),
						replayGeometryBytes
					);

					const auxiliaryEvidence = [];
					const auxiliaryGeometryEvidence = [];
					for (const [index, frame] of auxiliaryFrames.entries()) {
						const prefix = `auxiliary-${String(index).padStart(2, '0')}-frame-${frame.address.frameIndex}`;
						const pngPath = resolve(directory, `${prefix}.png`);
						const geometryBytes = Buffer.from(
							JSON.stringify({ address: frame.address, ...frame.geometry })
						);
						await Promise.all([
							writeFile(pngPath, frame.png),
							writeFile(resolve(directory, `${prefix}-geometry.json`), geometryBytes)
						]);
						auxiliaryEvidence.push(
							registerEvidence(
								evidenceReference(`${logicalBase}/${prefix}.png`, frame.png, 'capture'),
								frame.png
							)
						);
						auxiliaryGeometryEvidence.push(
							registerEvidence(
								evidenceReference(`${logicalBase}/${prefix}-geometry.json`, geometryBytes, 'dom'),
								geometryBytes
							)
						);
					}

					const dimensionProbe = runJsonProbe('scripts/probe-dimensions.ts', [canonicalPath]);
					const replayProbe = runJsonProbe('scripts/probe-render-replay.ts', [
						canonicalPath,
						replayPath,
						'--frame',
						String(coordinate.sample.frameIndex),
						'--timestamp-us',
						String(coordinate.sample.timestampMicroseconds)
					]);
					await Promise.all([
						writeFile(resolve(directory, 'probe-dimensions.json'), dimensionProbe.bytes),
						writeFile(resolve(directory, 'probe-replay.json'), replayProbe.bytes)
					]);
					const dimensionEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/probe-dimensions.json`, dimensionProbe.bytes),
						dimensionProbe.bytes
					);
					const replayProbeEvidence = registerEvidence(
						evidenceReference(`${logicalBase}/probe-replay.json`, replayProbe.bytes),
						replayProbe.bytes
					);
					const candidates = [
						measurementCandidate(
							'target-resolution-mismatch',
							{
								actualWidth: dimensionProbe.parsed.width,
								actualHeight: dimensionProbe.parsed.height,
								activeFrameRate: primary.manifest.activeFrameRate
							},
							[canonicalEvidence, dimensionEvidence]
						),
						measurementCandidate(
							'font-not-ready',
							{ pendingFontCount: primary.manifest.pendingFontCount },
							runtimeEvidence
						),
						measurementCandidate(
							'output-class-mismatch',
							{
								expectedClass: configuration.expectedOutputClass,
								actualClass: classifyProbeOutputClass(PNG.sync.read(primary.png))
							},
							canonicalEvidence
						),
						measurementCandidate(
							'nondeterministic-replay',
							{ changedPixelRatio: replayProbe.parsed.changedPixelRatio },
							[canonicalEvidence, replayEvidence, replayProbeEvidence]
						)
					];

					const coverage = primary.manifest.readableCoverage;
					const coverageComplete = coverage.authority === 'schema-renderer' && coverage.complete;
					const expectedReadableIds = coverage.expectedReadableIdentities;
					if (!coverageComplete) {
						for (const code of [
							'title-safe-violation',
							'vertical-platform-safe-area-violation',
							'readable-content-clipped',
							'readable-content-occluded',
							'readable-content-coverage',
							'contrast-below-floor',
							'cap-height-below-floor',
							'text-edge-softness'
						]) {
							candidates.push(
								unavailableCandidate(code, 'incomplete-readable-coverage', runtimeEvidence)
							);
						}
					} else {
						candidates.push(
							measurementCandidate(
								'readable-content-coverage',
								{
									expectedReadableIdentities: expectedReadableIds,
									discoveredReadableIdentities: coverage.discoveredReadableIdentities
								},
								runtimeEvidence
							),
							measurementCandidate(
								'title-safe-violation',
								{ affectedPixelCount: primary.manifest.measurements.titleSafeAreaAffectedPixels },
								runtimeEvidence
							),
							measurementCandidate(
								'vertical-platform-safe-area-violation',
								{
									affectedPixelCount:
										primary.manifest.measurements.verticalPlatformSafeAreaAffectedPixels
								},
								runtimeEvidence
							)
						);
						if (expectedReadableIds.length === 0) {
							for (const code of [
								'readable-content-clipped',
								'readable-content-occluded',
								'contrast-below-floor',
								'cap-height-below-floor',
								'text-edge-softness'
							]) {
								candidates.push(notApplicableCandidate(code, 'no-text', runtimeEvidence));
							}
						} else {
							const readableEvidence = primary.manifest.readableIdentityEvidence;
							candidates.push(
								measurementCandidate(
									'readable-content-clipped',
									{
										measurements: readableEvidence.map((entry) => ({
											readableId: entry.id,
											affectedPixelCount: entry.clippedPixelCount
										}))
									},
									runtimeEvidence
								),
								measurementCandidate(
									'cap-height-below-floor',
									{
										measurements: readableEvidence.map((entry) => ({
											readableId: entry.id,
											measuredPixels: entry.textMeasurement.measuredCapHeightPixels,
											textRole: entry.textMeasurement.textRole,
											orientation: coordinate.orientation
										}))
									},
									runtimeEvidence
								)
							);

							const occlusionMeasurements = [];
							const contrastMeasurements = [];
							const maskEvidence = [];
							let missingOcclusionMask = false;
							let missingContrastMask = false;
							for (const entry of readableEvidence) {
								const capture = entry.capture;
								const artifacts = readableArtifacts.get(entry.id);
								if (!capture || !artifacts) {
									missingOcclusionMask = true;
									missingContrastMask = true;
									continue;
								}
								const readableKey = hash(entry.id).slice(0, 16);
								const background = decodeDataUrl(artifacts.backgroundPng);
								const treatment = decodeDataUrl(artifacts.treatmentPng);
								const mask = decodeDataUrl(artifacts.authoritativeMaskPng);
								const captureBinding = {
									schemaVersion: 1,
									...capture.binding,
									backgroundSha256: capture.backgroundSha256,
									treatmentSha256: capture.treatmentSha256,
									authoritativeMaskSha256: capture.authoritativeMaskSha256
								};
								const bindingBytes = Buffer.from(JSON.stringify(captureBinding));
								const files = {
									background: resolve(directory, `readable-${readableKey}-background.png`),
									treatment: resolve(directory, `readable-${readableKey}-treatment.png`),
									mask: resolve(directory, `readable-${readableKey}-mask.png`),
									binding: resolve(directory, `readable-${readableKey}-binding.json`)
								};
								await Promise.all([
									writeFile(files.background, background),
									writeFile(files.treatment, treatment),
									writeFile(files.mask, mask),
									writeFile(files.binding, bindingBytes)
								]);
								const region = evidenceRegion(entry.region.rect);
								for (const [name, bytes, kind] of [
									['background.png', background, 'capture'],
									['treatment.png', treatment, 'capture'],
									['mask.png', mask, 'capture'],
									['binding.json', bindingBytes, 'dom']
								]) {
									maskEvidence.push(
										registerEvidence(
											evidenceReference(
												`${logicalBase}/readable-${readableKey}-${name}`,
												bytes,
												kind,
												region
											),
											bytes
										)
									);
								}
								occlusionMeasurements.push({
									readableId: entry.id,
									affectedPixelCount:
										capture.expectedTreatmentPixelCount - capture.visibleTreatmentPixelCount,
									expectedTreatmentPixelCount: capture.expectedTreatmentPixelCount,
									visibleTreatmentPixelCount: capture.visibleTreatmentPixelCount,
									capture: captureBinding
								});
								try {
									const contrastProbe = runJsonProbe('scripts/probe-local-contrast.ts', [
										files.background,
										'--treatment',
										files.treatment,
										'--mask',
										files.mask,
										'--binding',
										files.binding,
										'--region',
										regionArgument(entry.region.rect),
										'--class',
										entry.textMeasurement.textClass
									]);
									await writeFile(
										resolve(directory, `readable-${readableKey}-contrast.json`),
										contrastProbe.bytes
									);
									maskEvidence.push(
										registerEvidence(
											evidenceReference(
												`${logicalBase}/readable-${readableKey}-contrast.json`,
												contrastProbe.bytes,
												'probe',
												region
											),
											contrastProbe.bytes
										)
									);
									contrastMeasurements.push({
										readableId: entry.id,
										measuredRatio: contrastProbe.parsed.measured_ratio,
										textClass: entry.textMeasurement.textClass,
										treatmentSampleCount: contrastProbe.parsed.treatment_sample_count,
										capture: captureBinding
									});
								} catch {
									missingContrastMask = true;
								}
							}
							candidates.push(
								missingOcclusionMask
									? unavailableCandidate(
											'readable-content-occluded',
											'composited-mask-unavailable',
											[runtimeEvidence, ...maskEvidence]
										)
									: measurementCandidate(
											'readable-content-occluded',
											{ measurements: occlusionMeasurements },
											[runtimeEvidence, ...maskEvidence]
										),
								missingContrastMask
									? unavailableCandidate('contrast-below-floor', 'contrast-mask-unavailable', [
											runtimeEvidence,
											...maskEvidence
										])
									: measurementCandidate(
											'contrast-below-floor',
											{ measurements: contrastMeasurements },
											[runtimeEvidence, ...maskEvidence]
										)
							);

							const textRegion = primary.manifest.selectedProbeRegions.text;
							if (!textRegion) {
								candidates.push(
									unavailableCandidate('text-edge-softness', 'authority-missing', runtimeEvidence)
								);
							} else {
								try {
									const probe = runJsonProbe('scripts/probe-text-edge.ts', [
										canonicalPath,
										'--region',
										regionArgument(textRegion.rect)
									]);
									await writeFile(resolve(directory, 'probe-text-edge.json'), probe.bytes);
									const reference = registerEvidence(
										evidenceReference(
											`${logicalBase}/probe-text-edge.json`,
											probe.bytes,
											'probe',
											evidenceRegion(textRegion.rect)
										),
										probe.bytes
									);
									candidates.push(
										createSupersTextEdgeProbeCandidate(probe.parsed, [canonicalEvidence, reference])
									);
								} catch {
									candidates.push(
										unavailableCandidate('text-edge-softness', 'probe-failed', canonicalEvidence)
									);
								}
							}
						}
					}

					const shadowRegions = primary.manifest.probeRegions
						.filter((region) => region.kind === 'shadow')
						.sort((left, right) => left.id.localeCompare(right.id));
					if (primary.manifest.shadowCoverage.authority !== 'renderer-owner') {
						candidates.push(
							unavailableCandidate('shadow-banding', 'authority-missing', runtimeEvidence)
						);
					} else if (shadowRegions.length === 0) {
						candidates.push(notApplicableCandidate('shadow-banding', 'no-shadow', runtimeEvidence));
					} else {
						const shadowProbes = [];
						const references = [canonicalEvidence];
						let failed = false;
						for (const [index, region] of shadowRegions.entries()) {
							try {
								const args = [canonicalPath, '--region', regionArgument(region.rect)];
								if (region.excludedRect) {
									args.push('--exclude-region', regionArgument(region.excludedRect));
								}
								const probe = runJsonProbe('scripts/probe-banding.ts', args);
								const filename = `probe-shadow-${String(index).padStart(2, '0')}.json`;
								await writeFile(resolve(directory, filename), probe.bytes);
								references.push(
									registerEvidence(
										evidenceReference(
											`${logicalBase}/${filename}`,
											probe.bytes,
											'probe',
											evidenceRegion(region.rect)
										),
										probe.bytes
									)
								);
								shadowProbes.push({ shadowId: region.id, ...probe.parsed });
							} catch {
								failed = true;
							}
						}
						candidates.push(
							failed
								? unavailableCandidate('shadow-banding', 'probe-failed', references)
								: createSupersShadowBandingProbeCandidate(
										primary.manifest.shadowCoverage.ownedShadowIds,
										shadowProbes,
										references
									)
						);
					}

					for (const [code, kind, script, mapMeasurement, reason] of [
						[
							'tonal-banding',
							'tonal',
							'scripts/probe-banding.ts',
							(parsed) => ({ bandCount: parsed.band_count }),
							'no-tonal-region'
						],
						[
							'edge-aliasing',
							'non-axis-edge',
							'scripts/probe-edge-aa.ts',
							createSupersEdgeAliasingProbeCandidate,
							'no-non-axis-edge'
						]
					]) {
						const region = primary.manifest.selectedProbeRegions[kind];
						if (!region) {
							candidates.push(notApplicableCandidate(code, reason, runtimeEvidence));
							continue;
						}
						try {
							const probe = runJsonProbe(script, [
								canonicalPath,
								'--region',
								regionArgument(region.rect)
							]);
							const filename = `probe-${kind}.json`;
							await writeFile(resolve(directory, filename), probe.bytes);
							const reference = registerEvidence(
								evidenceReference(
									`${logicalBase}/${filename}`,
									probe.bytes,
									'probe',
									evidenceRegion(region.rect)
								),
								probe.bytes
							);
							const probeEvidence = [canonicalEvidence, reference];
							candidates.push(
								code === 'edge-aliasing'
									? mapMeasurement(probe.parsed, probeEvidence)
									: measurementCandidate(code, mapMeasurement(probe.parsed), probeEvidence)
							);
						} catch {
							candidates.push(unavailableCandidate(code, 'probe-failed', canonicalEvidence));
						}
					}

					const presetContract = manifest.presets.find(
						(preset) => preset.slug === coordinate.presetSlug
					);
					const readingPlan = primary.manifest.readingPlan;
					if (
						readingPlan.status !== 'available' ||
						!presetContract ||
						primary.manifest.readingPlanDigest !== presetContract.readingPlanDigest
					) {
						candidates.push(
							unavailableCandidate(
								'reading-window-too-short',
								'reading-intent-unrepresented',
								runtimeEvidence
							)
						);
					} else if (readingPlan.windows.length === 0) {
						candidates.push(
							notApplicableCandidate(
								'reading-window-too-short',
								'no-reading-content',
								runtimeEvidence,
								{
									readingPlanDigest: primary.manifest.readingPlanDigest,
									readingIds: []
								}
							)
						);
					} else {
						candidates.push(
							measurementCandidate(
								'reading-window-too-short',
								{
									readingPlanDigest: primary.manifest.readingPlanDigest,
									windows: readingPlan.windows.map((window) => ({
										readingId: window.readingId,
										kind: window.kind,
										wordCount: window.wordCount,
										startMilliseconds: window.startMilliseconds,
										endMilliseconds: window.endMilliseconds
									}))
								},
								runtimeEvidence
							)
						);
					}

					if (coordinate.sample.kind !== 'transition-window') {
						candidates.push(
							notApplicableCandidate(
								'visibility-discontinuity',
								'no-transition-window',
								runtimeEvidence
							)
						);
					} else {
						const focal = primary.manifest.selectedProbeRegions.focal;
						if (!focal || auxiliaryFrames.length < 3) {
							candidates.push(
								unavailableCandidate('visibility-discontinuity', 'authority-missing', [
									runtimeEvidence,
									...auxiliaryEvidence
								])
							);
						} else {
							try {
								const auxiliaryPaths = auxiliaryFrames.map((frame, index) =>
									resolve(
										directory,
										`auxiliary-${String(index).padStart(2, '0')}-frame-${frame.address.frameIndex}.png`
									)
								);
								const probe = runJsonProbe('scripts/probe-temporal-energy.ts', [
									...auxiliaryPaths,
									'--region',
									regionArgument(focal.rect)
								]);
								await writeFile(resolve(directory, 'probe-temporal-energy.json'), probe.bytes);
								const reference = registerEvidence(
									evidenceReference(
										`${logicalBase}/probe-temporal-energy.json`,
										probe.bytes,
										'probe',
										evidenceRegion(focal.rect)
									),
									probe.bytes
								);
								candidates.push(
									measurementCandidate(
										'visibility-discontinuity',
										{
											measuredDipRatio: (probe.parsed.max_dip?.pct_of_reference ?? 0) / 100,
											orderedFrameCount: auxiliaryFrames.length
										},
										[...auxiliaryEvidence, reference]
									)
								);
							} catch {
								candidates.push(
									unavailableCandidate(
										'visibility-discontinuity',
										'probe-failed',
										auxiliaryEvidence
									)
								);
							}
						}
					}

					const layoutFrames = [
						primary.geometry,
						replay.geometry,
						...auxiliaryFrames.map((frame) => frame.geometry)
					];
					const layoutEvidence = [
						primaryGeometryEvidence,
						replayGeometryEvidence,
						...auxiliaryGeometryEvidence,
						...auxiliaryEvidence
					];
					const maximumElementDeltaPixels = maximumGeometryDelta(
						layoutFrames,
						coordinate.sample.stableGeometryCandidateIds
					);
					candidates.push(
						maximumElementDeltaPixels === null
							? unavailableCandidate('layout-instability', 'authority-missing', layoutEvidence)
							: measurementCandidate(
									'layout-instability',
									{ maximumElementDeltaPixels },
									layoutEvidence
								)
					);
					cells.push(buildSupersRenderMatrixCellVerdict(coordinate, candidates, runtimeEvidence));
				}
			} finally {
				socket.close();
			}
			await sourceIdentity(manifest.sourceRevision, manifest.engineFingerprint);
			return {
				groupId: group.groupId,
				cells,
				evidence,
				startedAt,
				completedAt: new Date().toISOString()
			};
		},
		onGroupFailure: async (group, error, startedAt, completedAt) => {
			const bytes = Buffer.from(
				JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
			);
			const path = `render-matrix-evidence/${manifest.manifestDigest}/${group.groupId}/group-error.json`;
			const reference = evidenceReference(path, bytes);
			const physicalPath = resolve(dirname(outputPath), path);
			await mkdir(dirname(physicalPath), { recursive: true });
			await writeFile(physicalPath, bytes);
			return {
				groupId: group.groupId,
				cells: group.coordinates.map((coordinate) => ({
					schemaVersion: 1,
					coordinate,
					outcome: 'unavailable',
					checks: unavailableChecks(reference)
				})),
				evidence: [{ path, sha256: reference.sha256, bytes: bytes.length }],
				startedAt,
				completedAt
			};
		}
	});
	const servedAfter = await sourceIdentity(manifest.sourceRevision, manifest.engineFingerprint);
	const cells = results
		.flatMap((entry) => entry.cells)
		.sort((left, right) => left.coordinate.cellId.localeCompare(right.coordinate.cellId));
	const evidenceIndex = results
		.flatMap((entry) => entry.evidence)
		.sort((left, right) => left.path.localeCompare(right.path));
	const references = [
		...new Map(
			cells
				.flatMap((cell) => cell.checks.flatMap((check) => check.evidence))
				.map((entry) => [entry.path, entry])
		).values()
	];
	verifySupersRenderEvidenceIndex({ referencedEvidence: references, index: evidenceIndex });
	const bundleContent = {
		schemaVersion: 1,
		manifestDigest: manifest.manifestDigest,
		sourceRevision: manifest.sourceRevision,
		cells,
		outcome: cells.some((cell) => cell.outcome === 'fail')
			? 'fail'
			: cells.some((cell) => cell.outcome === 'unavailable')
				? 'unavailable'
				: 'pass'
	};
	await writeFile(
		resolve(outputPath),
		JSON.stringify({
			bundle: { ...bundleContent, bundleDigest: hash(bundleContent) },
			evidenceIndex,
			servedBefore,
			servedAfter
		})
	);
}

await main();
