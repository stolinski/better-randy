import type { Preset } from './engine-schema';
import { getPresetBySlug } from './preset-catalog';
import { PresetIngressSchema } from './preset-ingress';
import {
	formatPresetSemanticIssues,
	validatePresetSemantics,
	type PresetSemanticValidationOptions
} from './preset-validation';

export interface ParsePresetOptions {
	/** How `pack` resolves (ADR-0055); the composition store's documents pass `stored`, the corpus never does. */
	packScope?: PresetSemanticValidationOptions['packScope'];
}

export function parsePreset(json: unknown, options: ParsePresetOptions = {}): Preset {
	const result = PresetIngressSchema.safeParse(json);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('\n');
		throw new Error(`Invalid GFX preset:\n${issues}`);
	}
	const semanticIssues = validatePresetSemantics(result.data, {
		resolvePreset: getPresetBySlug,
		packScope: options.packScope
	});
	if (semanticIssues.length > 0) {
		throw new Error(`Invalid GFX preset:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}
	return result.data;
}
