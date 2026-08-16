/**
 * Typed compiler for a portable Dex-backed @swamp/software-factory profile.
 *
 * Repository-specific policy stays behind named workflow/method adapters. The
 * compiler owns the lifecycle, artifact contracts, bounded retries, routing,
 * review gates, and terminal Dex completion ordering.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

export const DEX_SOFTWARE_FACTORY_VERSION = "2026.08.16.1";
const SOFTWARE_FACTORY_TARGET_VERSION = "2026.06.24.1";

const FACTORY_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
const GIT_SHA_PATTERN = "^[0-9a-fA-F]{7,40}$";
const CEL_WORK_ITEM = "${{ self.workItem }}";
const COMPLETION_RESULT_BINDING =
  '${{ data.latest(self.name, "artifact-reconciliation").payload.completionResult }}';
const COMPLETION_COMMIT_BINDING =
  '${{ data.latest(self.name, "artifact-reconciliation").payload.commit }}';

const FactoryNameSchema = z.string().regex(FACTORY_NAME_PATTERN);

type FactoryDeclaredSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, FactoryDeclaredSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: FactoryDeclaredSchema;
  enum?: Array<string | number>;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

const FactoryDeclaredSchemaSchema: z.ZodType<FactoryDeclaredSchema> = z.lazy(
  () =>
    z.strictObject({
      type: z.enum([
        "object",
        "array",
        "string",
        "number",
        "integer",
        "boolean",
      ]),
      description: z.string().optional(),
      properties: z.record(z.string(), FactoryDeclaredSchemaSchema).optional(),
      required: z.array(z.string()).optional(),
      additionalProperties: z.boolean().optional(),
      items: FactoryDeclaredSchemaSchema.optional(),
      enum: z.array(z.union([z.string(), z.number()])).optional(),
      pattern: z.string().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minItems: z.number().int().nonnegative().optional(),
      maxItems: z.number().int().nonnegative().optional(),
    }),
);

const AdapterInputsSchema = z
  .strictObject({
    values: z.record(z.string(), z.unknown()),
    properties: z.record(z.string(), FactoryDeclaredSchemaSchema),
    required: z.array(z.string()).optional(),
  })
  .superRefine((inputs, context) => {
    if ("workItem" in inputs.values || "workItem" in inputs.properties) {
      context.addIssue({
        code: "custom",
        message: "workItem is compiler-owned and cannot be overridden",
      });
    }
    for (const key of Object.keys(inputs.values)) {
      if (!(key in inputs.properties)) {
        context.addIssue({
          code: "custom",
          message: `input '${key}' requires a declared schema`,
          path: ["properties", key],
        });
      }
    }
    for (const key of inputs.required ?? []) {
      if (!(key in inputs.properties)) {
        context.addIssue({
          code: "custom",
          message: `required input '${key}' has no declared schema`,
          path: ["required"],
        });
      }
    }
  });

const WorkflowAdapterSchema = z.strictObject({
  mode: z.literal("workflow"),
  workflow: z.string().min(1),
  inputs: AdapterInputsSchema.optional(),
});

const MethodAdapterSchema = z.strictObject({
  mode: z.literal("method"),
  modelIdOrName: z.string().min(1),
  methodName: z.string().min(1),
  inputs: AdapterInputsSchema.optional(),
});

const ExecutableAdapterSchema = z.discriminatedUnion("mode", [
  WorkflowAdapterSchema,
  MethodAdapterSchema,
]);

const InteractiveWorkSchema = z.strictObject({
  mode: z.literal("interactive"),
  skills: z.array(z.string().min(1)).optional(),
  systemPrompt: z.string().min(1),
  constraints: z.string().min(1).optional(),
});

const VerificationAdapterSchema = z.discriminatedUnion("mode", [
  InteractiveWorkSchema,
  WorkflowAdapterSchema,
  MethodAdapterSchema,
]);

const ArtifactExtensionSchema = z
  .strictObject({
    properties: z.record(z.string(), FactoryDeclaredSchemaSchema),
    required: z.array(z.string()).optional(),
  })
  .superRefine((extension, context) => {
    for (const key of extension.required ?? []) {
      if (!(key in extension.properties)) {
        context.addIssue({
          code: "custom",
          message: `required artifact property '${key}' has no declared schema`,
          path: ["required"],
        });
      }
    }
  });

const ReviewAdapterSchema = z.strictObject({
  skills: z.array(z.string().min(1)).min(1),
  systemPrompt: z.string().min(1),
  blockingSeverities: z.array(z.enum(["critical", "high", "medium", "low"]))
    .min(1),
  findingsArtifactName: FactoryNameSchema.optional(),
  verdictArtifactName: FactoryNameSchema.optional(),
  reworkCondition: z.string().min(1).optional(),
  acceptCondition: z.string().min(1).optional(),
});

const HumanGateSchema = z.strictObject({
  id: FactoryNameSchema,
  minApprovals: z.number().int().positive().optional(),
});

const ClosedObjectiveRoutingSchema = z.strictObject({
  mode: z.literal("closed-objective"),
  unavailableStage: z.literal("evidence-unavailable"),
  aestheticGateId: z.literal("aesthetic-acceptance"),
  aestheticDecisionAdapter: z.strictObject({
    mode: z.literal("workflow"),
    workflow: FactoryNameSchema,
  }),
});

const LegacyVerificationRoutingSchema = z.strictObject({
  reworkCondition: z.string().min(1).optional(),
  reviewCondition: z.string().min(1).optional(),
  reconcileCondition: z.string().min(1).optional(),
});

const CycleBudgetsSchema = z.strictObject({
  implementation: z.number().int().positive().max(20),
  verification: z.number().int().positive().max(20),
  review: z.number().int().positive().max(20),
  reconciliation: z.number().int().positive().max(20),
  maxDispatchesPerCycle: z.number().int().positive().max(5),
});

/** Consumer-owned adapters and prompts for one portable delivery profile. */
export const DexSoftwareFactoryProfileSchema = z
  .strictObject({
    profileName: FactoryNameSchema,
    adapters: z.strictObject({
      preflight: ExecutableAdapterSchema,
      classify: ExecutableAdapterSchema,
      verification: VerificationAdapterSchema,
      postflight: ExecutableAdapterSchema,
      terminalObserver: z.strictObject({
        workflow: FactoryNameSchema,
      }).optional(),
      dexTracker: z.strictObject({
        modelIdOrName: z.string().min(1),
        completeMethodName: z.string().min(1),
        completionWorkflow: FactoryNameSchema.optional(),
      }),
    }),
    implementation: InteractiveWorkSchema.omit({ mode: true }),
    review: ReviewAdapterSchema.optional(),
    humanGate: HumanGateSchema.optional(),
    completionGate: HumanGateSchema.optional(),
    contracts: z
      .strictObject({
        changeSummary: ArtifactExtensionSchema.optional(),
        changeImpact: ArtifactExtensionSchema.optional(),
        verification: ArtifactExtensionSchema.optional(),
        reviewVerdict: ArtifactExtensionSchema.optional(),
        reconciliation: ArtifactExtensionSchema.optional(),
      })
      .optional(),
    verificationRouting: z
      .union([ClosedObjectiveRoutingSchema, LegacyVerificationRoutingSchema])
      .optional(),
    budgets: CycleBudgetsSchema,
  })
  .superRefine((profile, context) => {
    if (
      profile.verificationRouting !== undefined &&
      "mode" in profile.verificationRouting &&
      profile.verificationRouting.mode === "closed-objective"
    ) {
      if (profile.review !== undefined || profile.humanGate !== undefined) {
        context.addIssue({
          code: "custom",
          message:
            "closed-objective routing cannot use review or legacy humanGate",
          path: ["verificationRouting"],
        });
      }
      if (profile.adapters.verification.mode !== "workflow") {
        context.addIssue({
          code: "custom",
          message:
            "closed-objective routing requires a correlated verification workflow",
          path: ["adapters", "verification"],
        });
      }
    }
    if (
      profile.completionGate !== undefined &&
      profile.adapters.dexTracker.completionWorkflow === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "completionGate requires adapters.dexTracker.completionWorkflow",
        path: ["adapters", "dexTracker", "completionWorkflow"],
      });
    }
    const reservedProperties = {
      changeSummary: ["summary"],
      changeImpact: ["requiredLanes", "reviewCandidate", "changeFingerprint"],
      verification: [
        "status",
        "executedLanes",
        "reviewRequired",
        "nextStep",
        "summary",
        "disposition",
        "objectiveFailureCodes",
        "unavailableEvidenceCodes",
      ],
      reviewVerdict: ["status", "summary"],
      reconciliation: [
        "status",
        "nextStep",
        "summary",
        "completionResult",
        "commit",
      ],
    } as const;
    for (const [contractName, reserved] of Object.entries(reservedProperties)) {
      const extension = profile.contracts
        ?.[contractName as keyof typeof reservedProperties];
      for (const key of reserved) {
        if (extension !== undefined && key in extension.properties) {
          context.addIssue({
            code: "custom",
            message:
              `artifact extension cannot override compiler-owned property '${key}'`,
            path: ["contracts", contractName, "properties", key],
          });
        }
      }
    }
  });

