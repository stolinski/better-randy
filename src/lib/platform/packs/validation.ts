import { getEffectDefinition } from '../pipelines/definition-registry';
import { validatePackCoreVocabulary } from '../pipelines/identity-registry';
import { CHART_MARK_FILL_COLOR_ROLES, isChartMarkFillColorValue, isColorValue } from './resolve';
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
		| 'undeclared-font-family'
		| 'invalid-chart-mark-fill';
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

const CHART_FILL_ROLES = ['default', 'series', 'emphasis'] as const;
const CHART_FILL_MODES = ['solid', 'gradient', 'ordered-dither'] as const;
const CHART_GRADIENT_AXES = ['inline', 'block'] as const;
const CHART_DITHER_MATRICES = ['2x2', '4x4', '8x8'] as const;

function includesString(values: readonly string[], value: unknown): value is string {
	return typeof value === 'string' && values.includes(value);
}

function appendChartMarkFillIssue(
	registryKey: string,
	issues: PackValidationIssue[],
	path: (string | number)[],
	message: string
): void {
	issues.push({ pack: registryKey, path, kind: 'invalid-chart-mark-fill', message });
}

function appendChartMarkFillIssues(
	registryKey: string,
	manifest: PackManifest,
	issues: PackValidationIssue[]
): void {
	const markRole = manifest.roles['chart.mark'];
	const markColorValid = markRole?.kind === 'style' && isChartMarkFillColorValue(markRole.value);
	if (markRole !== undefined && !markColorValid) {
		appendChartMarkFillIssue(
			registryKey,
			issues,
			['roles', 'chart.mark'],
			'Chart mark fill requires chart.mark to use a color supported by cssColorToRgbaFloat'
		);
	}
	const accentRole = manifest.roles['accent-treatment'];
	const accentColorValid =
		accentRole?.kind === 'style' && isChartMarkFillColorValue(accentRole.value);
	if (!markColorValid && !accentColorValid) {
		appendChartMarkFillIssue(
			registryKey,
			issues,
			['roles', 'accent-treatment'],
			'Chart mark fill requires a parseable chart.mark or accent-treatment color floor'
		);
	}
	const role = manifest.roles['chart.mark-fill'];
	if (role === undefined) return;
	const basePath = ['roles', 'chart.mark-fill'] as const;
	if (
		role.kind !== 'style' ||
		role.value === null ||
		typeof role.value !== 'object' ||
		Array.isArray(role.value)
	) {
		appendChartMarkFillIssue(
			registryKey,
			issues,
			[...basePath],
			'Pack role "chart.mark-fill" must be a style role containing a recipe object'
		);
		return;
	}
	const recipes = role.value as Record<string, unknown>;
	for (const key of Object.keys(recipes)) {
		if (!includesString(CHART_FILL_ROLES, key) && key !== 'seriesRoles') {
			appendChartMarkFillIssue(
				registryKey,
				issues,
				[...basePath, key],
				`Unknown chart mark fill role "${key}"`
			);
		}
	}
	const seriesRoles = recipes.seriesRoles;
	if (
		!Array.isArray(seriesRoles) ||
		seriesRoles.length !== 4 ||
		new Set(seriesRoles).size !== seriesRoles.length
	) {
		appendChartMarkFillIssue(
			registryKey,
			issues,
			[...basePath, 'seriesRoles'],
			'Chart mark fill seriesRoles must contain four distinct color roles'
		);
	} else {
		for (let index = 0; index < seriesRoles.length; index += 1) {
			const seriesRole = seriesRoles[index];
			if (!includesString(CHART_MARK_FILL_COLOR_ROLES, seriesRole)) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...basePath, 'seriesRoles', index],
					`Unknown chart series color role "${String(seriesRole)}"`
				);
				continue;
			}
			const colorRole = manifest.roles[seriesRole];
			if (!colorRole || colorRole.kind !== 'style' || !isChartMarkFillColorValue(colorRole.value)) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...basePath, 'seriesRoles', index],
					`Chart series color role "${seriesRole}" must resolve to a supported color`
				);
			}
		}
	}
	for (const chartRole of CHART_FILL_ROLES) {
		const value = recipes[chartRole];
		if (value === undefined) continue;
		const recipePath = [...basePath, chartRole];
		if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			appendChartMarkFillIssue(
				registryKey,
				issues,
				recipePath,
				'Chart mark fill recipe must be an object'
			);
			continue;
		}
		const recipe = value as Record<string, unknown>;
		if (!includesString(CHART_FILL_MODES, recipe.mode)) {
			appendChartMarkFillIssue(
				registryKey,
				issues,
				[...recipePath, 'mode'],
				`Unknown chart mark fill mode "${String(recipe.mode)}"`
			);
			continue;
		}
		const allowedKeys =
			recipe.mode === 'solid'
				? ['mode']
				: recipe.mode === 'gradient'
					? ['mode', 'toRole', 'axis']
					: ['mode', 'toRole', 'matrix', 'cellPx'];
		for (const key of Object.keys(recipe)) {
			if (!allowedKeys.includes(key)) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...recipePath, key],
					`Unknown key "${key}" for ${recipe.mode} chart mark fill`
				);
			}
		}
		if (
			recipe.toRole !== undefined &&
			!includesString(CHART_MARK_FILL_COLOR_ROLES, recipe.toRole)
		) {
			appendChartMarkFillIssue(
				registryKey,
				issues,
				[...recipePath, 'toRole'],
				`Unknown chart mark fill color role "${String(recipe.toRole)}"`
			);
		}
		if (
			includesString(CHART_MARK_FILL_COLOR_ROLES, recipe.toRole) &&
			manifest.roles[recipe.toRole] !== undefined
		) {
			const destination = manifest.roles[recipe.toRole];
			if (destination.kind !== 'style' || !isChartMarkFillColorValue(destination.value)) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...recipePath, 'toRole'],
					`Chart mark fill color role "${recipe.toRole}" is not supported by cssColorToRgbaFloat`
				);
			}
		}
		if (
			recipe.mode === 'gradient' &&
			recipe.axis !== undefined &&
			!includesString(CHART_GRADIENT_AXES, recipe.axis)
		) {
			appendChartMarkFillIssue(
				registryKey,
				issues,
				[...recipePath, 'axis'],
				`Unknown chart mark gradient axis "${String(recipe.axis)}"`
			);
		}
		if (recipe.mode === 'ordered-dither') {
			if (recipe.matrix !== undefined && !includesString(CHART_DITHER_MATRICES, recipe.matrix)) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...recipePath, 'matrix'],
					`Unknown ordered-dither matrix "${String(recipe.matrix)}"`
				);
			}
			if (
				recipe.cellPx !== undefined &&
				(typeof recipe.cellPx !== 'number' ||
					!Number.isFinite(recipe.cellPx) ||
					!Number.isInteger(recipe.cellPx) ||
					recipe.cellPx < 2 ||
					recipe.cellPx > 32)
			) {
				appendChartMarkFillIssue(
					registryKey,
					issues,
					[...recipePath, 'cellPx'],
					'Ordered-dither cellPx must be a finite integer from 2 to 32'
				);
			}
		}
	}
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

			const definition = getEffectDefinition(effect.type);
			if (!definition) {
				issues.push({
					pack: registryKey,
					path: ['roles', roleKey, 'effects', index, 'type'],
					kind: 'unknown-chrome-effect',
					message: `Chrome Effect "${effect.type}" is not a registered post-process Effect`
				});
				continue;
			}

			const result = definition.schema.safeParse({
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
	const fieldInkRole = manifest.roles['field-ink-treatment'];
	if (
		fieldInkRole !== undefined &&
		(fieldInkRole.kind !== 'style' ||
			typeof fieldInkRole.value !== 'string' ||
			!isColorValue(fieldInkRole.value))
	) {
		issues.push({
			pack: registryKey,
			path: ['roles', 'field-ink-treatment'],
			kind: 'invalid-core-role',
			message: 'Pack role "field-ink-treatment" must be a style role containing a CSS colour'
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

	appendChartMarkFillIssues(registryKey, manifest, issues);
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
