export interface PresetValidationCommandOptions {
	mode: 'all' | 'explicit' | 'affected';
	presetSlugs: string[];
	changedPaths: string[];
	baseRevision?: string;
}

export function mergePresetValidationChangedPaths(
	explicitPaths: readonly string[],
	discoveredPaths: readonly string[]
): string[] {
	return [...new Set([...explicitPaths, ...discoveredPaths])].sort((left, right) =>
		left.localeCompare(right)
	);
}

export function presetValidationCommandUsage(): string {
	return [
		'Usage:',
		'  pnpm verify-presets --all',
		'  pnpm verify-presets --preset <slug> [--preset <slug> ...]',
		'  pnpm verify-presets --affected [--changed <path> ...] [--base <revision>]',
		'  pnpm verify-presets --affected --changed-paths-json "[\\"path\\"]"'
	].join('\n');
}

function readOptionValue(args: readonly string[], index: number, option: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith('--')) throw new TypeError(`${option} requires a value`);
	return value;
}

/** Parses the mutually exclusive all, explicit, and change-affected validation modes. */
export function parsePresetValidationCommand(
	args: readonly string[]
): PresetValidationCommandOptions {
	let requestedMode: PresetValidationCommandOptions['mode'] | undefined;
	const presetSlugs: string[] = [];
	const changedPaths: string[] = [];
	let baseRevision: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--help' || argument === '-h') {
			throw new TypeError(presetValidationCommandUsage());
		}
		if (argument === '--all') {
			if (requestedMode && requestedMode !== 'all')
				throw new TypeError('Choose one validation scope');
			requestedMode = 'all';
			continue;
		}
		if (argument === '--preset') {
			if (requestedMode && requestedMode !== 'explicit')
				throw new TypeError('Choose one validation scope');
			requestedMode = 'explicit';
			presetSlugs.push(readOptionValue(args, index, argument).replace(/\.json$/, ''));
			index += 1;
			continue;
		}
		if (argument === '--affected') {
			if (requestedMode && requestedMode !== 'affected')
				throw new TypeError('Choose one validation scope');
			requestedMode = 'affected';
			continue;
		}
		if (argument === '--changed') {
			changedPaths.push(readOptionValue(args, index, argument));
			index += 1;
			continue;
		}
		if (argument === '--changed-paths-json') {
			const parsed = JSON.parse(readOptionValue(args, index, argument)) as unknown;
			if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
				throw new TypeError('--changed-paths-json must contain an array of strings');
			}
			changedPaths.push(...parsed);
			index += 1;
			continue;
		}
		if (argument === '--base') {
			baseRevision = readOptionValue(args, index, argument);
			index += 1;
			continue;
		}
		throw new TypeError(`Unknown option: ${argument}\n${presetValidationCommandUsage()}`);
	}

	const mode = requestedMode ?? 'all';
	if (mode !== 'affected' && (changedPaths.length > 0 || baseRevision)) {
		throw new TypeError('--changed and --base require --affected');
	}
	if (mode === 'explicit' && presetSlugs.length === 0)
		throw new TypeError('--preset requires a slug');
	if (new Set(presetSlugs).size !== presetSlugs.length)
		throw new TypeError('Preset slugs must be unique');

	return { mode, presetSlugs, changedPaths, ...(baseRevision ? { baseRevision } : {}) };
}