export type DexSoftwareFactoryProfile = z.infer<
  typeof DexSoftwareFactoryProfileSchema
>;

// CEL inside adapter inputs belongs to the generated Factory stage. The
// platform-facing schema therefore stays lenient; compile reparses the raw
// definition with DexSoftwareFactoryProfileSchema before producing output.
export const DexSoftwareFactoryPlatformArgsSchema = z.object({
  profileName: FactoryNameSchema.optional(),
  adapters: z.unknown().optional(),
  implementation: z.unknown().optional(),
  review: z.unknown().optional(),
  humanGate: z.unknown().optional(),
  completionGate: z.unknown().optional(),
  contracts: z.unknown().optional(),
  verificationRouting: z.unknown().optional(),
  budgets: z.unknown().optional(),
});

const FactoryArgumentsOutputSchema = z.strictObject({
  stages: z.array(z.record(z.string(), z.unknown())).min(1),
  globalTransitions: z.array(z.record(z.string(), z.unknown())),
});

/** Versioned compilation result consumed by a Factory definition through CEL. */
export const CompiledDexSoftwareFactoryProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  compilerVersion: z.literal(DEX_SOFTWARE_FACTORY_VERSION),
  profileName: FactoryNameSchema,
  target: z.strictObject({
    type: z.literal("@swamp/software-factory"),
    version: z.literal(SOFTWARE_FACTORY_TARGET_VERSION),
  }),
  factoryArguments: FactoryArgumentsOutputSchema,
});

export type CompiledDexSoftwareFactoryProfile = z.infer<
  typeof CompiledDexSoftwareFactoryProfileSchema
>;

