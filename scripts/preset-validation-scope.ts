export interface StaticPresetImpactEntry {
	slug: string;
	pipelineReferences: readonly string[];
	presetDependencies: readonly string[];
}

export interface StaticPresetImpactRegistry {
	presets: readonly StaticPresetImpactEntry[];
	knownPresetSlugs: readonly string[];
	packs: readonly { id: string }[];
}

export interface StaticPresetPackAxis {
	presetSlug: string;
	packId: string;
}

function normalizeChangedPaths(changedPaths: readonly string[]): string[] {
	const normalized = changedPaths.map((path) => path.replaceAll('\\', '/').replace(/^\.\//, ''));
	if (
		normalized.some((path) => !path || path.startsWith('/') || path.split('/').includes('..')) ||
		new Set(normalized).size !== normalized.length
	) {
		throw new TypeError('Changed paths must be unique safe project-relative paths');
	}
	const sorted = [...normalized].sort((left, right) => left.localeCompare(right));
	if (normalized.some((path, index) => path !== sorted[index])) {
		throw new TypeError('Changed paths must use canonical order');
	}
	return normalized;
}

function isNoPresetValidationImpactPath(path: string): boolean {
	return (
		path.startsWith('.dex/') ||
		path.startsWith('docs/') ||
		path.startsWith('workflows/') ||
		path.startsWith('models/') ||
		path.startsWith('extensions/') ||
		path === 'AGENTS.md' ||
		path === 'README.md'
	);
}

function addPresetsMatchingReferences(
	registry: StaticPresetImpactRegistry,
	pairs: Set<string>,
	references: readonly string[]
): void {
	for (const preset of registry.presets) {
		if (!references.some((reference) => preset.pipelineReferences.includes(reference))) continue;
		for (const pack of registry.packs) pairs.add(`${preset.slug}\0${pack.id}`);
	}
}

function addPresetsMatchingReferencePrefix(
	registry: StaticPresetImpactRegistry,
	pairs: Set<string>,
	referencePrefix: string
): void {
	for (const preset of registry.presets) {
		if (!preset.pipelineReferences.some((reference) => reference.startsWith(referencePrefix)))
			continue;
		for (const pack of registry.packs) pairs.add(`${preset.slug}\0${pack.id}`);
	}
}

/** Selects Pack approvals touched by affected Calibration Trio axes. */
export function selectAffectedPackCalibrationSlugs(
	axes: readonly StaticPresetPackAxis[],
	calibrationPresetSlugs: readonly string[]
): string[] {
	const calibrationSlugs = new Set(calibrationPresetSlugs);
	return [
		...new Set(
			axes.filter(({ presetSlug }) => calibrationSlugs.has(presetSlug)).map(({ packId }) => packId)
		)
	].sort((left, right) => left.localeCompare(right));
}

function collectKnownPresetSlugs(registry: StaticPresetImpactRegistry): Set<string> {
	const knownPresetSlugs = new Set(registry.knownPresetSlugs);
	if (knownPresetSlugs.size !== registry.knownPresetSlugs.length) {
		throw new TypeError('Known Preset slugs must be unique');
	}
	for (const preset of registry.presets) {
		if (!knownPresetSlugs.has(preset.slug)) {
			throw new TypeError(`Deliverable Preset is missing from the known inventory: ${preset.slug}`);
		}
	}
	return knownPresetSlugs;
}

/** Selects the smallest complete Preset × Pack scope for static validation. */
export function selectAffectedStaticPresetPackAxes(
	registry: StaticPresetImpactRegistry,
	changedPaths: readonly string[]
): StaticPresetPackAxis[] {
	const pairs = new Set<string>();
	const knownPresetSlugs = collectKnownPresetSlugs(registry);
	const addAll = (): void => {
		for (const preset of registry.presets) {
			for (const pack of registry.packs) pairs.add(`${preset.slug}\0${pack.id}`);
		}
	};

	for (const path of normalizeChangedPaths(changedPaths)) {
		if (isNoPresetValidationImpactPath(path)) continue;

		const presetMatch = /^src\/lib\/presets\/([^/]+)\.json$/.exec(path);
		if (presetMatch) {
			const changedPresetSlugs = new Set([presetMatch[1]]);
			const selectedPresetSlugs = new Set<string>();
			let addedDependency = true;
			while (addedDependency) {
				addedDependency = false;
				for (const preset of registry.presets) {
					if (
						changedPresetSlugs.has(preset.slug) ||
						preset.presetDependencies.some((slug) => changedPresetSlugs.has(slug))
					) {
						if (!selectedPresetSlugs.has(preset.slug)) addedDependency = true;
						selectedPresetSlugs.add(preset.slug);
						changedPresetSlugs.add(preset.slug);
					}
				}
			}
			if (selectedPresetSlugs.size === 0 && !knownPresetSlugs.has(presetMatch[1])) addAll();
			else {
				for (const slug of selectedPresetSlugs) {
					for (const pack of registry.packs) pairs.add(`${slug}\0${pack.id}`);
				}
			}
			continue;
		}

		const packMatch = /^src\/lib\/packs\/([^/]+)\//.exec(path);
		if (packMatch && registry.packs.some((entry) => entry.id === packMatch[1])) {
			for (const preset of registry.presets) pairs.add(`${preset.slug}\0${packMatch[1]}`);
			continue;
		}

		const pipelineMatch =
			/^src\/lib\/pipelines\/(surfaces|blocks|annotations|overlays|effects)\/([^/]+)\//.exec(path);
		if (pipelineMatch) {
			const references = [`${pipelineMatch[1]}:${pipelineMatch[2]}`];
			if (pipelineMatch[1] === 'effects') references.push(`transitions:${pipelineMatch[2]}`);
			addPresetsMatchingReferences(registry, pairs, references);
			continue;
		}

		if (path.startsWith('src/lib/pipelines/captions/')) {
			addPresetsMatchingReferencePrefix(registry, pairs, 'captions:');
			continue;
		}

		const textAnimationMatch =
			/^src\/lib\/text-animations\/raw-catalog\/(?:effects|specs)\/([^/]+)\.json$/.exec(path);
		if (textAnimationMatch) {
			addPresetsMatchingReferences(registry, pairs, [`text-animations:${textAnimationMatch[1]}`]);
			continue;
		}

		if (path.includes('depth-stage')) {
			addPresetsMatchingReferences(registry, pairs, ['stages:depth']);
			continue;
		}

		addAll();
	}

	return [...pairs]
		.sort((left, right) => left.localeCompare(right))
		.map((pair) => {
			const [presetSlug, packId] = pair.split('\0');
			return { presetSlug, packId };
		});
}
