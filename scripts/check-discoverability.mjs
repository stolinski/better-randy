import { existsSync, globSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { readPackRegistrySlugsFromSource } from '../src/lib/utils/pack-registry-source.mjs';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.svelte'];
const TEST_FILE_PATTERN = /\.(?:(?:integration\.)?(?:test|spec))\.[cm]?[jt]sx?$/;

// These are exact public names, not substrings. Framework route exports are outside
// domainExportRoots, while canonical short domain nouns such as Block and Effect are
// intentionally absent. index.ts and types.ts are valid inside concept-named folders.
export const DISCOVERABILITY_CONFIG = Object.freeze({
	sourceRoots: ['src'],
	domainExportRoots: ['src/lib'],
	activeGuidanceGlobs: [
		'AGENTS.md',
		'.claude/commands/*.md',
		'.claude/skills/*/SKILL.md',
		'.claude/skills/*/SOURCES.md',
		'docs/briefs/*.md',
		'docs/engine-architecture.md',
		'docs/ideas/**/*.md',
		'docs/packs/**/*.md',
		'docs/preset-format.md',
		'scripts/audit-*.ts',
		'scripts/gen-*.mjs',
		'scripts/url-to-preset.mjs',
		'src/lib/presets/*.json'
	],
	activeGuidanceExcludeGlobs: [
		'.dex/**',
		'docs/adr/**',
		'docs/CONTEXT.md',
		'docs/critic-captures/**',
		'**/generated/**',
		'**/history/**',
		'**/*.schema.json'
	],
	retiredGuidanceLiterals: [
		{
			literal: 'Control Panel',
			replacement: 'Use the active Inspector and Timeline terminology.'
		},
		{
			literal: 'localhost:5173',
			replacement: 'Use http://localhost:7263.'
		},
		{
			literal: 'effects.frame',
			replacement: 'Use the flat effects[] chain, such as a paper-grain entry.'
		},
		...['soundKit', 'Sound kit', 'Sound-kit', 'sound kit', 'sound-kit'].map((literal) => ({
			literal,
			replacement:
				'Use engine-default samples plus per-motion sound.event, sound.sample, or sound.mute overrides.'
		}))
	],
	retiredCurrentProtocolLiterals: [
		...['imessage-N', 'checklist-{index}', 'overlay-{id}-beat', 'block-{id}', 'item:N'].map(
			(literal) => ({
				literal,
				category: 'timeline-identity',
				replacement:
					'Use createTimelineTrackId with a typed TimelineTrackIdentity and parseTimelineTrackId when decoding.'
			})
		),
		...[
			'designed kit',
			'designed kits',
			'kit resolution',
			'kit-resolved',
			'kit-less',
			'every kit'
		].map((literal) => ({
			literal,
			category: 'sound-resolution',
			replacement:
				'Use engine-default samples plus per-motion sound.event, sound.sample, or sound.mute overrides.'
		}))
	],
	activeGuidanceClaims: [
		{
			rule: 'required-preset-pack',
			pattern: /\bdefaults?\s+to\s+`?syntax`?/i,
			message: 'Active guidance claims a missing Preset Pack defaults to syntax.',
			remediation:
				'Preset.pack is required with no default; fail validation instead of substituting syntax.'
		},
		{
			rule: 'export-orchestration-owner',
			pattern:
				/\bexport-video\.ts\b.*(?:real export path|\borchestration seam\b|__supersExport.*\bseam\b)/i,
			message: 'Active guidance attributes export orchestration to export-video.ts.',
			remediation:
				'Use CompositionExportController as the orchestration seam, Workspace as the mounted callback owner, and export-video.ts for encoding primitives.'
		},
		{
			rule: 'supported-export-codec',
			pattern: /(?:\bProRes\s*422\b|\bopaque\b.*\b422\b|\bH\.264\b)/i,
			allowPattern: /\b(?:future|unbuilt|unsupported|not implemented|not built)\b/i,
			message: 'Active guidance promises an unsupported ProRes 422 or H.264 export lane.',
			remediation:
				'The current ProRes route emits 4444 for transparent and opaque compositions; mark 422 or H.264 as future/unbuilt if discussed.'
		},
		{
			rule: 'complete-pack-immunity-guidance',
			pattern:
				/\b(?:Pack-immun(?:e|ity)|PACK_IMMUNE_PIPELINE_KEYS)\b.*`(?:surface|overlay):[a-z0-9-]+`/i,
			message: 'Active guidance copies a concrete Pack-immunity list that can drift from Identity Specs.',
			remediation:
				'Derive the complete set from PACK_IMMUNE_PIPELINE_KEYS instead of copying Pipeline keys into prose.'
		}
	],
	currentStatusGuidanceFiles: [
		'docs/CONTEXT.md',
		'docs/engine-architecture.md',
		'docs/roadmap.md'
	],
	staleCurrentStatusClaims: [
		{
			pattern: /or,\s+later,\s+from a blank composition/i,
			message: 'Current guidance describes blank-composition creation as future work.',
			remediation:
				'Document the shipped homepage New composition action, which forks the blank Preset into the user store.'
		},
		{
			pattern: /\b(?:create[- ]from[- ]blank|blank-composition authoring entry point)\b.*\b(?:deferred|not built|later)\b/i,
			message: 'Current guidance marks shipped create-from-blank authoring as deferred.',
			remediation:
				'Mark create-from-blank shipped and point to the homepage New composition implementation.'
		}
	],
	historicalIdeaStatusRequirements: [
		{
			file: 'docs/ideas/unified-webgpu-compositor.md',
			pattern: /^>\s*\*\*Status\b[^\n]*(?:historical|superseded)/im,
			message:
				'The pre-ADR-0028 unified compositor idea is not visibly marked historical or superseded.',
			remediation:
				'Mark it historical/superseded by ADR-0028 and composition-frame-renderer.ts so it cannot read as current direction.'
		}
	],
	prohibitedExportNames: new Map([
		['Client', 'qualify it with the domain it serves'],
		['Config', 'name the configured subsystem or contract'],
		['Data', 'name the domain value represented'],
		['Handler', 'name the event, request, or domain operation handled'],
		['Item', 'name the domain entity represented'],
		['Manager', 'name the state or lifecycle being managed'],
		['Options', 'name the operation or subsystem being configured'],
		['Renderer', 'name the rendered domain and Layer'],
		['Result', 'name the operation that produced the result'],
		['State', 'name the domain whose state is represented'],
		['Store', 'name the persisted domain'],
		['create', 'name the domain value being created']
	]),
	canonicalIdentifierAliases: new Map([
		['DiagramElement', 'use DiagramPrimitive'],
		['EFFECT_CATALOG', 'use TEXT_EFFECT_CATALOG for text effects'],
		['EFFECT_IDS', 'use TEXT_EFFECT_IDS for text effects'],
		['EffectId', 'use TextEffectId for a text-effect identifier'],
		['EffectSpec', 'use TextEffectSpec for a text-effect contract'],
		['EngineBlock', 'use the canonical Block Layer type'],
		['PersistencePort', 'use UserCompositionStore'],
		['Recipe', 'use StarterTemplate or Preset, according to the artifact'],
		['ResolvedSpec', 'use ResolvedTextEffectSpec for a resolved text effect'],
		['soundKit', 'use sound events, audio cues, or the bed slot'],
		['textanim', 'use textAnimation'],
		['userStore', 'use userCompositionStore']
	]),
	// readUserCompositionResponseJson receives only fixed, searchable operation strings.
	// Keep this exception keyed by both file and first interpolation identifier so a new
	// interpolation-first template in the same module still fails.
	errorPrefixAllowlist: new Map([
		['src/lib/platform/user-composition-store.ts', new Set(['operation'])]
	])
});

function normalizePath(filePath) {
	return filePath.split(sep).join('/');
}

function isUnderRoot(filePath, roots) {
	return roots.some((root) => filePath === root || filePath.startsWith(`${root}/`));
}

function isSourceFile(fileName) {
	return SOURCE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isTestFile(fileName) {
	return TEST_FILE_PATTERN.test(fileName);
}

function collectSourceFiles(root, sourceRoots) {
	const files = [];

	function visit(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) visit(entryPath);
			else if (entry.isFile() && isSourceFile(entry.name)) files.push(resolve(entryPath));
		}
	}

	for (const sourceRoot of sourceRoots) {
		const absoluteRoot = resolve(root, sourceRoot);
		if (existsSync(absoluteRoot)) visit(absoluteRoot);
	}

	return files;
}

