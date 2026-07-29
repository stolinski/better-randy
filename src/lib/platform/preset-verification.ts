import type { Preset } from './engine-schema';
import { lintPreset, type RubricIssue } from './preset-rubric';
import { PresetIngressSchema } from './preset-ingress';
import { validatePresetSemantics } from './preset-validation';

export type PresetVerificationSource = 'schema' | 'semantic' | 'linter' | 'visual';

export interface PresetVerificationIssue {
	source: PresetVerificationSource;
	severity: 'error' | 'warn';
	path: string;
	message: string;
	rule?: string;
}

export interface PresetVerificationResult {
	preset: Preset | null;
	issues: PresetVerificationIssue[];
	isValid: boolean;
}

function formatVerificationPath(path: readonly PropertyKey[]): string {
	return path.length > 0 ? path.map(String).join('.') : '<root>';
}

function rubricIssueToVerificationIssue(
	issue: RubricIssue,
	source: 'linter' | 'visual'
): PresetVerificationIssue {
	return {
		source,
		severity: issue.severity,
		path: issue.path,
		message: issue.message,
		rule: issue.rule
	};
}

/** Run the deterministic machine gate used by standalone import and GUI verification. */
export function verifyPresetArtifact(value: unknown): PresetVerificationResult {
	const structuralResult = PresetIngressSchema.safeParse(value);
	if (!structuralResult.success) {
		const issues = structuralResult.error.issues.map((issue): PresetVerificationIssue => ({
			source: 'schema',
			severity: 'error',
			path: formatVerificationPath(issue.path),
			message: issue.message
		}));
		return { preset: null, issues, isValid: false };
	}

	const preset = structuralResult.data;
	const semanticIssues = validatePresetSemantics(preset).map((issue): PresetVerificationIssue => ({
		source: 'semantic',
		severity: 'error',
		path: formatVerificationPath(issue.path),
		message: issue.message
	}));
	if (semanticIssues.length > 0) {
		return { preset, issues: semanticIssues, isValid: false };
	}

	const lintIssues =
		preset.kind === 'fixture'
			? []
			: lintPreset(preset).map((issue) => rubricIssueToVerificationIssue(issue, 'linter'));
	return {
		preset,
		issues: lintIssues,
		isValid: lintIssues.every((issue) => issue.severity !== 'error')
	};
}

export function appendVisualVerificationIssues(
	result: PresetVerificationResult,
	visualIssues: readonly RubricIssue[]
): PresetVerificationResult {
	const issues = [
		...result.issues,
		...visualIssues.map((issue) => rubricIssueToVerificationIssue(issue, 'visual'))
	];
	return {
		preset: result.preset,
		issues,
		isValid: result.preset !== null && issues.every((issue) => issue.severity !== 'error')
	};
}