export type DexSoftwareFactoryMethodContext = {
  globalArgs: Record<string, unknown>;
  modelType?: unknown;
  modelId?: string;
  definitionRepository?: {
    findById: (
      modelType: unknown,
      id: string,
    ) => Promise<{ globalArguments: Record<string, unknown> } | null>;
  };
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export type DexSoftwareFactoryExecutionResult = {
  dataHandles: Array<{ name: string }>;
};

type ExecutableAdapter = z.infer<typeof ExecutableAdapterSchema>;
type VerificationAdapter = z.infer<typeof VerificationAdapterSchema>;
type ArtifactExtension = z.infer<typeof ArtifactExtensionSchema>;
type FactoryStage = Record<string, unknown>;
type FactoryGate = Record<string, unknown>;

const STRING_SCHEMA = {
  type: "string",
  minLength: 1,
} satisfies FactoryDeclaredSchema;

function artifactExists(artifact: string): FactoryGate {
  return { type: "artifact-exists", config: { artifact } };
}

function artifactFresh(artifact: string): FactoryGate {
  return {
    type: "artifact-fresh",
    config: { artifact, recordedThisCycle: true },
  };
}

function celGate(expr: string, message: string): FactoryGate {
  return { type: "cel", config: { expr, message } };
}

function andCondition(base: string, condition: string | undefined): string {
  return condition === undefined ? base : `(${base}) && (${condition})`;
}

function isClosedObjectiveRouting(profile: DexSoftwareFactoryProfile): boolean {
  return (
    profile.verificationRouting !== undefined &&
    "mode" in profile.verificationRouting &&
    profile.verificationRouting.mode === "closed-objective"
  );
}

function legacyRouting(
  profile: DexSoftwareFactoryProfile,
): z.infer<typeof LegacyVerificationRoutingSchema> | undefined {
  const routing = profile.verificationRouting;
  return routing !== undefined && !("mode" in routing) ? routing : undefined;
}

function humanApprovalGate(
  humanGate: z.infer<typeof HumanGateSchema> | undefined,
): FactoryGate | null {
  if (humanGate === undefined) return null;
  return {
    type: "human-approval",
    config: {
      id: humanGate.id,
      ...(humanGate.minApprovals === undefined
        ? {}
        : { minApprovals: humanGate.minApprovals }),
    },
  };
}

function humanRejectionGate(
  humanGate: z.infer<typeof HumanGateSchema>,
): FactoryGate {
  const approvalName = humanGate.id.replaceAll("-", "_");
  return celGate(
    `has(approvals.${approvalName}) && approvals.${approvalName}.exists(approval, approval.decision == "rejected")`,
    `human revision requires an explicit ${humanGate.id} rejection`,
  );
}

function adapterInputs(adapter: ExecutableAdapter): {
  inputs: Record<string, unknown>;
  inputsSchema: FactoryDeclaredSchema;
} {
  const configured = adapter.inputs;
  return {
    inputs: { workItem: CEL_WORK_ITEM, ...(configured?.values ?? {}) },
    inputsSchema: {
      type: "object",
      properties: {
        workItem: STRING_SCHEMA,
        ...(configured?.properties ?? {}),
      },
      required: ["workItem", ...(configured?.required ?? [])],
      additionalProperties: false,
    },
  };
}

function adapterWork(
  adapter: ExecutableAdapter,
  resultEvidence: string,
): Record<string, unknown> {
  const contract = adapterInputs(adapter);
  if (adapter.mode === "workflow") {
    return {
      mode: "workflow",
      workflow: { name: adapter.workflow, inputs: contract.inputs },
      inputsSchema: contract.inputsSchema,
      resultEvidence,
    };
  }
  return {
    mode: "method",
    method: {
      modelIdOrName: adapter.modelIdOrName,
      methodName: adapter.methodName,
      inputs: contract.inputs,
    },
    inputsSchema: contract.inputsSchema,
    resultEvidence,
  };
}

function adapterSucceededGate(
  adapter: ExecutableAdapter,
  resultEvidence: string,
  requiredStepOutputs: string[],
): FactoryGate {
  if (adapter.mode === "workflow") {
    return {
      type: "workflow-succeeded",
      config: {
        workflow: adapter.workflow,
        requireStepOutputs: requiredStepOutputs,
      },
    };
  }
  return {
    type: "evidence-recorded",
    config: { name: resultEvidence, requireField: { status: "succeeded" } },
  };
}

function interactiveWork(
  work: z.infer<typeof InteractiveWorkSchema>,
): Record<string, unknown> {
  return {
    mode: "interactive",
    ...(work.skills === undefined ? {} : { skills: work.skills }),
    systemPrompt: work.systemPrompt,
    ...(work.constraints === undefined
      ? {}
      : { constraints: work.constraints }),
  };
}

function verificationWork(
  adapter: VerificationAdapter,
): Record<string, unknown> {
  return adapter.mode === "interactive"
    ? interactiveWork(adapter)
    : adapterWork(adapter, "verification-run");
}

function verificationSucceededGate(
  adapter: VerificationAdapter,
): FactoryGate | null {
  return adapter.mode === "interactive"
    ? null
    : adapterSucceededGate(adapter, "verification-run", [
      "artifact-verification",
      "evidence-verification-run",
    ]);
}

function compactGates(gates: Array<FactoryGate | null>): FactoryGate[] {
  return gates.filter((gate): gate is FactoryGate => gate !== null);
}

function extendedArtifactSchema(
  required: string[],
  properties: Record<string, FactoryDeclaredSchema>,
  extension: ArtifactExtension | undefined,
): FactoryDeclaredSchema {
  return {
    type: "object",
    required: [...required, ...(extension?.required ?? [])],
    properties: { ...properties, ...(extension?.properties ?? {}) },
  };
}

function reviewArtifactNames(profile: DexSoftwareFactoryProfile): {
  findings: string;
  verdict: string;
} {
  return {
    findings: profile.review?.findingsArtifactName ?? "review-findings",
    verdict: profile.review?.verdictArtifactName ?? "review-verdict",
  };
}

const VERIFICATION_COVERAGE_EXPR = [
  "size(artifacts.verification.executedLanes) == size(artifacts.change_impact.requiredLanes)",
  "artifacts.change_impact.requiredLanes.all(required, artifacts.verification.executedLanes.exists(executed, executed.id == required.id))",
  "artifacts.verification.executedLanes.all(executed, size(artifacts.verification.executedLanes.filter(candidate, candidate.id == executed.id)) == 1)",
].join(" && ");

const VERIFICATION_PASS_EXPR = [
  VERIFICATION_COVERAGE_EXPR,
  'artifacts.verification.status == "passed"',
  'artifacts.verification.executedLanes.all(lane, lane.status == "passed")',
].join(" && ");

function changeSummaryArtifact(
  profile: DexSoftwareFactoryProfile,
): Record<string, unknown> {
  return {
    name: "change-summary",
    description:
      "Compact implementation summary used as the classification subject.",
    schema: extendedArtifactSchema(
      ["summary"],
      { summary: STRING_SCHEMA },
      profile.contracts?.changeSummary,
    ),
  };
}

function changeImpactArtifact(
  profile: DexSoftwareFactoryProfile,
): Record<string, unknown> {
  return {
    name: "change-impact",
    description:
      "Trusted classification and complete verification plan for the current change.",
    reviews: "change-summary",
    schema: extendedArtifactSchema(
      isClosedObjectiveRouting(profile)
        ? ["requiredLanes", "changeFingerprint"]
        : ["requiredLanes", "reviewCandidate", "changeFingerprint"],
      {
        requiredLanes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "reasons"],
            properties: {
              id: STRING_SCHEMA,
              reasons: {
                type: "array",
                minItems: 1,
                items: STRING_SCHEMA,
              },
            },
          },
        },
        reviewCandidate: { type: "boolean" },
        changeFingerprint: STRING_SCHEMA,
      },
      profile.contracts?.changeImpact,
    ),
  };
}

function verificationArtifact(
  profile: DexSoftwareFactoryProfile,
): Record<string, unknown> {
  return {
    name: "verification",
    description:
      "One explicit outcome per required lane and an exact next-stage dispatch.",
    reviews: "change-impact",
    schema: extendedArtifactSchema(
      ["status", "executedLanes", "reviewRequired", "nextStep", "summary"],
      {
        status: { type: "string", enum: ["passed", "failed", "unavailable"] },
        executedLanes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "status", "evidence"],
            properties: {
              id: STRING_SCHEMA,
              status: {
                type: "string",
                enum: ["passed", "failed", "unavailable"],
              },
              evidence: STRING_SCHEMA,
            },
          },
        },
        reviewRequired: { type: "boolean" },
        nextStep: { type: "string", enum: ["rework", "review", "reconcile"] },
        summary: STRING_SCHEMA,
      },
      profile.contracts?.verification,
    ),
  };
}

function verificationReceiptIdentityJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "modelName",
      "specName",
      "resourceName",
      "workflowRunId",
      "contentDigest",
    ],
    properties: {
      modelName: STRING_SCHEMA,
      specName: STRING_SCHEMA,
      resourceName: STRING_SCHEMA,
      workflowRunId: STRING_SCHEMA,
      contentDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    },
  };
}

function closedObjectiveVerificationArtifact(): Record<string, unknown> {
  return {
    name: "verification",
    description: "Correlated model-derived objective routing authority.",
    reviews: "change-impact",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "workItem",
        "integratedRevision",
        "integratedTreeFingerprint",
        "treeFingerprint",
        "changeImpactResourceName",
        "deterministicFanoutResourceName",
        "deterministicFanoutContentDigest",
        "deterministicFanoutWorkflowRunId",
        "policySweepResourceName",
        "policySweepWorkflowId",
        "policySweepWorkflowName",
        "policySweepWorkflowVersion",
        "policySweepWorkflowRunId",
        "policySweepExecutionDigest",
        "policyReceipts",
        "corpusReceipt",
        "renderMatrixRunName",
        "renderMatrixManifestName",
        "renderMatrixBundleName",
        "renderMatrixManifestDigest",
        "renderMatrixBundleDigest",
        "renderMatrixRunDigest",
        "renderEvidenceArchiveDigest",
        "workflowRunId",
        "disposition",
        "objectiveFailureCodes",
        "unavailableEvidenceCodes",
        "advisories",
      ],
      properties: {
        schemaVersion: { type: "integer", enum: [1] },
        workItem: STRING_SCHEMA,
        integratedRevision: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        integratedTreeFingerprint: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        treeFingerprint: { type: "string", pattern: "^[0-9a-f]{64}$" },
        changeImpactResourceName: STRING_SCHEMA,
        deterministicFanoutResourceName: STRING_SCHEMA,
        deterministicFanoutContentDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        deterministicFanoutWorkflowRunId: STRING_SCHEMA,
        policySweepResourceName: STRING_SCHEMA,
        policySweepWorkflowId: {
          type: "string",
          enum: ["5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a"],
        },
        policySweepWorkflowName: { type: "string", enum: ["policy-sweep"] },
        policySweepWorkflowVersion: { type: "integer", enum: [2] },
        policySweepWorkflowRunId: STRING_SCHEMA,
        policySweepExecutionDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        policyReceipts: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: verificationReceiptIdentityJsonSchema(),
        },
        corpusReceipt: verificationReceiptIdentityJsonSchema(),
        renderMatrixRunName: STRING_SCHEMA,
        renderMatrixManifestName: { type: "string" },
        renderMatrixBundleName: { type: "string" },
        renderMatrixManifestDigest: {
          type: "string",
          pattern: "^$|^[0-9a-f]{64}$",
        },
        renderMatrixBundleDigest: {
          type: "string",
          pattern: "^$|^[0-9a-f]{64}$",
        },
        renderMatrixRunDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
        renderEvidenceArchiveDigest: {
          type: "string",
          pattern: "^$|^[0-9a-f]{64}$",
        },
        workflowRunId: STRING_SCHEMA,
        disposition: {
          type: "string",
          enum: [
            "automatic-rework",
            "evidence-unavailable",
            "await-human-aesthetic",
            "reconcile",
          ],
        },
        objectiveFailureCodes: { type: "array", items: STRING_SCHEMA },
        unavailableEvidenceCodes: { type: "array", items: STRING_SCHEMA },
        advisories: { type: "array", items: { type: "object" } },
      },
    },
  };
}

function humanAestheticDecisionArtifact(): Record<string, unknown> {
  return {
    name: "human-aesthetic-decision",
    description: "Trusted exact-bundle-bound Factory human aesthetic decision.",
    reviews: "verification",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "decisionId",
        "workItem",
        "factoryName",
        "gateId",
        "stageId",
        "cycle",
        "verificationRouteResourceName",
        "matrixBundleResourceName",
        "factoryStateResourceName",
        "factoryApprovalResourceName",
        "integratedRevision",
        "integratedTreeFingerprint",
        "treeFingerprint",
        "deterministicFanoutResourceName",
        "deterministicFanoutContentDigest",
        "deterministicFanoutWorkflowRunId",
        "policySweepResourceName",
        "policySweepWorkflowId",
        "policySweepWorkflowName",
        "policySweepWorkflowVersion",
        "policySweepWorkflowRunId",
        "policySweepExecutionDigest",
        "policyReceipts",
        "corpusReceipt",
        "renderMatrixRunName",
        "renderMatrixManifestName",
        "renderMatrixBundleName",
        "verificationWorkflowRunId",
        "renderMatrixManifestDigest",
        "renderMatrixBundleDigest",
        "renderMatrixRunDigest",
        "renderEvidenceArchiveDigest",
        "approvalReceiptId",
        "approvalIdentity",
        "decision",
        "note",
      ],
      properties: {
        schemaVersion: { type: "integer", enum: [1] },
        decisionId: { type: "string", pattern: "^[0-9a-f]{64}$" },
        workItem: STRING_SCHEMA,
        factoryName: STRING_SCHEMA,
        gateId: { type: "string", enum: ["aesthetic-acceptance"] },
        stageId: { type: "string", enum: ["aesthetic-approval"] },
        cycle: { type: "integer", minimum: 1 },
        verificationRouteResourceName: STRING_SCHEMA,
        matrixBundleResourceName: STRING_SCHEMA,
        factoryStateResourceName: STRING_SCHEMA,
        factoryApprovalResourceName: STRING_SCHEMA,
        integratedRevision: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        integratedTreeFingerprint: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        treeFingerprint: { type: "string", pattern: "^[0-9a-f]{64}$" },
        deterministicFanoutResourceName: STRING_SCHEMA,
        deterministicFanoutContentDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        deterministicFanoutWorkflowRunId: STRING_SCHEMA,
        policySweepResourceName: STRING_SCHEMA,
        policySweepWorkflowId: {
          type: "string",
          enum: ["5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a"],
        },
        policySweepWorkflowName: { type: "string", enum: ["policy-sweep"] },
        policySweepWorkflowVersion: { type: "integer", enum: [2] },
        policySweepWorkflowRunId: STRING_SCHEMA,
        policySweepExecutionDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        policyReceipts: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: verificationReceiptIdentityJsonSchema(),
        },
        corpusReceipt: verificationReceiptIdentityJsonSchema(),
        renderMatrixRunName: STRING_SCHEMA,
        renderMatrixManifestName: STRING_SCHEMA,
        renderMatrixBundleName: STRING_SCHEMA,
        verificationWorkflowRunId: STRING_SCHEMA,
        renderMatrixManifestDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        renderMatrixBundleDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
        renderMatrixRunDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
        renderEvidenceArchiveDigest: {
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        approvalReceiptId: { type: "string", pattern: "^[0-9a-f]{64}$" },
        approvalIdentity: STRING_SCHEMA,
        decision: { type: "string", enum: ["accept", "reject"] },
        note: { type: "string" },
      },
    },
  };
}