function collectActiveGuidanceFiles(root, config) {
	const files = new Set();
	for (const pattern of config.activeGuidanceGlobs ?? []) {
		for (const relativePath of globSync(pattern, {
			cwd: root,
			exclude: config.activeGuidanceExcludeGlobs ?? []
		})) {
			const absolutePath = resolve(root, relativePath);
			if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
				files.add(absolutePath);
			}
		}
	}
	return [...files].toSorted((a, b) => a.localeCompare(b));
}

function collectExistingFiles(root, relativePaths) {
	return (relativePaths ?? [])
		.map((relativePath) => resolve(root, relativePath))
		.filter((filePath) => existsSync(filePath) && statSync(filePath).isFile());
}

function sourceUnits(filePath) {
	const sourceText = readFileSync(filePath, 'utf8');
	if (!filePath.endsWith('.svelte')) return [{ sourceText, lineOffset: 0 }];

	const units = [];
	const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
	for (const match of sourceText.matchAll(scriptPattern)) {
		const content = match[1];
		const contentStart = (match.index ?? 0) + match[0].indexOf(content);
		const lineOffset = sourceText.slice(0, contentStart).split('\n').length - 1;
		units.push({ sourceText: content, lineOffset });
	}
	return units;
}

function scriptKindFor(filePath) {
	if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
	if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.TS;
}

