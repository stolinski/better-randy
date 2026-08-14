import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'jsr:@std/yaml@1.0.10';

type JsonObject = Record<string, unknown>;

type CommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ROOT = join(REPOSITORY_ROOT, 'extensions/packages/dex-planning-factory');
const MANIFEST_PATH = join(PACKAGE_ROOT, 'manifest.yaml');
const PROFILE_PATH = join(PACKAGE_ROOT, 'examples/profile.json');
const MODEL_SOURCE_ROOT = join(REPOSITORY_ROOT, 'extensions/models');
const PROFILE_MODEL = 'clean-consumer-planning-profile';
const FORBIDDEN_PORTABILITY_TEXT = [
	'/Users/',
	'better-randy',
	'Better Randy',
	'Supers',
	'supers'
] as const;

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	stdin?: string
): Promise<CommandResult> {
	const child = new Deno.Command(command, {
		args,
		cwd,
		stdin: stdin === undefined ? 'null' : 'piped',
		stdout: 'piped',
		stderr: 'piped',
		env: { NO_COLOR: '1' }
	}).spawn();
	if (stdin !== undefined) {
		const writer = child.stdin.getWriter();
		try {
			await writer.write(new TextEncoder().encode(stdin));
		} finally {
			await writer.close();
		}
	}
	const output = await child.output();
	const result = {
		code: output.code,
		stdout: new TextDecoder().decode(output.stdout),
		stderr: new TextDecoder().decode(output.stderr)
	};
	if (result.code !== 0) {
		assert.fail(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
	}
	return result;
}

function parseObject(value: string): JsonObject {
	const parsed: unknown = JSON.parse(value);
	assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
	return parsed as JsonObject;
}

async function createPackagedExtensionSource(repository: string): Promise<string> {
	const extensionRoot = join(repository, 'installed-planning-extension');
	const modelsDirectory = join(extensionRoot, 'extensions/models');
	await Deno.mkdir(modelsDirectory, { recursive: true });

	const manifest = parse(await Deno.readTextFile(MANIFEST_PATH));
	assert.ok(manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest));
	const packageManifest = manifest as JsonObject;
	assert.equal(packageManifest.name, '@club_aqua_back_deck/dex-planning-factory');
	assert.equal(packageManifest.version, '2026.08.07.1');
	assert.deepEqual(packageManifest.models, ['dex-planning-factory.ts']);
	assert.deepEqual(packageManifest.dependencies, [
		'@swamp/software-factory',
		'@club_aqua_back_deck/dex-plan-applier'
	]);

	for (const file of ['dex-planning-factory.ts', 'dex-planning-factory-compiler.ts']) {
		await Deno.copyFile(join(MODEL_SOURCE_ROOT, file), join(modelsDirectory, file));
	}
	return extensionRoot;
}

async function createProfileModel(repository: string, profile: JsonObject): Promise<void> {
	const result = await runCommand(
		'swamp',
		['model', 'create', '@club_aqua_back_deck/dex-planning-factory', PROFILE_MODEL, '--json'],
		repository
	);
	const created = parseObject(result.stdout);
	assert.equal(typeof created.path, 'string');
	const definitionPath = created.path as string;
	const definition = parse(await Deno.readTextFile(definitionPath));
	assert.ok(definition !== null && typeof definition === 'object' && !Array.isArray(definition));
	(definition as JsonObject).globalArguments = profile;
	await Deno.writeTextFile(definitionPath, stringify(definition, { lineWidth: 100 }));
}

async function assertPortableConsumerTree(repository: string): Promise<void> {
	for await (const entry of Deno.readDir(repository)) {
		await assertPortableEntry(join(repository, entry.name));
	}
}

async function assertPortableEntry(path: string): Promise<void> {
	const info = await Deno.lstat(path);
	if (info.isDirectory) {
		for await (const entry of Deno.readDir(path)) {
			await assertPortableEntry(join(path, entry.name));
		}
		return;
	}
	if (!info.isFile || path.includes('/.git/')) return;
	const content = await Deno.readTextFile(path);
	for (const forbidden of FORBIDDEN_PORTABILITY_TEXT) {
		assert.equal(
			content.includes(forbidden),
			false,
			`Clean consumer file ${path} contains forbidden source text ${forbidden}`
		);
	}
}

Deno.test({
	name: 'packaged Planning Factory installs, validates, and compiles in a clean consumer',
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		const repository = await Deno.makeTempDir({ prefix: 'dex-planning-factory-consumer-' });
		try {
			await runCommand('git', ['init'], repository);
			await runCommand('swamp', ['init', '.', '--tool', 'none', '--json'], repository);
			const extensionRoot = await createPackagedExtensionSource(repository);
			await runCommand(
				'swamp',
				['extension', 'source', 'add', extensionRoot, '--only', 'models', '--json'],
				repository
			);

			const profile = parseObject(await Deno.readTextFile(PROFILE_PATH));
			await createProfileModel(repository, profile);
			await runCommand('swamp', ['model', 'validate', PROFILE_MODEL, '--json'], repository);
			await runCommand('swamp', ['model', 'method', 'run', PROFILE_MODEL, 'compile'], repository);
			const compiledResult = await runCommand(
				'swamp',
				['data', 'get', PROFILE_MODEL, 'compiled-profile', '--json'],
				repository
			);
			const compiled = parseObject(compiledResult.stdout);
			const attributes = compiled.content as JsonObject;
			assert.equal(attributes.compilerVersion, '2026.08.07.1');
			assert.deepEqual(attributes.target, {
				type: '@swamp/software-factory',
				version: '2026.06.24.1'
			});
			assert.equal(attributes.profileName, 'portable-planning');
			await assertPortableConsumerTree(repository);
		} finally {
			if (Deno.env.get('KEEP_PLANNING_PORTABILITY_FIXTURE') === undefined) {
				await Deno.remove(repository, { recursive: true });
			} else {
				console.log(`Kept portability fixture at ${repository}`);
			}
		}
	}
});