function reconciliationArtifact(
  profile: DexSoftwareFactoryProfile,
): Record<string, unknown> {
  const closedObjective = isClosedObjectiveRouting(profile);
  return {
    name: "reconciliation",
    description: "Terminal disposition and typed Dex completion inputs.",
    // Verification is the common subject for reviewed and review-bypassed routes.
    // The review transition already gates freshness and acceptance when present.
    reviews: "verification",
    schema: extendedArtifactSchema(
      ["status", "nextStep", "summary", "completionResult", "commit"],
      {
        status: {
          type: "string",
          enum: closedObjective ? ["ready"] : ["ready", "needs-rework"],
        },
        nextStep: {
          type: "string",
          enum: closedObjective ? ["complete"] : ["rework", "complete"],
        },
        summary: STRING_SCHEMA,
        completionResult: STRING_SCHEMA,
        commit: {
          type: "object",
          required: ["kind"],
          properties: {
            kind: { type: "string", enum: ["commit", "noCommit"] },
            sha: { type: "string", pattern: GIT_SHA_PATTERN },
          },
        },
      },
      profile.contracts?.reconciliation,
    ),
  };
}

function preflightStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  return {
    id: "preflight",
    initial: true,
    description: "Run the consumer policy adapter before implementation.",
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(profile.adapters.preflight, "preflight-run"),
    transitions: [
      {
        name: "implement",
        to: "implementation",
        gates: [
          adapterSucceededGate(profile.adapters.preflight, "preflight-run", [
            "evidence-preflight-run",
          ]),
        ],
      },
    ],
  };
}

function implementationStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  return {
    id: "implementation",
    description:
      "Implement the current Dex work item and record a compact change summary.",
    maxCycles: profile.budgets.implementation,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork({ mode: "interactive", ...profile.implementation }),
    artifacts: [changeSummaryArtifact(profile)],
    transitions: [
      {
        name: "classify",
        to: "classify",
        gates: [artifactExists("change-summary")],
      },
    ],
  };
}

function classifyStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  return {
    id: "classify",
    description:
      "Derive a trusted, complete verification plan through the consumer adapter.",
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(profile.adapters.classify, "classify-run"),
    artifacts: [changeImpactArtifact(profile)],
    transitions: [
      {
        name: "verify",
        to: "verification",
        gates: [
          adapterSucceededGate(profile.adapters.classify, "classify-run", [
            "artifact-change-impact",
            "evidence-classify-run",
          ]),
          artifactFresh("change-impact"),
        ],
      },
    ],
  };
}

const CLOSED_ROUTE_FRESHNESS_EXPR = [
  "artifacts.verification.workItem == state.workItem",
  "artifacts.verification.integratedRevision == artifacts.change_summary.integrationReceipt.integratedRevision",
  "artifacts.verification.integratedTreeFingerprint == artifacts.change_summary.integrationReceipt.integratedTreeFingerprint",
  "artifacts.verification.treeFingerprint == artifacts.change_impact.changeFingerprint",
].join(" && ");

function closedObjectiveVerificationTransitions(
  profile: DexSoftwareFactoryProfile,
): Array<Record<string, unknown>> {
  const adapter = profile.adapters.verification;
  if (adapter.mode !== "workflow") {
    throw new TypeError("closed-objective verification requires workflow mode");
  }
  const base = [
    adapterSucceededGate(adapter, "verification-run", [
      "artifact-verification",
      "evidence-verification-run",
    ]),
    artifactFresh("verification"),
  ];
  return [
    {
      name: "automatic-rework",
      to: "implementation",
      gates: [
        ...base,
        celGate(
          `${CLOSED_ROUTE_FRESHNESS_EXPR} && artifacts.verification.disposition == "automatic-rework" && size(artifacts.verification.objectiveFailureCodes) > 0 && size(artifacts.verification.unavailableEvidenceCodes) == 0`,
          "automatic rework requires fresh complete closed objective failure evidence",
        ),
      ],
    },
    {
      name: "evidence-unavailable",
      to: "evidence-unavailable",
      gates: [
        ...base,
        celGate(
          `${CLOSED_ROUTE_FRESHNESS_EXPR} && artifacts.verification.disposition == "evidence-unavailable" && size(artifacts.verification.unavailableEvidenceCodes) > 0`,
          "unavailable evidence pauses Delivery without authorizing mutation",
        ),
      ],
    },
    {
      name: "await-human-aesthetic",
      to: "aesthetic-approval",
      gates: [
        ...base,
        celGate(
          `${CLOSED_ROUTE_FRESHNESS_EXPR} && artifacts.verification.disposition == "await-human-aesthetic" && size(artifacts.verification.objectiveFailureCodes) == 0 && size(artifacts.verification.unavailableEvidenceCodes) == 0 && artifacts.verification.renderMatrixManifestDigest.matches("^[0-9a-f]{64}$") && artifacts.verification.renderMatrixBundleDigest.matches("^[0-9a-f]{64}$") && artifacts.verification.renderMatrixRunDigest.matches("^[0-9a-f]{64}$") && artifacts.verification.renderEvidenceArchiveDigest.matches("^[0-9a-f]{64}$")`,
          "aesthetic review requires a complete passing exact render bundle",
        ),
      ],
    },
    {
      name: "reconcile",
      to: "reconciliation",
      gates: [
        ...base,
        celGate(
          `${CLOSED_ROUTE_FRESHNESS_EXPR} && artifacts.verification.disposition == "reconcile" && size(artifacts.verification.objectiveFailureCodes) == 0 && size(artifacts.verification.unavailableEvidenceCodes) == 0`,
          "reconciliation requires complete passing objective evidence and proven render non-applicability",
        ),
      ],
    },
  ];
}

function evidenceUnavailableStage(): FactoryStage {
  return {
    id: "evidence-unavailable",
    description:
      "Pause the serialized Delivery tail until deterministic evidence can be retried.",
    transitions: [
      {
        name: "retry-verification",
        to: "verification",
        gates: [{
          type: "human-approval",
          config: { id: "retry-verification" },
        }],
      },
    ],
  };
}