function hasExportModifier(node) {
	return Boolean(
		ts.canHaveModifiers(node) &&
		ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
	);
}

function bindingNames(name) {
	if (ts.isIdentifier(name)) return [name];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
	);
}

function importedLocalNames(sourceFile) {
	const names = new Set();
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
		if (statement.importClause.name) names.add(statement.importClause.name.text);
		const bindings = statement.importClause.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
		if (bindings && ts.isNamedImports(bindings)) {
			for (const element of bindings.elements) names.add(element.name.text);
		}
	}
	return names;
}

function exportedNames(statement) {
	if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
		return statement.declarationList.declarations.flatMap((declaration) =>
			bindingNames(declaration.name)
		);
	}
	if (
		hasExportModifier(statement) &&
		'name' in statement &&
		statement.name &&
		ts.isIdentifier(statement.name)
	) {
		return [statement.name];
	}
	if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause) {
		if (ts.isNamedExports(statement.exportClause)) {
			return statement.exportClause.elements.map((element) => element.name);
		}
	}
	return [];
}

function firstTemplateExpressionName(template) {
	const expression = template.templateSpans[0]?.expression;
	return expression && ts.isIdentifier(expression) ? expression.text : null;
}

function lineForNode(sourceFile, node, lineOffset) {
	return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + lineOffset + 1;
}

function addViolation(violations, file, line, rule, message, remediation) {
	violations.push({ file, line, rule, message, remediation });
}

