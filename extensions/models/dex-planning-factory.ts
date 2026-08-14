/**
 * Swamp model entrypoint for compiling human-gated Dex Planning Factories.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  CompiledDexPlanningFactoryProfileSchema,
  DEX_PLANNING_FACTORY_VERSION,
  DexPlanningFactoryPlatformArgsSchema,
  executeDexPlanningFactoryCompile,
} from "./dex-planning-factory-compiler.ts";
import type { DexPlanningFactoryMethodContext } from "./dex-planning-factory-compiler.ts";

const CompileArgsSchema = z.object({});

/** Model definition for deterministic portable Planning Factory compilation. */
export const model = {
  type: "@club_aqua_back_deck/dex-planning-factory",
  version: DEX_PLANNING_FACTORY_VERSION,
  globalArguments: DexPlanningFactoryPlatformArgsSchema,
  resources: {
    profile: {
      description:
        "Compiled arguments to materialize in an @swamp/software-factory definition",
      schema: CompiledDexPlanningFactoryProfileSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    compile: {
      description:
        "Compile the configured planning profile into Factory global arguments",
      arguments: CompileArgsSchema,
      execute: (
        args: Record<string, never>,
        context: DexPlanningFactoryMethodContext,
      ) => executeDexPlanningFactoryCompile(args, context),
    },
  },
};
