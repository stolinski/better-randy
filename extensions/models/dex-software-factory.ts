/**
 * Swamp model entrypoint for compiling Dex-backed software Factory profiles.
 *
 * @module
 */
import { z } from 'npm:zod@4';

import {
	CompiledDexSoftwareFactoryProfileSchema,
	DEX_SOFTWARE_FACTORY_VERSION,
	DexSoftwareFactoryPlatformArgsSchema,
	executeDexSoftwareFactoryCompile
} from './dex-software-factory-compiler.ts';
import type { DexSoftwareFactoryMethodContext } from './dex-software-factory-compiler.ts';

const CompileArgsSchema = z.object({});

/** Model definition for deterministic portable Factory profile compilation. */
export const model = {
	type: '@club_aqua_back_deck/dex-software-factory',
	version: DEX_SOFTWARE_FACTORY_VERSION,
	globalArguments: DexSoftwareFactoryPlatformArgsSchema,
	resources: {
		profile: {
			description: 'Compiled arguments to materialize in an @swamp/software-factory definition',
			schema: CompiledDexSoftwareFactoryProfileSchema,
			lifetime: 'infinite',
			garbageCollection: 10
		}
	},
	methods: {
		compile: {
			description: 'Compile the configured portable profile into Factory global arguments',
			arguments: CompileArgsSchema,
			execute: (args: Record<string, never>, context: DexSoftwareFactoryMethodContext) =>
				executeDexSoftwareFactoryCompile(args, context)
		}
	}
};