function auditSourceUnit({
	sourceFile,
	lineOffset,
	relativeFile,
	isDomainSource,
	isProductionSource,
	config,
	violations
}) {
	const importedNames = importedLocalNames(sourceFile);
	const reportedAliases = new Set();

	for (const statement of sourceFile.statements) {
		if (isProductionSource && ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
			addViolation(
				violations,
				relativeFile,
				lineForNode(sourceFile, statement, lineOffset),
				'no-forwarding-re-export',
				'Export declarations must not forward symbols from another module.',
				'Import the symbol directly from its definition at each consumer.'
			);
		} else if (
			isProductionSource &&
			ts.isExportDeclaration(statement) &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			const forwardedElements = statement.exportClause.elements.filter((element) =>
				importedNames.has((element.propertyName ?? element.name).text)
			);
			if (forwardedElements.length > 0) {
				addViolation(
					violations,
					relativeFile,
					lineForNode(sourceFile, statement, lineOffset),
					'no-forwarding-re-export',
					'An imported symbol is being exported through this module.',
					'Import the symbol directly from its definition at each consumer.'
				);
			}
		} else if (
			isProductionSource &&
			ts.isExportAssignment(statement) &&
			ts.isIdentifier(statement.expression) &&
			importedNames.has(statement.expression.text)
		) {
			addViolation(
				violations,
				relativeFile,
				lineForNode(sourceFile, statement, lineOffset),
				'no-forwarding-re-export',
				'An imported symbol is being exported as this module’s default.',
				'Import the symbol directly from its definition at each consumer.'
			);
		}

		if (isDomainSource) {
			for (const nameNode of exportedNames(statement)) {
				const remediation = config.prohibitedExportNames.get(nameNode.text);
				if (!remediation) continue;
				addViolation(
					violations,
					relativeFile,
					lineForNode(sourceFile, nameNode, lineOffset),
					'qualified-export-name',
					`Exported name "${nameNode.text}" is too generic for domain source.`,
					`Rename the export to ${remediation}.`
				);
			}
		}
	}

	function visit(node) {
		if (isDomainSource && ts.isIdentifier(node)) {
			const remediation = config.canonicalIdentifierAliases.get(node.text);
			if (remediation && !reportedAliases.has(node.text)) {
				reportedAliases.add(node.text);
				addViolation(
					violations,
					relativeFile,
					lineForNode(sourceFile, node, lineOffset),
					'canonical-terminology',
					`Identifier "${node.text}" is a retired or ambiguous domain alias.`,
					`Rename it: ${remediation}.`
				);
			}
		}

		// Keep this deliberately mechanical: empty messages and interpolation-first
		// templates are unsafe, while propagated variables and compound expressions are
		// outside the rule because their runtime prefixes cannot be proven from this node.
		if (isProductionSource && (ts.isNewExpression(node) || ts.isCallExpression(node))) {
			const constructor = node.expression;
			if (
				ts.isIdentifier(constructor) &&
				(constructor.text === 'Error' ||
					constructor.text === 'TypeError' ||
					constructor.text === 'RangeError')
			) {
				const argument = node.arguments?.[0];
				let isUnsearchable = !argument;
				let interpolationName = null;
				if (
					argument &&
					(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
				) {
					isUnsearchable = argument.text.trim().length === 0;
				} else if (argument && ts.isTemplateExpression(argument)) {
					isUnsearchable = argument.head.text.trim().length === 0;
					interpolationName = firstTemplateExpressionName(argument);
				}

				const allowedExpressions = config.errorPrefixAllowlist.get(relativeFile);
				const isAllowed =
					interpolationName !== null && allowedExpressions?.has(interpolationName) === true;
				if (isUnsearchable && !isAllowed) {
					addViolation(
						violations,
						relativeFile,
						lineForNode(sourceFile, node, lineOffset),
						'searchable-error-prefix',
						`${constructor.text} must begin with a non-empty static message prefix.`,
						'Put a stable subsystem or operation phrase before the first interpolation.'
					);
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
}

function localModuleSpecifiers(sourceFile) {
	const specifiers = [];
	function visit(node) {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			(node.moduleSpecifier.text.startsWith('.') || node.moduleSpecifier.text.startsWith('$lib/'))
		) {
			specifiers.push(node.moduleSpecifier.text);
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1 &&
			ts.isStringLiteral(node.arguments[0]) &&
			(node.arguments[0].text.startsWith('.') || node.arguments[0].text.startsWith('$lib/'))
		) {
			specifiers.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return specifiers;
}

function moduleCandidates(root, testFile, specifier) {
	const base = specifier.startsWith('$lib/')
		? resolve(root, 'src/lib', specifier.slice('$lib/'.length))
		: resolve(dirname(testFile), specifier);
	const extension = extname(base);
	const candidates = new Set([base]);

	if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') {
		const withoutExtension = base.slice(0, -extension.length);
		for (const sourceExtension of SOURCE_EXTENSIONS) {
			candidates.add(`${withoutExtension}${sourceExtension}`);
		}
	}
	if (!extension) {
		for (const sourceExtension of SOURCE_EXTENSIONS) {
			candidates.add(`${base}${sourceExtension}`);
			candidates.add(join(base, `index${sourceExtension}`));
		}
	}

	return candidates;
}

function testBaseName(filePath) {
	return filePath.split('/').at(-1).replace(TEST_FILE_PATTERN, '');
}

function sourceBaseName(filePath) {
	const fileName = filePath.split('/').at(-1);
	return fileName.slice(0, -extname(fileName).length);
}

function auditTestNames(root, files, violations) {
	const productionFiles = new Set(files.filter((file) => !isTestFile(file)));

	for (const testFile of files.filter(isTestFile)) {
		const relativeTestFile = normalizePath(relative(root, testFile));
		const testBase = testBaseName(relativeTestFile);
		const pairedSource = [...productionFiles].some(
			(sourceFile) =>
				dirname(sourceFile) === dirname(testFile) && sourceBaseName(sourceFile) === testBase
		);
		if (pairedSource) continue;

		const primarySources = new Set();
		for (const { sourceText } of sourceUnits(testFile)) {
			const sourceFile = ts.createSourceFile(
				testFile,
				sourceText,
				ts.ScriptTarget.Latest,
				true,
				scriptKindFor(testFile)
			);
			for (const specifier of localModuleSpecifiers(sourceFile)) {
				for (const candidate of moduleCandidates(root, testFile, specifier)) {
					if (productionFiles.has(candidate)) primarySources.add(candidate);
				}
			}
		}

		if (primarySources.size !== 1) continue;
		const [primarySource] = primarySources;
		const expectedBase = sourceBaseName(primarySource);
		if (testBase === expectedBase) continue;
		addViolation(
			violations,
			relativeTestFile,
			1,
			'paired-test-name',
			`This test imports only "${normalizePath(relative(root, primarySource))}" but is not named after it.`,
			`Rename the test to "${expectedBase}.test${extname(testFile)}" or test multiple primary sources.`
		);
	}
}

function auditActiveGuidance(root, files, config, violations) {
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			for (const retired of config.retiredGuidanceLiterals ?? []) {
				if (!line.includes(retired.literal)) continue;
				addViolation(
					violations,
					relativeFile,
					index + 1,
					'retired-active-guidance',
					`Active guidance contains retired literal "${retired.literal}".`,
					retired.replacement
				);
			}
		}
	}
}

function auditActiveGuidanceClaims(root, files, config, violations) {
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			for (const claim of config.activeGuidanceClaims ?? []) {
				if (!claim.pattern.test(line) || claim.allowPattern?.test(line)) continue;
				addViolation(
					violations,
					relativeFile,
					index + 1,
					claim.rule,
					claim.message,
					claim.remediation
				);
			}
		}
	}
}

function auditActiveGuidanceLinks(root, files, violations) {
	const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
	for (const filePath of files.filter((file) => extname(file) === '.md')) {
		const relativeFile = normalizePath(relative(root, filePath));
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			for (const match of line.matchAll(markdownLinkPattern)) {
				const rawTarget = match[1].trim().split(/\s+(?=["'])/, 1)[0];
				if (
					!rawTarget ||
					rawTarget.startsWith('#') ||
					rawTarget.startsWith('/') ||
					/^[a-z][a-z0-9+.-]*:/i.test(rawTarget) ||
					/[<>]/.test(rawTarget)
				) {
					continue;
				}
				const target = rawTarget.replace(/^<|>$/g, '').split(/[?#]/, 1)[0];
				if (!target) continue;
				let decodedTarget = target;
				try {
					decodedTarget = decodeURIComponent(target);
				} catch {
					// Leave malformed encoding to the missing-target diagnostic below.
				}
				if (existsSync(resolve(dirname(filePath), decodedTarget))) continue;
				addViolation(
					violations,
					relativeFile,
					index + 1,
					'broken-active-guidance-link',
					`Active guidance links to missing target "${rawTarget}".`,
					'Point the Markdown link at an existing repository file or remove the link.'
				);
			}
		}
	}
}

function auditBriefAcceptance(root, files, violations) {
	const registeredPackSlugs = new Set(readPackRegistrySlugsFromSource(root));
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		if (!relativeFile.startsWith('docs/briefs/')) continue;

		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		const packLineIndex = lines.findIndex((line) => /^\*\*Pack:\*\*\s+\S/.test(line.trim()));
		if (packLineIndex === -1) {
			addViolation(
				violations,
				relativeFile,
				1,
				'required-brief-pack',
				'Brief guidance does not declare the required Pack metadata field.',
				'Add **Pack:** with a slug from PACK_REGISTRY; there is no implicit default.'
			);
		} else if (relativeFile !== 'docs/briefs/README.md') {
			const pack = lines[packLineIndex].trim().replace(/^\*\*Pack:\*\*\s+/, '').trim();
			if (!registeredPackSlugs.has(pack)) {
				addViolation(
					violations,
					relativeFile,
					packLineIndex + 1,
					'unregistered-brief-pack',
					`Brief declares unregistered Pack "${pack}".`,
					'Use an exact slug from PACK_REGISTRY.'
				);
			}
		}
		const headingIndex = lines.findIndex((line) =>
			/^##\s+What\s+['’]done['’]\s+looks like\s*$/i.test(line.trim())
		);
		if (headingIndex === -1) continue;
		const nextHeadingOffset = lines
			.slice(headingIndex + 1)
			.findIndex((line) => /^##\s+/.test(line.trim()));
		const sectionEnd =
			nextHeadingOffset === -1 ? lines.length : headingIndex + 1 + nextHeadingOffset;
		const sectionLines = lines.slice(headingIndex + 1, sectionEnd);
		const section = sectionLines.join('\n');
		const hasHorizontalRequirement = /\bhorizontal\b|3840\s*[x×]\s*2160/i.test(section);
		const hasVerticalRequirement = /\bvertical\b|2160\s*[x×]\s*3840/i.test(section);
		if (hasHorizontalRequirement && hasVerticalRequirement) continue;

		const firstRequirementOffset = sectionLines.findIndex((line) =>
			/\b(?:horizontal|vertical)\b|(?:3840\s*[x×]\s*2160)|(?:2160\s*[x×]\s*3840)/i.test(
				line
			)
		);
		const missing = [
			!hasHorizontalRequirement ? 'horizontal' : null,
			!hasVerticalRequirement ? 'vertical' : null
		].filter(Boolean);
		addViolation(
			violations,
			relativeFile,
			headingIndex + 2 + Math.max(0, firstRequirementOffset),
			'orientation-neutral-brief-acceptance',
			`Brief acceptance does not explicitly require native ${missing.join(' and ')} render quality.`,
			'Require one Preset to pass at native horizontal and vertical resolutions without orientation-specific sibling Presets.'
		);
	}
}

function auditPresetListingHygiene(root, files, violations) {
	for (const filePath of files.filter((file) => file.endsWith('.json'))) {
		const relativeFile = normalizePath(relative(root, filePath));
		if (!relativeFile.startsWith('src/lib/presets/')) continue;
		const source = readFileSync(filePath, 'utf8');
		let preset;
		try {
			preset = JSON.parse(source);
		} catch {
			continue;
		}
		if (preset === null || typeof preset !== 'object' || Array.isArray(preset)) continue;
		const kind = preset.kind ?? 'deliverable';
		if (kind !== 'deliverable') continue;
		const slug = sourceBaseName(relativeFile);
		const kindIndex = source.indexOf('"kind"');
		const line = kindIndex === -1 ? 1 : source.slice(0, kindIndex).split(/\r?\n/).length;
		const name = typeof preset.name === 'string' ? preset.name : '';
		const description = typeof preset.description === 'string' ? preset.description : '';
		const pack = typeof preset.pack === 'string' ? preset.pack : '';

		if (/(?:-vertical|-horizontal)$/.test(slug)) {
			addViolation(
				violations,
				relativeFile,
				line,
				'orientation-duplicate-deliverable',
				'An orientation-suffix Preset is classified as a listed deliverable.',
				'Use one orientation-neutral deliverable; retain recomposition proofs only as kind: "fixture".'
			);
		}

		if (/\((?:horizontal|vertical)\)/i.test(name)) {
			addViolation(
				violations,
				relativeFile,
				line,
				'orientation-labeled-deliverable',
				'A listed deliverable advertises one transport orientation in its display name.',
				'Remove the orientation label; one deliverable must serve both targets.'
			);
		}

		const escapedPackTerms = [pack, ...pack.split('-')]
			.filter((term) => term.length >= 3)
			.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const hasPackFilename = escapedPackTerms.some((term) =>
			new RegExp(`-${term}(?:-|$)`, 'i').test(slug)
		);
		const hasPackSpecificDescription = escapedPackTerms.some(
			(term) =>
				new RegExp(
					`\\b(?:(?:authored|published)\\s+(?:specifically\\s+)?(?:for|under)|re-?dress(?:ed)?\\s+under)\\s+(?:the\\s+)?${term}\\b`,
					'i'
				).test(description) || new RegExp(`\\b${term}\\b[^.]{0,60}\\bpalette\\b`, 'i').test(description)
		);
		if (hasPackFilename || hasPackSpecificDescription) {
			addViolation(
				violations,
				relativeFile,
				line,
				'pack-redress-deliverable',
				'A Pack-specific Preset is classified as a listed deliverable.',
				'Use the Pack dial on one neutral deliverable; retain calibration re-dresses only as kind: "fixture".'
			);
		}
	}
}

function auditPresetAuthoringWorkflows(root, files, violations) {
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		if (relativeFile !== 'scripts/url-to-preset.mjs') continue;
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		const implicitPackLine = lines.findIndex((line) => /\bpack:\s*['"]syntax['"]/.test(line));
		if (implicitPackLine !== -1) {
			addViolation(
				violations,
				relativeFile,
				implicitPackLine + 1,
				'implicit-authoring-pack',
				'Preset authoring workflow hardcodes Syntax instead of requiring a Pack.',
				'Require and validate a Pack slug from PACK_REGISTRY.'
			);
		}
		const verticalFlagLine = lines.findIndex((line) => line.includes('--vertical'));
		if (verticalFlagLine !== -1) {
			addViolation(
				violations,
				relativeFile,
				verticalFlagLine + 1,
				'orientation-specific-preset-authoring',
				'Preset authoring workflow exposes a per-orientation output flag.',
				'Emit one unsuffixed Preset and use transport.orientation as a runtime dial.'
			);
		}
	}
}

function auditCurrentStatusGuidance(root, files, config, violations) {
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			for (const claim of config.staleCurrentStatusClaims ?? []) {
				if (!claim.pattern.test(line)) continue;
				addViolation(
					violations,
					relativeFile,
					index + 1,
					'stale-current-status',
					claim.message,
					claim.remediation
				);
			}
		}
	}
}

function auditHistoricalIdeaStatus(root, config, violations) {
	for (const requirement of config.historicalIdeaStatusRequirements ?? []) {
		const filePath = resolve(root, requirement.file);
		if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
		const source = readFileSync(filePath, 'utf8');
		if (requirement.pattern.test(source)) continue;
		addViolation(
			violations,
			requirement.file,
			1,
			'unmarked-historical-idea',
			requirement.message,
			requirement.remediation
		);
	}
}

function auditCurrentProtocols(root, files, config, violations) {
	for (const filePath of files) {
		const relativeFile = normalizePath(relative(root, filePath));
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			const reportedCategories = new Set();
			for (const retired of config.retiredCurrentProtocolLiterals ?? []) {
				if (!line.includes(retired.literal)) continue;
				if (retired.category && reportedCategories.has(retired.category)) continue;
				if (retired.category) reportedCategories.add(retired.category);
				addViolation(
					violations,
					relativeFile,
					index + 1,
					'retired-current-protocol',
					`Current source or guidance contains retired protocol literal "${retired.literal}".`,
					retired.replacement
				);
			}
		}
	}
}

export function auditDiscoverability({
	root = process.cwd(),
	config = DISCOVERABILITY_CONFIG
} = {}) {
	const absoluteRoot = resolve(root);
	const files = collectSourceFiles(absoluteRoot, config.sourceRoots);
	const guidanceFiles = collectActiveGuidanceFiles(absoluteRoot, config);
	const currentStatusFiles = collectExistingFiles(
		absoluteRoot,
		config.currentStatusGuidanceFiles
	);
	const violations = [];

	for (const filePath of files) {
		const relativeFile = normalizePath(relative(absoluteRoot, filePath));
		const productionSource = !isTestFile(filePath) && !filePath.endsWith('.d.ts');
		const domainSource = productionSource && isUnderRoot(relativeFile, config.domainExportRoots);
		for (const { sourceText, lineOffset } of sourceUnits(filePath)) {
			const sourceFile = ts.createSourceFile(
				filePath,
				sourceText,
				ts.ScriptTarget.Latest,
				true,
				scriptKindFor(filePath)
			);
			auditSourceUnit({
				sourceFile,
				lineOffset,
				relativeFile,
				isDomainSource: domainSource,
				isProductionSource: productionSource,
				config,
				violations
			});
		}
	}

	auditTestNames(absoluteRoot, files, violations);
	auditActiveGuidance(absoluteRoot, guidanceFiles, config, violations);
	auditActiveGuidanceClaims(absoluteRoot, guidanceFiles, config, violations);
	auditActiveGuidanceLinks(absoluteRoot, guidanceFiles, violations);
	auditBriefAcceptance(absoluteRoot, guidanceFiles, violations);
	auditPresetListingHygiene(absoluteRoot, guidanceFiles, violations);
	auditPresetAuthoringWorkflows(absoluteRoot, guidanceFiles, violations);
	auditCurrentStatusGuidance(absoluteRoot, currentStatusFiles, config, violations);
	auditHistoricalIdeaStatus(absoluteRoot, config, violations);
	auditCurrentProtocols(
		absoluteRoot,
		[...new Set([...files, ...guidanceFiles])],
		config,
		violations
	);
	violations.sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)
	);
	return { filesChecked: files.length, guidanceFilesChecked: guidanceFiles.length, violations };
}

export function formatDiscoverabilityViolation(violation) {
	return `${violation.file}:${violation.line}: [${violation.rule}] ${violation.message} Remediation: ${violation.remediation}`;
}

function run() {
	const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
	const result = auditDiscoverability({ root });
	if (result.violations.length > 0) {
		for (const violation of result.violations) {
			console.error(formatDiscoverabilityViolation(violation));
		}
		console.error(`discoverability: ${result.violations.length} violation(s)`);
		process.exitCode = 1;
		return;
	}
	console.log(
		`discoverability: ${result.filesChecked} source files and ${result.guidanceFilesChecked} active guidance files passed`
	);
}

const isDirectInvocation =
	process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectInvocation) run();
