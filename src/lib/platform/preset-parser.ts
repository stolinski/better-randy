import type { Preset } from './engine-schema';
import { getPresetBySlug } from './preset-catalog';
import { PresetIngressSchema } from './preset-ingress';
import { formatPresetSemanticIssues, validatePresetSemantics } from './preset-validation';

export function parsePreset(json: unknown): Preset {
	const result = PresetIngressSchema.safeParse(json);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('\n');
		throw new Error(`Invalid Supers preset:\n${issues}`);
	}
	const semanticIssues = validatePresetSemantics(result.data, { resolvePreset: getPresetBySlug });
	if (semanticIssues.length > 0) {
		throw new Error(`Invalid Supers preset:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}
	return result.data;
}