function aestheticApprovalStage(): FactoryStage {
  return {
    id: "aesthetic-approval",
    description:
      "Pause the entire serialized integration queue for exact-bundle human aesthetic judgment.",
    transitions: [
      {
        name: "bind-approval",
        to: "aesthetic-decision-binding",
        gates: [{
          type: "human-approval",
          config: { id: "aesthetic-acceptance" },
        }],
      },
      {
        name: "bind-rejection",
        to: "aesthetic-decision-binding",
        gates: [humanRejectionGate({ id: "aesthetic-acceptance" })],
      },
    ],
  };
}

function aestheticDecisionBindingStage(
  profile: DexSoftwareFactoryProfile,
): FactoryStage {
  const routing = profile.verificationRouting;
  if (routing === undefined || !("mode" in routing)) {
    throw new TypeError("closed-objective routing missing");
  }
  const adapter = {
    mode: "workflow" as const,
    workflow: routing.aestheticDecisionAdapter.workflow,
  };
  const exactEvidenceBinding = [
    "artifacts.human_aesthetic_decision.integratedRevision == artifacts.verification.integratedRevision",
    "artifacts.human_aesthetic_decision.integratedTreeFingerprint == artifacts.verification.integratedTreeFingerprint",
    "artifacts.human_aesthetic_decision.treeFingerprint == artifacts.verification.treeFingerprint",
    "artifacts.human_aesthetic_decision.deterministicFanoutResourceName == artifacts.verification.deterministicFanoutResourceName",
    "artifacts.human_aesthetic_decision.deterministicFanoutContentDigest == artifacts.verification.deterministicFanoutContentDigest",
    "artifacts.human_aesthetic_decision.deterministicFanoutWorkflowRunId == artifacts.verification.deterministicFanoutWorkflowRunId",
    "artifacts.human_aesthetic_decision.policySweepResourceName == artifacts.verification.policySweepResourceName",
    "artifacts.human_aesthetic_decision.policySweepWorkflowId == artifacts.verification.policySweepWorkflowId",
    "artifacts.human_aesthetic_decision.policySweepWorkflowName == artifacts.verification.policySweepWorkflowName",
    "artifacts.human_aesthetic_decision.policySweepWorkflowVersion == artifacts.verification.policySweepWorkflowVersion",
    "artifacts.human_aesthetic_decision.policySweepWorkflowRunId == artifacts.verification.policySweepWorkflowRunId",
    "artifacts.human_aesthetic_decision.policySweepExecutionDigest == artifacts.verification.policySweepExecutionDigest",
    "artifacts.human_aesthetic_decision.policyReceipts == artifacts.verification.policyReceipts",
    "artifacts.human_aesthetic_decision.corpusReceipt == artifacts.verification.corpusReceipt",
    "artifacts.human_aesthetic_decision.renderMatrixRunName == artifacts.verification.renderMatrixRunName",
    "artifacts.human_aesthetic_decision.renderMatrixManifestName == artifacts.verification.renderMatrixManifestName",
    "artifacts.human_aesthetic_decision.renderMatrixBundleName == artifacts.verification.renderMatrixBundleName",
    "artifacts.human_aesthetic_decision.verificationWorkflowRunId == artifacts.verification.workflowRunId",
    "artifacts.human_aesthetic_decision.renderMatrixManifestDigest == artifacts.verification.renderMatrixManifestDigest",
    "artifacts.human_aesthetic_decision.renderMatrixBundleDigest == artifacts.verification.renderMatrixBundleDigest",
    "artifacts.human_aesthetic_decision.renderMatrixRunDigest == artifacts.verification.renderMatrixRunDigest",
    "artifacts.human_aesthetic_decision.renderEvidenceArchiveDigest == artifacts.verification.renderEvidenceArchiveDigest",
  ].join(" && ");
  return {
    id: "aesthetic-decision-binding",
    description:
      "Bind the trusted Factory approval record to the exact verified evidence bundle.",
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(adapter, "human-aesthetic-decision-run"),
    artifacts: [humanAestheticDecisionArtifact()],
    transitions: [
      {
        name: "accept",
        to: "reconciliation",
        gates: [
          adapterSucceededGate(adapter, "human-aesthetic-decision-run", [
            "artifact-human-aesthetic-decision",
            "evidence-human-aesthetic-decision-run",
          ]),
          artifactFresh("human-aesthetic-decision"),
          celGate(
            `artifacts.human_aesthetic_decision.decision == "accept" && ${exactEvidenceBinding}`,
            "acceptance requires the trusted current evidence-bound human decision",
          ),
        ],
      },
      {
        name: "human-revision",
        to: "implementation",
        gates: [
          adapterSucceededGate(adapter, "human-aesthetic-decision-run", [
            "artifact-human-aesthetic-decision",
            "evidence-human-aesthetic-decision-run",
          ]),
          artifactFresh("human-aesthetic-decision"),
          celGate(
            `artifacts.human_aesthetic_decision.decision == "reject" && ${exactEvidenceBinding}`,
            "revision requires the trusted current evidence-bound human rejection",
          ),
        ],
      },
    ],
  };
}

