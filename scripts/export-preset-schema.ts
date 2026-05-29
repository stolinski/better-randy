import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const schemaModulePath = resolve(repoRoot, 'src/lib/platform/engine-schema.ts');

const { PresetSchema, PRESET_SCHEMA_ID } = (await import(
	pathToFileURL(schemaModulePath).href
)) as {
	PresetSchema: z.ZodTypeAny;
	PRESET_SCHEMA_ID: string;
};

const jsonSchema = z.toJSONSchema(PresetSchema, {
	target: 'draft-2020-12',
	io: 'input'
});

const outputPath = resolve(repoRoot, 'docs/preset-format.schema.json');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
	outputPath,
	`${JSON.stringify({ $id: PRESET_SCHEMA_ID, ...jsonSchema }, null, 2)}\n`,
	'utf8'
);

console.log(`Wrote ${outputPath}`);
