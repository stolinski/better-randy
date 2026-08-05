import { parse, stringify } from 'jsr:@std/yaml@1.0.10';
import { z } from 'npm:zod@4';

const CompiledProfileResourceSchema = z.object({
	content: z.object({
		target: z.strictObject({
			type: z.literal('@swamp/software-factory'),
			version: z.string().min(1)
		}),
		factoryArguments: z.strictObject({
			stages: z.array(z.record(z.string(), z.unknown())).min(1),
			globalTransitions: z.array(z.record(z.string(), z.unknown()))
		})
	})
});

const FactoryDefinitionSchema = z
	.object({
		type: z.literal('@swamp/software-factory'),
		typeVersion: z.union([z.string(), z.number()]),
		version: z.number().int().positive(),
		globalArguments: z.record(z.string(), z.unknown())
	})
	.passthrough();

type CompiledProfileResource = z.infer<typeof CompiledProfileResourceSchema>;
type FactoryDefinition = z.infer<typeof FactoryDefinitionSchema>;

export type FactoryMaterializationResult = {
	changed: boolean;
	definition: FactoryDefinition;
};

/** Materialize compiled arguments without changing unrelated definition fields. */
export function materializeDexSoftwareFactoryDefinition(
	definitionInput: unknown,
	compiledInput: unknown
): FactoryMaterializationResult {
	const definition = FactoryDefinitionSchema.parse(definitionInput);
	const compiled = CompiledProfileResourceSchema.parse(compiledInput);
	if (String(definition.typeVersion) !== compiled.content.target.version) {
		throw new Error(
			`Factory target mismatch: definition uses ${definition.typeVersion}, compiled profile targets ${compiled.content.target.version}`
		);
	}

	const nextArguments = compiled.content.factoryArguments;
	if (JSON.stringify(definition.globalArguments) === JSON.stringify(nextArguments)) {
		return { changed: false, definition };
	}

	return {
		changed: true,
		definition: {
			...definition,
			version: definition.version + 1,
			globalArguments: nextArguments
		}
	};
}

async function readCompiledProfile(profileModel: string): Promise<CompiledProfileResource> {
	const result = await new Deno.Command('swamp', {
		args: ['data', 'get', profileModel, 'compiled-profile', '--json'],
		stdout: 'piped',
		stderr: 'piped'
	}).output();
	if (!result.success) {
		throw new Error(
			new TextDecoder().decode(result.stderr).trim() || 'Could not read compiled profile'
		);
	}
	return CompiledProfileResourceSchema.parse(JSON.parse(new TextDecoder().decode(result.stdout)));
}

async function materializeFactory(profileModel: string, definitionPath: string): Promise<void> {
	const compiled = await readCompiledProfile(profileModel);
	const source = await Deno.readTextFile(definitionPath);
	const materialized = materializeDexSoftwareFactoryDefinition(parse(source), compiled);
	if (!materialized.changed) {
		console.log(`Factory definition already matches ${profileModel}`);
		return;
	}

	const temporaryPath = `${definitionPath}.tmp`;
	await Deno.writeTextFile(temporaryPath, stringify(materialized.definition, { lineWidth: 100 }));
	await Deno.rename(temporaryPath, definitionPath);
	console.log(
		`Materialized ${profileModel} into ${definitionPath} at definition v${materialized.definition.version}`
	);
}

if (import.meta.main) {
	const [profileModel, definitionPath] = Deno.args;
	if (profileModel === undefined || definitionPath === undefined) {
		throw new Error(
			'Usage: deno run --allow-run --allow-read --allow-write scripts/materialize-dex-software-factory.ts <profile-model> <factory-definition-path>'
		);
	}

	await materializeFactory(profileModel, definitionPath);
}