function verificationTransitions(
  profile: DexSoftwareFactoryProfile,
): Array<Record<string, unknown>> {
  const adapterGate = verificationSucceededGate(profile.adapters.verification);
  const baseGates = [adapterGate, artifactFresh("verification")];
  const nonPassingResult =
    'artifacts.verification.status != "passed" || artifacts.verification.executedLanes.exists(lane, lane.status != "passed")';
  const reworkReason = legacyRouting(profile)?.reworkCondition === undefined
    ? nonPassingResult
    : `(${nonPassingResult}) || (${legacyRouting(profile)?.reworkCondition})`;
  const transitions: Array<Record<string, unknown>> = [
    {
      name: "rework",
      to: "implementation",
      gates: compactGates([
        ...baseGates,
        celGate(
          `${VERIFICATION_COVERAGE_EXPR} && artifacts.verification.nextStep == "rework" && (${reworkReason})`,
          "rework requires complete lane coverage, an explicit non-passing result, and nextStep=rework",
        ),
      ]),
    },
  ];

  if (profile.review !== undefined) {
    transitions.push({
      name: "review",
      to: "review",
      gates: compactGates([
        ...baseGates,
        celGate(
          andCondition(
            `${VERIFICATION_PASS_EXPR} && artifacts.verification.reviewRequired && artifacts.verification.nextStep == "review"`,
            legacyRouting(profile)?.reviewCondition,
          ),
          "review requires complete passing verification, reviewRequired=true, and nextStep=review",
        ),
      ]),
    });
  }

  transitions.push({
    name: "reconcile",
    to: "reconciliation",
    gates: compactGates([
      ...baseGates,
      celGate(
        andCondition(
          `${VERIFICATION_PASS_EXPR} && !artifacts.verification.reviewRequired && artifacts.verification.nextStep == "reconcile"`,
          legacyRouting(profile)?.reconcileCondition,
        ),
        "reconciliation requires complete passing verification, reviewRequired=false, and nextStep=reconcile",
      ),
      profile.review === undefined
        ? humanApprovalGate(profile.humanGate)
        : null,
    ]),
  });

  if (profile.review === undefined && profile.humanGate !== undefined) {
    transitions.push({
      name: "human-revision",
      to: "implementation",
      gates: compactGates([
        ...baseGates,
        celGate(
          andCondition(
            `${VERIFICATION_PASS_EXPR} && !artifacts.verification.reviewRequired && artifacts.verification.nextStep == "reconcile"`,
            legacyRouting(profile)?.reconcileCondition,
          ),
          "human revision requires complete passing verification routed to reconciliation",
        ),
        humanRejectionGate(profile.humanGate),
      ]),
    });
  }

  return transitions;
}

function verificationStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  const closedObjective = isClosedObjectiveRouting(profile);
  return {
    id: "verification",
    description: closedObjective
      ? "Derive the only route from complete correlated deterministic evidence."
      : "Execute every classified lane and record an exact next-stage dispatch.",
    maxCycles: profile.budgets.verification,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: verificationWork(profile.adapters.verification),
    artifacts: [
      closedObjective
        ? closedObjectiveVerificationArtifact()
        : verificationArtifact(profile),
    ],
    transitions: closedObjective
      ? closedObjectiveVerificationTransitions(profile)
      : verificationTransitions(profile),
  };
}

function reviewStage(profile: DexSoftwareFactoryProfile): FactoryStage | null {
  if (profile.review === undefined) return null;
  const artifactNames = reviewArtifactNames(profile);
  const verdictCelName = artifactNames.verdict.replaceAll("-", "_");
  const reviewReworkExpression = profile.review.reworkCondition === undefined
    ? `artifacts.${verdictCelName}.status == "revise"`
    : `artifacts.${verdictCelName}.status == "revise" || (${profile.review.reworkCondition})`;
  const reviewAcceptExpression = andCondition(
    `artifacts.${verdictCelName}.status == "accept"`,
    profile.review.acceptCondition,
  );
  const humanRevisionTransition = profile.humanGate === undefined ? [] : [
    {
      name: "human-revision",
      to: "implementation",
      gates: [
        artifactFresh(artifactNames.findings),
        artifactFresh(artifactNames.verdict),
        humanRejectionGate(profile.humanGate),
      ],
    },
  ];
  return {
    id: "review",
    description:
      "Review the verified change and retain both findings and a route verdict.",
    maxCycles: profile.budgets.review,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: {
      mode: "dispatch",
      skills: profile.review.skills,
      systemPrompt: profile.review.systemPrompt,
      context: { inject: ["change-summary", "change-impact", "verification"] },
    },
    artifacts: [
      {
        name: artifactNames.findings,
        kind: "findings",
        reviews: "verification",
      },
      {
        name: artifactNames.verdict,
        reviews: "verification",
        schema: extendedArtifactSchema(
          ["status", "summary"],
          {
            status: { type: "string", enum: ["accept", "revise"] },
            summary: STRING_SCHEMA,
          },
          profile.contracts?.reviewVerdict,
        ),
      },
    ],
    transitions: [
      {
        name: "rework",
        to: "implementation",
        gates: [
          artifactFresh(artifactNames.findings),
          artifactFresh(artifactNames.verdict),
          celGate(
            reviewReworkExpression,
            "rework requires an explicit revise verdict",
          ),
        ],
      },
      {
        name: "accept",
        to: "reconciliation",
        gates: compactGates([
          artifactFresh(artifactNames.findings),
          artifactFresh(artifactNames.verdict),
          {
            type: "findings-clear",
            config: {
              artifact: artifactNames.findings,
              blocking: profile.review.blockingSeverities,
            },
          },
          celGate(
            reviewAcceptExpression,
            "acceptance requires an explicit accept verdict",
          ),
          humanApprovalGate(profile.humanGate),
        ]),
      },
      ...humanRevisionTransition,
    ],
  };
}

function reconciliationStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  const reviewNames = reviewArtifactNames(profile);
  const closedObjective = isClosedObjectiveRouting(profile);
  return {
    id: "reconciliation",
    description:
      "Confirm the terminal disposition and prepare exact Dex completion inputs.",
    maxCycles: profile.budgets.reconciliation,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: {
      mode: "interactive",
      context: {
        inject: profile.review === undefined
          ? ["change-summary", "verification"]
          : ["change-summary", "verification", reviewNames.verdict],
      },
      systemPrompt: closedObjective
        ? "Prepare the exact Dex completion result and commit decision from already verified integration evidence. Do not mutate the repository or tracker, assess aesthetics, or route rework."
        : "Reconcile the verified result without mutating the repository or tracker state. Confirm any integration evidence already recorded in change-summary. Record nextStep=rework when anything remains; otherwise record nextStep=complete with the exact Dex result and commit decision.",
    },
    artifacts: [reconciliationArtifact(profile)],
    transitions: [
      ...(closedObjective ? [] : [
        {
          name: "rework",
          to: "implementation",
          gates: [
            artifactFresh("reconciliation"),
            celGate(
              'artifacts.reconciliation.status == "needs-rework" && artifacts.reconciliation.nextStep == "rework"',
              "rework requires status=needs-rework and nextStep=rework",
            ),
          ],
        },
      ]),
      {
        name: "postflight",
        to: "postflight",
        gates: [
          artifactFresh("reconciliation"),
          celGate(
            'artifacts.reconciliation.status == "ready" && artifacts.reconciliation.nextStep == "complete"',
            "postflight requires status=ready and nextStep=complete",
          ),
        ],
      },
    ],
  };
}

