import { PIPELINE_REGISTRY } from '../pipelines';
import { validatePackCoreVocabulary } from '../pipelines/identity-registry';
import type { PackFont, PackManifest } from './types';

export interface PackValidationIssue {
	pack: string;
	path: (string | number)[];
	kind:
		| 'registry-slug-mismatch'
		| 'invalid-metadata'
		| 'invalid-core-role'
		| 'unsupported-pipeline-role'
		| 'invalid-chrome-role'
		| 'unknown-chrome-effect'
		| 'invalid-chrome-effect'
		| 'duplicate-chrome-effect'
		| 'invalid-font-declaration'
		| 'undeclared-font-family';
	message: string;
}

const PACK_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FONT_ROLE_KEYS = ['font-treatment', 'font-label-treatment'] as const;

function firstFontFamily(value: string): string {
	const family = value.split(',')[0]?.trim() ?? '';
	return family.replace(/^(['"])(.*)\1$/, '$2');
}

function appendFontDeclarationIssues(
	registryKey: string,
	fonts: readonly PackFont[] | undefined,
	issues: PackValidationIssue[]
): Set<string> {
	const declaredFamilies = new Set<string>();
	const seenDeclarations = new Set<string>();

	for (const [index, font] of (fonts ?? []).entries()) {
		const declarationKey = `${font.family}\u0000${font.style ?? 'normal'}`;
		if (font.family.trim().length === 0) {
			issues.push({
				pack: registryKey,
				path: ['fonts', index, 'family'],
				kind: 'invalid-font-declaration',
				message: 'Pack font family must not be empty'
			});
		} else {
			declaredFamilies.add(font.family);
		}
		if (seenDeclarations.has(declarationKey)) {
			issues.push({
				pack: registryKey,
				path: ['fonts', index],
				kind: 'invalid-font-declaration',
				message: `Duplicate Pack font declaration for "${font.family}" (${font.style ?? 'normal'})`
			});
		}
		seenDeclarations.add(declarationKey);

		if (font.style !== undefined && font.style.trim().length === 0) {
			issues.push({
				pack: registryKey,
				path: ['fonts', index, 'style'],
				kind: 'invalid-font-declaration',
				message: 'Pack font style must not be empty'
			});
		}

		const seenWeights = new Set<number>();
		for (const [weightIndex, weight] of (font.weights ?? [400]).entries()) {
			if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
				issues.push({
					pack: registryKey,
					path: ['fonts', index, 'weights', weightIndex],
					kind: 'invalid-font-declaration',
					message: `Pack font weight must be an integer from 1 to 1000; received ${weight}`
				});
			}
			if (seenWeights.has(weight)) {
				issues.push({
					pack: registryKey,
					path: ['fonts', index, 'weights', weightIndex],
					kind: 'invalid-font-declaration',
					message: `Duplicate Pack font weight ${weight} for "${font.family}"`
				});
			}
			seenWeights.add(weight);
		}
	}

	return declaredFamilies;
}

function appendChromeIssues(
	registryKey: string,
	manifest: PackManifest,
	issues: PackValidationIssue[]
): void {
	for (const [roleKey, role] of Object.entries(manifest.roles)) {
		if (role.kind === 'pipeline') {
			issues.push({
				pack: registryKey,
				path: ['roles', roleKey],
				kind: 'unsupported-pipeline-role',
				message: `Pack role "${roleKey}" selects Pipeline "${role.pipeline}", but Pack-selected Pipelines have no runtime consumer`
			});
			continue;
		}
		if (role.kind !== 'chrome') continue;

		if (roleKey !== 'chrome') {
			issues.push({
				pack: registryKey,
				path: ['roles', roleKey],
				kind: 'invalid-chrome-role',
				message: `Chrome recipes must use the canonical "chrome" role key; received "${roleKey}"`
			});
		}

		const seenTypes = new Set<string>();
		for (const [index, effect] of role.effects.entries()) {
			if (seenTypes.has(effect.type)) {
				issues.push({
					pack: registryKey,
					path: ['roles', roleKey, 'effects', index, 'type'],
					kind: 'duplicate-chrome-effect',
					message: `Chrome Effect "${effect.type}" is declared more than once`
				});
			}
			seenTypes.add(effect.type);

			const renderer = Object.values(PIPELINE_REGISTRY.effects).find(
				(candidate) => candidate.type === effect.type
			);
			if (!renderer) {
				issues.push({
					pack: registryKey,
					path: ['roles', roleKey, 'effects', index, 'type'],
					kind: 'unknown-chrome-effect',
					message: `Chrome Effect "${effect.type}" is not a registered post-process Effect`
				});
				continue;
			}

			const result = renderer.schema.safeParse({
				type: effect.type,
				id: `pack-${manifest.slug}-${index}`,
				params: effect.params ?? {}
			});
			if (!result.success) {
				for (const error of result.error.issues) {
					issues.push({
						pack: registryKey,
						path: [
							'roles',
							roleKey,
							'effects',
							index,
							...error.path.map((part) =>
								typeof part === 'symbol' ? (part.description ?? part.toString()) : part
							)
						],
						kind: 'invalid-chrome-effect',
						message: error.message
					});
				}
			}
		}
	}
}

export function validatePackManifest(
	registryKey: string,
	manifest: PackManifest
): readonly PackValidationIssue[] {
	const issues: PackValidationIssue[] = [];

	if (manifest.slug !== registryKey) {
		issues.push({
			pack: registryKey,
			path: ['slug'],
			kind: 'registry-slug-mismatch',
			message: `Pack registry key "${registryKey}" does not match manifest slug "${manifest.slug}"`
		});
	}
	if (!PACK_SLUG_PATTERN.test(manifest.slug)) {
		issues.push({
			pack: registryKey,
			path: ['slug'],
			kind: 'invalid-metadata',
			message: `Pack slug "${manifest.slug}" must use lowercase kebab-case`
		});
	}
	for (const field of ['label', 'description'] as const) {
		if (manifest[field].trim().length === 0) {
			issues.push({
				pack: registryKey,
				path: [field],
				kind: 'invalid-metadata',
				message: `Pack ${field} must not be empty`
			});
		}
	}

	for (const error of validatePackCoreVocabulary(manifest)) {
		issues.push({
			pack: registryKey,
			path: ['roles', error.role],
			kind: 'invalid-core-role',
			message: error.message
		});
	}

	const declaredFamilies = appendFontDeclarationIssues(registryKey, manifest.fonts, issues);
	for (const roleKey of FONT_ROLE_KEYS) {
		const role = manifest.roles[roleKey];
		if (!role) continue;
		if (role.kind !== 'style' || typeof role.value !== 'string') {
			issues.push({
				pack: registryKey,
				path: ['roles', roleKey],
				kind: 'invalid-font-declaration',
				message: `Pack role "${roleKey}" must be a style role containing a CSS font-family string`
			});
			continue;
		}
		const family = firstFontFamily(role.value);
		if (!declaredFamilies.has(family)) {
			issues.push({
				pack: registryKey,
				path: ['roles', roleKey],
				kind: 'undeclared-font-family',
				message: `Pack role "${roleKey}" names "${family}" first, but manifest.fonts does not declare that family`
			});
		}
	}

	appendChromeIssues(registryKey, manifest, issues);
	return issues;
}

export function validatePackRegistry(
	registry: Readonly<Record<string, PackManifest>>
): readonly PackValidationIssue[] {
	const issues: PackValidationIssue[] = [];
	const seenSlugs = new Set<string>();
	for (const [key, manifest] of Object.entries(registry)) {
		if (seenSlugs.has(manifest.slug)) {
			issues.push({
				pack: key,
				path: ['slug'],
				kind: 'registry-slug-mismatch',
				message: `Pack slug "${manifest.slug}" is registered more than once`
			});
		}
		seenSlugs.add(manifest.slug);
		issues.push(...validatePackManifest(key, manifest));
	}
	return issues;
}

export function formatPackValidationIssues(issues: readonly PackValidationIssue[]): string {
	return issues
		.map((issue) => `${issue.pack}.${issue.path.join('.') || '<root>'}: ${issue.message}`)
		.join('\n');
}
