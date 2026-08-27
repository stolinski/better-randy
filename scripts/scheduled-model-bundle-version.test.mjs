import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = process.cwd();
const scheduledModels = [
	{
		source: 'extensions/models/sentry-issue-intake.ts',
		definition:
			'models/@supers/sentry-issue-intake/97e8375f-5908-482d-846e-2a5b037ae9cf.yaml'
	},
	{
		source: 'extensions/models/sentry-reproduction-transport-controller.ts',
		definition:
			'models/@supers/sentry-reproduction-transport-controller/supers-sentry-reproduction-transport.yaml'
	}
];

function git(args) {
	return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function modelVersion(source) {
	const match = source.match(/export const model\s*=\s*\{[\s\S]*?version:\s*["']([^"']+)["']/);
	assert.ok(match, 'scheduled model source must declare a literal model version');
	return match[1];
}

function definitionTypeVersion(source) {
	const match = source.match(/^typeVersion:\s*["']?([^"'\n]+?)["']?\s*$/m);
	assert.ok(match, 'scheduled model definition must declare typeVersion');
	return match[1];
}

function localImportClosure(entry) {
	const pending = [entry];
	const closure = new Set();
	while (pending.length > 0) {
		const path = pending.pop();
		if (!path || closure.has(path)) continue;
		closure.add(path);
		const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
		for (const match of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
			const imported = relative(
				repositoryRoot,
				resolve(repositoryRoot, dirname(path), match[1])
			).replaceAll('\\', '/');
			if (imported.startsWith('extensions/models/') && imported.endsWith('.ts')) {
				pending.push(imported);
			}
		}
	}
	return closure;
}

function changedPaths(base, head = undefined) {
	try {
		return new Set(
			git(['diff', '--name-only', ...(head ? [base, head] : [base])])
				.split('\n')
				.filter(Boolean)
		);
	} catch {
		return new Set();
	}
}

function sourceAt(ref, path) {
	return git(['show', `${ref}:${path}`]);
}

test('scheduled local model bundles advance when their imported source closure changes', () => {
	const workingChanges = changedPaths('HEAD');
	const committedChanges = changedPaths('HEAD^', 'HEAD');
	for (const scheduledModel of scheduledModels) {
		const source = readFileSync(resolve(repositoryRoot, scheduledModel.source), 'utf8');
		const version = modelVersion(source);
		const definition = readFileSync(resolve(repositoryRoot, scheduledModel.definition), 'utf8');
		assert.equal(
			definitionTypeVersion(definition),
			version,
			`${scheduledModel.definition} must select the source model version`
		);

		const closure = localImportClosure(scheduledModel.source);
		const hasWorkingChange = [...closure].some((path) => workingChanges.has(path));
		const hasCommittedChange = [...closure].some((path) => committedChanges.has(path));
		if (!hasWorkingChange && !hasCommittedChange) continue;
		const baseline = hasWorkingChange ? 'HEAD' : 'HEAD^';
		assert.notEqual(
			version,
			modelVersion(sourceAt(baseline, scheduledModel.source)),
			`${scheduledModel.source} must advance its version when bundled imports change`
		);
	}
});