function postflightStage(profile: DexSoftwareFactoryProfile): FactoryStage {
  return {
    id: "postflight",
    description:
      "Run the consumer terminal policy adapter before tracker completion.",
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(profile.adapters.postflight, "postflight-run"),
    transitions: [
      {
        name: "cleanup",
        to: "terminal-cleanup",
        gates: compactGates([
          adapterSucceededGate(profile.adapters.postflight, "postflight-run", [
            "evidence-postflight-run",
          ]),
          humanApprovalGate(profile.completionGate),
        ]),
      },
      ...(profile.completionGate === undefined ? [] : [{
        name: "human-revision",
        to: "implementation",
        gates: [
          adapterSucceededGate(
            profile.adapters.postflight,
            "postflight-run",
            ["evidence-postflight-run"],
          ),
          humanRejectionGate(profile.completionGate),
        ],
      }]),
    ],
  };
}

function terminalCleanupStage(
  profile: DexSoftwareFactoryProfile,
): FactoryStage {
  const completionWorkflow = profile.adapters.dexTracker.completionWorkflow;
  const work = profile.completionGate !== undefined &&
      completionWorkflow !== undefined
    ? {
      mode: "workflow" as const,
      workflow: {
        name: completionWorkflow,
        inputs: { workItem: CEL_WORK_ITEM },
      },
      inputsSchema: {
        type: "object" as const,
        required: ["workItem"],
        additionalProperties: false,
        properties: { workItem: STRING_SCHEMA },
      },
      resultEvidence: "tracker-completion",
    }
    : {
      mode: "method" as const,
      method: {
        modelIdOrName: profile.adapters.dexTracker.modelIdOrName,
        methodName: profile.adapters.dexTracker.completeMethodName,
        inputs: {
          taskId: CEL_WORK_ITEM,
          result: COMPLETION_RESULT_BINDING,
          commit: COMPLETION_COMMIT_BINDING,
        },
      },
      inputsSchema: {
        type: "object" as const,
        required: ["taskId", "result", "commit"],
        additionalProperties: false,
        properties: {
          taskId: STRING_SCHEMA,
          result: STRING_SCHEMA,
          commit: {
            type: "object",
            required: ["kind"],
            properties: {
              kind: { type: "string", enum: ["commit", "noCommit"] },
              sha: { type: "string", pattern: GIT_SHA_PATTERN },
            },
          },
        },
      },
      resultEvidence: "tracker-completion",
    };
  return {
    id: "terminal-cleanup",
    description: profile.completionGate === undefined
      ? "Complete the Dex task only after reconciliation and successful postflight."
      : "Complete the Dex task only through the repository completion workflow after explicit task-specific human approval.",
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work,
    transitions: [
      {
        name: "finish",
        to: profile.adapters.terminalObserver === undefined
          ? "done"
          : "done-observability",
        gates: [
          {
            type: "evidence-recorded",
            config: {
              name: "tracker-completion",
              requireField: { status: "succeeded" },
            },
          },
        ],
      },
    ],
  };
}

function terminalObservabilityStage(
  id: "done-observability" | "aborted-observability",
  terminalStage: "done" | "aborted",
  workflow: string,
  maxDispatchesPerCycle: number,
): FactoryStage {
  return {
    id,
    description:
      `Finalize ${terminalStage}, persist canonical Factory reports, and emit non-gating observability.`,
    maxDispatchesPerCycle,
    work: {
      mode: "workflow",
      workflow: {
        name: workflow,
        inputs: { workItem: CEL_WORK_ITEM },
      },
      inputsSchema: {
        type: "object",
        required: ["workItem"],
        additionalProperties: false,
        properties: { workItem: STRING_SCHEMA },
      },
    },
    transitions: [{ name: "finalize", to: terminalStage }],
  };
}

/** Compile one consumer profile into @swamp/software-factory global arguments. */
export function compileDexSoftwareFactoryProfile(
  input: DexSoftwareFactoryProfile,
): CompiledDexSoftwareFactoryProfile {
  const profile = DexSoftwareFactoryProfileSchema.parse(input);
  const review = reviewStage(profile);
  const closedObjective = isClosedObjectiveRouting(profile);
  const stages = [
    preflightStage(profile),
    implementationStage(profile),
    classifyStage(profile),
    verificationStage(profile),
    ...(closedObjective
      ? [
        evidenceUnavailableStage(),
        aestheticApprovalStage(),
        aestheticDecisionBindingStage(profile),
      ]
      : []),
    ...(review === null ? [] : [review]),
    reconciliationStage(profile),
    postflightStage(profile),
    terminalCleanupStage(profile),
    ...(profile.adapters.terminalObserver === undefined ? [] : [
      terminalObservabilityStage(
        "done-observability",
        "done",
        profile.adapters.terminalObserver.workflow,
        profile.budgets.maxDispatchesPerCycle,
      ),
      terminalObservabilityStage(
        "aborted-observability",
        "aborted",
        profile.adapters.terminalObserver.workflow,
        profile.budgets.maxDispatchesPerCycle,
      ),
    ]),
    { id: "done", terminal: true },
    { id: "aborted", terminal: true },
  ];

  return CompiledDexSoftwareFactoryProfileSchema.parse({
    schemaVersion: 1,
    compilerVersion: DEX_SOFTWARE_FACTORY_VERSION,
    profileName: profile.profileName,
    target: {
      type: "@swamp/software-factory",
      version: SOFTWARE_FACTORY_TARGET_VERSION,
    },
    factoryArguments: {
      stages,
      globalTransitions: [
        {
          name: "abort",
          to: profile.adapters.terminalObserver === undefined
            ? "aborted"
            : "aborted-observability",
          gates: [
            {
              type: "human-approval",
              config: { id: "abort-confirmation" },
            },
          ],
        },
      ],
    },
  });
}

/** Compile and persist the profile configured on this model instance. */
export async function executeDexSoftwareFactoryCompile(
  _contextArgs: Record<string, never>,
  context: DexSoftwareFactoryMethodContext,
): Promise<DexSoftwareFactoryExecutionResult> {
  context.logger.info("Compiling Dex software Factory profile");
  let rawProfile = context.globalArgs;
  if (
    context.definitionRepository !== undefined &&
    context.modelType !== undefined &&
    context.modelId !== undefined
  ) {
    const definition = await context.definitionRepository.findById(
      context.modelType,
      context.modelId,
    );
    if (definition !== null) rawProfile = definition.globalArguments;
  }
  const compiled = compileDexSoftwareFactoryProfile(
    DexSoftwareFactoryProfileSchema.parse(rawProfile),
  );
  const handle = await context.writeResource(
    "profile",
    "compiled-profile",
    compiled,
  );
  context.logger.info("Compiled Dex software Factory profile {profileName}", {
    profileName: compiled.profileName,
  });
  return { dataHandles: [handle] };
}
