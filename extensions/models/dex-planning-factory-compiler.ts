/**
 * Typed compiler for a portable, human-gated Dex Planning Factory profile.
 *
 * The compiler owns lifecycle safety and artifact contracts. Repository facts,
 * documentation policy, Dex inventory, plan application, and planning audits
 * remain behind consumer-supplied typed adapters.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

export const DEX_PLANNING_FACTORY_VERSION = "2026.08.27.1";
const SOFTWARE_FACTORY_TARGET_VERSION = "2026.06.24.1";
const FACTORY_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
const SHA256_PATTERN = "^[0-9a-f]{64}$";
const CLIENT_REF_PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
const PLAN_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const TASK_ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
const CEL_WORK_ITEM = "${{ self.workItem }}";
const REVIEWED_PLAN_BINDING =
  '${{ data.latest(self.name, "artifact-approved-plan").payload.plan }}';
export type DexReviewedPlanningTask = {
  clientRef: string;
  name: string;
  description: string;
  priority: number;
  parentKind: "root" | "reference";
  parentClientRef: string;
  blockedBy: string[];
};
export type DexReviewedPlanningAttachment = {
  clientRef: string;
  selectorKind: "id" | "exactName";
  selectorValue: string;
  expectedName: string;
  expectedDescription: string;
  expectedPriority: number;
  parentKind: "preserve" | "root" | "reference";
  parentClientRef: string;
  addBlockedBy: string[];
};
export type DexReviewedPlanningPlan = {
  schemaVersion: 1;
  planId: string;
  createTasks: DexReviewedPlanningTask[];
  attachExistingTasks: DexReviewedPlanningAttachment[];
};

/** Apply the exact compiler-owned flattened-plan to Plan Applier boundary. */
export function normalizeDexReviewedPlanForApplication(
  reviewedPlan: DexReviewedPlanningPlan,
): Record<string, unknown> {
  return {
    schemaVersion: reviewedPlan.schemaVersion,
    planId: reviewedPlan.planId,
    tasks: [
      ...reviewedPlan.createTasks.map((task) => ({
        kind: "create" as const,
        clientRef: task.clientRef,
        name: task.name,
        description: task.description,
        priority: task.priority,
        parent: task.parentKind === "root"
          ? { kind: "root" as const }
          : { kind: "reference" as const, clientRef: task.parentClientRef },
        blockedBy: task.blockedBy,
      })),
      ...reviewedPlan.attachExistingTasks.map((task) => ({
        kind: "attachExisting" as const,
        clientRef: task.clientRef,
        selector: task.selectorKind === "id"
          ? { kind: "id" as const, taskId: task.selectorValue }
          : { kind: "exactName" as const, name: task.selectorValue },
        expected: {
          name: task.expectedName,
          description: task.expectedDescription,
          priority: task.expectedPriority,
        },
        parent: task.parentKind === "preserve"
          ? { kind: "preserve" as const }
          : task.parentKind === "root"
          ? { kind: "root" as const }
          : { kind: "reference" as const, clientRef: task.parentClientRef },
        addBlockedBy: task.addBlockedBy,
      })),
    ],
  };
}

/** CEL equivalent of normalizeDexReviewedPlanForApplication used by the emitted Factory. */
export const APPROVED_PLAN_BINDING =
  '${{ {"schemaVersion": data.latest(self.name, "artifact-approved-plan").payload.plan.schemaVersion, "planId": data.latest(self.name, "artifact-approved-plan").payload.plan.planId, "tasks": data.latest(self.name, "artifact-approved-plan").payload.plan.createTasks.map(task, {"kind": "create", "clientRef": task.clientRef, "name": task.name, "description": task.description, "priority": task.priority, "parent": task.parentKind == "root" ? {"kind": "root"} : {"kind": "reference", "clientRef": task.parentClientRef}, "blockedBy": task.blockedBy}) + data.latest(self.name, "artifact-approved-plan").payload.plan.attachExistingTasks.map(task, {"kind": "attachExisting", "clientRef": task.clientRef, "selector": task.selectorKind == "id" ? {"kind": "id", "taskId": task.selectorValue} : {"kind": "exactName", "name": task.selectorValue}, "expected": {"name": task.expectedName, "description": task.expectedDescription, "priority": task.expectedPriority}, "parent": task.parentKind == "preserve" ? {"kind": "preserve"} : task.parentKind == "root" ? {"kind": "root"} : {"kind": "reference", "clientRef": task.parentClientRef}, "addBlockedBy": task.addBlockedBy})} }}';
const PLANNING_INVENTORY_BINDING =
  '${{ data.latest(self.name, "artifact-planning-inventory").payload }}';
const TRACKER_INVENTORY_BINDING =
  '${{ data.latest(self.name, "artifact-tracker-inventory").payload }}';
const CLARIFIED_INTENT_BINDING =
  '${{ data.latest(self.name, "artifact-clarified-intent").payload }}';
const DOCUMENTATION_EFFECTS_BINDING =
  '${{ data.latest(self.name, "artifact-documentation-effects").payload }}';
const GRAPH_PROPOSAL_BINDING =
  '${{ data.latest(self.name, "artifact-dex-graph-proposal").payload.plan }}';
const APPLICATION_BUNDLE_BINDING =
  '${{ data.latest(self.name, "artifact-application-bundle").payload }}';
const APPLICATION_BUNDLE_VALIDATION_BINDING =
  '${{ data.latest(self.name, "artifact-application-bundle-validation").payload }}';
const PLAN_APPLICATION_BINDING =
  '${{ data.latest(self.name, "artifact-plan-application").payload }}';

const FactoryNameSchema = z.string().regex(FACTORY_NAME_PATTERN);

type FactoryDeclaredSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, FactoryDeclaredSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: FactoryDeclaredSchema;
  enum?: Array<string | number | boolean>;
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
      enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
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

// Application is a workflow contract because it must normalize the Plan
// Applier's checkpoint/receipt/result resources into Factory artifacts on both
// semantic success and failure. The workflow calls apply-plan with only plan.
const PlanApplicationAdapterSchema = WorkflowAdapterSchema;

const ReadOnlyAdapterSchema = z.discriminatedUnion("mode", [
  WorkflowAdapterSchema.extend({ readOnly: z.literal(true) }),
  MethodAdapterSchema.extend({ readOnly: z.literal(true) }),
]);

// Optional consumer-owned application bundles let one generic Planning Factory
// preview and validate non-Dex effects without teaching the compiler tier names,
// repository paths, or mutation policy.
const ApplicationBundleHookSchema = z.strictObject({
  validator: ReadOnlyAdapterSchema,
});

const InteractiveWorkSchema = z.strictObject({
  skills: z.array(z.string().min(1)).optional(),
  systemPrompt: z.string().min(1),
  constraints: z.string().min(1).optional(),
});

const ReviewSchema = z.strictObject({
  skills: z.array(z.string().min(1)).min(1),
  systemPrompt: z.string().min(1),
  blockingSeverities: z.array(z.enum(["critical", "high", "medium", "low"]))
    .min(1),
});

const HumanGateSchema = z.strictObject({
  id: FactoryNameSchema,
  minApprovals: z.number().int().positive().optional(),
});

const BudgetsSchema = z.strictObject({
  inventory: z.number().int().positive().max(20),
  clarification: z.number().int().positive().max(20),
  intent: z.number().int().positive().max(20),
  documentation: z.number().int().positive().max(20),
  proposal: z.number().int().positive().max(20),
  review: z.number().int().positive().max(20),
  approval: z.number().int().positive().max(20),
  application: z.number().int().positive().max(20),
  audit: z.number().int().positive().max(20),
  handoff: z.number().int().positive().max(20),
  maxDispatchesPerCycle: z.number().int().positive().max(5),
});

/** Repository adapters and judgment prompts for one planning profile. */
export const DexPlanningFactoryProfileSchema = z
  .strictObject({
    profileName: FactoryNameSchema,
    adapters: z.strictObject({
      inventory: ReadOnlyAdapterSchema,
      tracker: ReadOnlyAdapterSchema,
      documentationPolicy: ReadOnlyAdapterSchema,
      planApplier: PlanApplicationAdapterSchema,
      audit: ReadOnlyAdapterSchema,
      applicationBundle: ApplicationBundleHookSchema.optional(),
      terminalObserver: z.strictObject({
        workflow: FactoryNameSchema,
      }).optional(),
    }),
    clarification: InteractiveWorkSchema,
    intent: InteractiveWorkSchema,
    proposal: InteractiveWorkSchema,
    review: ReviewSchema,
    approval: InteractiveWorkSchema,
    handoff: InteractiveWorkSchema,
    humanGate: HumanGateSchema,
    budgets: BudgetsSchema,
  })
  .superRefine((profile, context) => {
    const adapterReservedInputs: Array<[
      | "inventory"
      | "tracker"
      | "documentationPolicy"
      | "planApplier"
      | "audit",
      string[],
    ]> = [
      ["inventory", ["workItem"]],
      ["tracker", ["workItem", "inventory"]],
      [
        "documentationPolicy",
        ["workItem", "inventory", "trackerInventory", "intent"],
      ],
      ["planApplier", ["workItem", "plan"]],
      [
        "audit",
        ["workItem", "approvedPlan", "application", "documentationEffects"],
      ],
    ];
    for (const [adapterName, reserved] of adapterReservedInputs) {
      const inputs = profile.adapters[adapterName].inputs;
      for (const inputName of reserved) {
        if (
          inputs !== undefined &&
          (inputName in inputs.values || inputName in inputs.properties)
        ) {
          context.addIssue({
            code: "custom",
            message: `${inputName} is compiler-owned and cannot be overridden`,
            path: ["adapters", adapterName, "inputs"],
          });
        }
      }
    }
    const applicationBundleHook = profile.adapters.applicationBundle;
    const bundleValidatorInputs = applicationBundleHook?.validator.inputs;
    for (
      const inputName of [
        "workItem",
        "inventory",
        "trackerInventory",
        "documentationEffects",
        "reviewedPlan",
        "applicationBundle",
      ]
    ) {
      if (
        bundleValidatorInputs !== undefined &&
        (inputName in bundleValidatorInputs.values ||
          inputName in bundleValidatorInputs.properties)
      ) {
        context.addIssue({
          code: "custom",
          message: `${inputName} is compiler-owned and cannot be overridden`,
          path: ["adapters", "applicationBundle", "validator", "inputs"],
        });
      }
    }
    if (applicationBundleHook !== undefined) {
      const planApplierInputs = profile.adapters.planApplier.inputs;
      for (
        const inputName of [
          "planningInventory",
          "trackerInventory",
          "documentationEffects",
          "reviewedPlan",
          "applicationBundle",
          "applicationBundleValidation",
          "approvalGateId",
        ]
      ) {
        if (
          planApplierInputs !== undefined &&
          (inputName in planApplierInputs.values ||
            inputName in planApplierInputs.properties)
        ) {
          context.addIssue({
            code: "custom",
            message: `${inputName} is compiler-owned and cannot be overridden`,
            path: ["adapters", "planApplier", "inputs"],
          });
        }
      }
      const auditInputs = profile.adapters.audit.inputs;
      for (
        const inputName of [
          "reviewedPlan",
          "applicationBundle",
          "applicationBundleValidation",
        ]
      ) {
        if (
          auditInputs !== undefined &&
          (inputName in auditInputs.values ||
            inputName in auditInputs.properties)
        ) {
          context.addIssue({
            code: "custom",
            message: `${inputName} is compiler-owned and cannot be overridden`,
            path: ["adapters", "audit", "inputs"],
          });
        }
      }
    }
  });

export type DexPlanningFactoryProfile = z.infer<
  typeof DexPlanningFactoryProfileSchema
>;

// Swamp may inject platform globals before execution. Compile reparses the raw
// stored definition with DexPlanningFactoryProfileSchema.
export const DexPlanningFactoryPlatformArgsSchema = z.object({
  profileName: FactoryNameSchema.optional(),
  adapters: z.unknown().optional(),
  clarification: z.unknown().optional(),
  intent: z.unknown().optional(),
  proposal: z.unknown().optional(),
  review: z.unknown().optional(),
  approval: z.unknown().optional(),
  handoff: z.unknown().optional(),
  humanGate: z.unknown().optional(),
  budgets: z.unknown().optional(),
});

const FactoryArgumentsOutputSchema = z.strictObject({
  stages: z.array(z.record(z.string(), z.unknown())).min(1),
  globalTransitions: z.array(z.record(z.string(), z.unknown())),
});

/** Versioned result consumed by an @swamp/software-factory definition. */
export const CompiledDexPlanningFactoryProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  compilerVersion: z.literal(DEX_PLANNING_FACTORY_VERSION),
  profileName: FactoryNameSchema,
  target: z.strictObject({
    type: z.literal("@swamp/software-factory"),
    version: z.literal(SOFTWARE_FACTORY_TARGET_VERSION),
  }),
  factoryArguments: FactoryArgumentsOutputSchema,
});

export type CompiledDexPlanningFactoryProfile = z.infer<
  typeof CompiledDexPlanningFactoryProfileSchema
>;

export type DexPlanningFactoryMethodContext = {
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

export type DexPlanningFactoryExecutionResult = {
  dataHandles: Array<{ name: string }>;
};

type ExecutableAdapter =
  | z.infer<typeof WorkflowAdapterSchema>
  | z.infer<typeof MethodAdapterSchema>;
type ReadOnlyAdapter = z.infer<typeof ReadOnlyAdapterSchema>;
type InteractiveWork = z.infer<typeof InteractiveWorkSchema>;
type FactoryStage = Record<string, unknown>;
type FactoryGate = Record<string, unknown>;

function strictObjectSchema(
  properties: Record<string, FactoryDeclaredSchema>,
  required: string[] = [],
): FactoryDeclaredSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const NON_EMPTY_STRING_SCHEMA: FactoryDeclaredSchema = {
  type: "string",
  minLength: 1,
};
const DEX_CONTENT_SCHEMA: FactoryDeclaredSchema = {
  type: "string",
  minLength: 1,
  maxLength: 51_200,
};
const DEX_EXISTING_DESCRIPTION_SCHEMA: FactoryDeclaredSchema = {
  type: "string",
  maxLength: 51_200,
};
const SHA256_SCHEMA: FactoryDeclaredSchema = {
  type: "string",
  pattern: SHA256_PATTERN,
};

function stringArraySchema(minItems = 0): FactoryDeclaredSchema {
  return {
    type: "array",
    minItems,
    items: NON_EMPTY_STRING_SCHEMA,
  };
}

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

function interactiveWork(
  work: InteractiveWork,
  inject: string[],
): Record<string, unknown> {
  return {
    mode: "interactive",
    ...(work.skills === undefined ? {} : { skills: work.skills }),
    systemPrompt: work.systemPrompt,
    ...(work.constraints === undefined
      ? {}
      : { constraints: work.constraints }),
    context: { inject },
  };
}

function adapterInputs(
  adapter: ExecutableAdapter,
  compilerValues: Record<string, unknown>,
  compilerProperties: Record<string, FactoryDeclaredSchema>,
): { inputs: Record<string, unknown>; inputsSchema: FactoryDeclaredSchema } {
  const configured = adapter.inputs;
  return {
    inputs: { ...compilerValues, ...(configured?.values ?? {}) },
    inputsSchema: strictObjectSchema(
      { ...compilerProperties, ...(configured?.properties ?? {}) },
      [
        ...Object.keys(compilerProperties),
        ...(configured?.required ?? []),
      ],
    ),
  };
}

function adapterWork(
  adapter: ExecutableAdapter | ReadOnlyAdapter,
  resultEvidence: string,
  compilerValues: Record<string, unknown> = { workItem: CEL_WORK_ITEM },
  compilerProperties: Record<string, FactoryDeclaredSchema> = {
    workItem: NON_EMPTY_STRING_SCHEMA,
  },
): Record<string, unknown> {
  const contract = adapterInputs(
    adapter,
    compilerValues,
    compilerProperties,
  );
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
  adapter: ExecutableAdapter | ReadOnlyAdapter,
  evidenceName: string,
  artifactNames: string[],
): FactoryGate {
  if (adapter.mode === "workflow") {
    return {
      type: "workflow-succeeded",
      config: {
        workflow: adapter.workflow,
        requireStepOutputs: [
          ...artifactNames.map((name) => `artifact-${name}`),
          `evidence-${evidenceName}`,
        ],
      },
    };
  }
  return {
    type: "evidence-recorded",
    config: { name: evidenceName, requireField: { status: "succeeded" } },
  };
}

function humanApprovalGate(
  gate: z.infer<typeof HumanGateSchema>,
): FactoryGate {
  return {
    type: "human-approval",
    config: {
      id: gate.id,
      ...(gate.minApprovals === undefined
        ? {}
        : { minApprovals: gate.minApprovals }),
    },
  };
}

function humanRejectionGate(
  gate: z.infer<typeof HumanGateSchema>,
): FactoryGate {
  const approvalName = gate.id.replaceAll("-", "_");
  return celGate(
    `has(approvals.${approvalName}) && approvals.${approvalName}.exists(approval, approval.stageId == state.stageId && approval.cycle == state.cycles[state.stageId] && approval.decision == "rejected")`,
    `rejection requires an explicit current-cycle ${gate.id} human decision`,
  );
}

const NORMALIZED_CREATE_TASK_SCHEMA = strictObjectSchema(
  {
    clientRef: { type: "string", pattern: CLIENT_REF_PATTERN, maxLength: 64 },
    name: DEX_CONTENT_SCHEMA,
    description: DEX_CONTENT_SCHEMA,
    priority: { type: "integer", minimum: 0, maximum: 100 },
    parentKind: { type: "string", enum: ["root", "reference"] },
    parentClientRef: { type: "string", maxLength: 64 },
    blockedBy: {
      type: "array",
      maxItems: 250,
      items: { type: "string", pattern: CLIENT_REF_PATTERN, maxLength: 64 },
    },
  },
  [
    "clientRef",
    "name",
    "description",
    "priority",
    "parentKind",
    "parentClientRef",
    "blockedBy",
  ],
);

const NORMALIZED_ATTACH_TASK_SCHEMA = strictObjectSchema(
  {
    clientRef: { type: "string", pattern: CLIENT_REF_PATTERN, maxLength: 64 },
    selectorKind: { type: "string", enum: ["id", "exactName"] },
    selectorValue: { type: "string", minLength: 1, maxLength: 51_200 },
    expectedName: DEX_CONTENT_SCHEMA,
    expectedDescription: DEX_EXISTING_DESCRIPTION_SCHEMA,
    expectedPriority: { type: "integer", minimum: 0, maximum: 100 },
    parentKind: {
      type: "string",
      enum: ["preserve", "root", "reference"],
    },
    parentClientRef: { type: "string", maxLength: 64 },
    addBlockedBy: {
      type: "array",
      maxItems: 250,
      items: { type: "string", pattern: CLIENT_REF_PATTERN, maxLength: 64 },
    },
  },
  [
    "clientRef",
    "selectorKind",
    "selectorValue",
    "expectedName",
    "expectedDescription",
    "expectedPriority",
    "parentKind",
    "parentClientRef",
    "addBlockedBy",
  ],
);

// Factory's pinned declared-schema subset cannot represent discriminated
// unions. The approved artifact therefore uses two strict normalized arrays.
// The generated CEL binding deterministically assembles the Plan Applier's
// create|attachExisting union; the applier validates that final object again.
const DEX_PLAN_SCHEMA = strictObjectSchema(
  {
    schemaVersion: { type: "integer", enum: [1] },
    planId: { type: "string", pattern: PLAN_ID_PATTERN },
    createTasks: {
      type: "array",
      maxItems: 250,
      items: NORMALIZED_CREATE_TASK_SCHEMA,
    },
    attachExistingTasks: {
      type: "array",
      maxItems: 250,
      items: NORMALIZED_ATTACH_TASK_SCHEMA,
    },
  },
  ["schemaVersion", "planId", "createTasks", "attachExistingTasks"],
);

const DEX_APPLIER_INPUT_SCHEMA = strictObjectSchema(
  {
    schemaVersion: { type: "integer", enum: [1] },
    planId: { type: "string", pattern: PLAN_ID_PATTERN },
    tasks: {
      type: "array",
      minItems: 1,
      maxItems: 250,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["create", "attachExisting"] },
        },
        required: ["kind"],
        additionalProperties: true,
      },
    },
  },
  ["schemaVersion", "planId", "tasks"],
);

function inventoryArtifact(): Record<string, unknown> {
  return {
    name: "planning-inventory",
    description: "Deterministic repository facts and unresolved judgments.",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        objective: NON_EMPTY_STRING_SCHEMA,
        contextRefs: {
          type: "array",
          items: strictObjectSchema(
            {
              kind: NON_EMPTY_STRING_SCHEMA,
              name: NON_EMPTY_STRING_SCHEMA,
              reference: NON_EMPTY_STRING_SCHEMA,
              summary: NON_EMPTY_STRING_SCHEMA,
            },
            ["kind", "name", "reference", "summary"],
          ),
        },
        unresolvedDecisions: {
          type: "array",
          items: strictObjectSchema(
            {
              id: NON_EMPTY_STRING_SCHEMA,
              question: NON_EMPTY_STRING_SCHEMA,
              reason: NON_EMPTY_STRING_SCHEMA,
            },
            ["id", "question", "reason"],
          ),
        },
        clarificationRequired: { type: "boolean" },
        sourceSnapshotName: NON_EMPTY_STRING_SCHEMA,
        sourceSnapshotFingerprint: SHA256_SCHEMA,
        fingerprint: SHA256_SCHEMA,
      },
      [
        "schemaVersion",
        "objective",
        "contextRefs",
        "unresolvedDecisions",
        "clarificationRequired",
        "sourceSnapshotName",
        "sourceSnapshotFingerprint",
        "fingerprint",
      ],
    ),
  };
}

function trackerInventoryArtifact(): Record<string, unknown> {
  return {
    name: "tracker-inventory",
    description: "Read-only related Dex work used to prevent duplicate plans.",
    reviews: "planning-inventory",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        relatedTasks: {
          type: "array",
          items: strictObjectSchema(
            {
              id: NON_EMPTY_STRING_SCHEMA,
              name: NON_EMPTY_STRING_SCHEMA,
              status: NON_EMPTY_STRING_SCHEMA,
              relationship: NON_EMPTY_STRING_SCHEMA,
            },
            ["id", "name", "status", "relationship"],
          ),
        },
        duplicateRisk: { type: "boolean" },
        summary: NON_EMPTY_STRING_SCHEMA,
        sourceSnapshotFingerprint: SHA256_SCHEMA,
        planningInventoryFingerprint: SHA256_SCHEMA,
        fingerprint: SHA256_SCHEMA,
      },
      [
        "schemaVersion",
        "relatedTasks",
        "duplicateRisk",
        "summary",
        "sourceSnapshotFingerprint",
        "planningInventoryFingerprint",
        "fingerprint",
      ],
    ),
  };
}

function clarificationArtifact(): Record<string, unknown> {
  return {
    name: "clarification",
    description:
      "Only unresolved judgment answers; repository facts stay in inventory.",
    reviews: "tracker-inventory",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: {
          type: "string",
          enum: ["not-needed", "clarified", "parked"],
        },
        decisions: {
          type: "array",
          items: strictObjectSchema(
            {
              id: NON_EMPTY_STRING_SCHEMA,
              answer: NON_EMPTY_STRING_SCHEMA,
              rationale: NON_EMPTY_STRING_SCHEMA,
            },
            ["id", "answer", "rationale"],
          ),
        },
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      ["schemaVersion", "status", "decisions", "summary"],
    ),
  };
}

function clarifiedIntentArtifact(): Record<string, unknown> {
  return {
    name: "clarified-intent",
    description: "Typed planning intent derived from facts and decisions.",
    reviews: "clarification",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: {
          type: "string",
          enum: ["ready", "needs-clarification", "parked"],
        },
        objective: NON_EMPTY_STRING_SCHEMA,
        outcome: NON_EMPTY_STRING_SCHEMA,
        inScope: stringArraySchema(),
        outOfScope: stringArraySchema(),
        constraints: stringArraySchema(),
        acceptanceCriteria: stringArraySchema(1),
        tasteDecisions: stringArraySchema(),
        documentationDirectives: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: strictObjectSchema(
            {
              operation: {
                type: "string",
                enum: ["create", "update", "retire", "no-change"],
              },
              documentKind: NON_EMPTY_STRING_SCHEMA,
              target: NON_EMPTY_STRING_SCHEMA,
              rationale: NON_EMPTY_STRING_SCHEMA,
            },
            ["operation", "documentKind", "target", "rationale"],
          ),
        },
        revision: { type: "integer", minimum: 1 },
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "status",
        "objective",
        "outcome",
        "inScope",
        "outOfScope",
        "constraints",
        "acceptanceCriteria",
        "tasteDecisions",
        "documentationDirectives",
        "revision",
        "summary",
      ],
    ),
  };
}

function documentationEffectsArtifact(): Record<string, unknown> {
  return {
    name: "documentation-effects",
    description:
      "Proposed documentation changes only; this stage cannot mutate documents.",
    reviews: "clarified-intent",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        effects: {
          type: "array",
          items: strictObjectSchema(
            {
              operation: {
                type: "string",
                enum: ["create", "update", "retire", "no-change"],
              },
              documentKind: NON_EMPTY_STRING_SCHEMA,
              target: NON_EMPTY_STRING_SCHEMA,
              rationale: NON_EMPTY_STRING_SCHEMA,
            },
            ["operation", "documentKind", "target", "rationale"],
          ),
        },
        summary: NON_EMPTY_STRING_SCHEMA,
        sourceSnapshotFingerprint: SHA256_SCHEMA,
        planningInventoryFingerprint: SHA256_SCHEMA,
        trackerInventoryFingerprint: SHA256_SCHEMA,
        intentFingerprint: SHA256_SCHEMA,
        fingerprint: SHA256_SCHEMA,
      },
      [
        "schemaVersion",
        "effects",
        "summary",
        "sourceSnapshotFingerprint",
        "planningInventoryFingerprint",
        "trackerInventoryFingerprint",
        "intentFingerprint",
        "fingerprint",
      ],
    ),
  };
}

function graphProposalArtifact(): Record<string, unknown> {
  return {
    name: "dex-graph-proposal",
    description:
      "Complete proposed Dex graph; no tracker mutation has occurred.",
    reviews: "documentation-effects",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        plan: DEX_PLAN_SCHEMA,
        planHash: SHA256_SCHEMA,
        documentationEffectsFingerprint: SHA256_SCHEMA,
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "plan",
        "planHash",
        "documentationEffectsFingerprint",
        "summary",
      ],
    ),
  };
}

function applicationBundleArtifact(): Record<string, unknown> {
  return {
    name: "application-bundle",
    description:
      "Consumer-owned complete mutation preview; the generic compiler owns only its typed envelope.",
    reviews: "documentation-effects",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        kind: NON_EMPTY_STRING_SCHEMA,
        approvalRequired: { type: "boolean" },
        expectsDexMappings: { type: "boolean" },
        payload: { type: "object", additionalProperties: true },
        payloadHash: SHA256_SCHEMA,
        sourceSnapshotFingerprint: SHA256_SCHEMA,
        documentationEffectsFingerprint: SHA256_SCHEMA,
        planHash: SHA256_SCHEMA,
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "kind",
        "approvalRequired",
        "expectsDexMappings",
        "payload",
        "payloadHash",
        "sourceSnapshotFingerprint",
        "documentationEffectsFingerprint",
        "planHash",
        "summary",
      ],
    ),
  };
}

function applicationBundleValidationArtifact(): Record<string, unknown> {
  return {
    name: "application-bundle-validation",
    description:
      "Read-only consumer validation binding the complete application preview to current planning evidence.",
    reviews: "application-bundle",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: { type: "string", enum: ["validated"] },
        kind: NON_EMPTY_STRING_SCHEMA,
        approvalRequired: { type: "boolean" },
        expectsDexMappings: { type: "boolean" },
        payloadHash: SHA256_SCHEMA,
        sourceSnapshotFingerprint: SHA256_SCHEMA,
        documentationEffectsFingerprint: SHA256_SCHEMA,
        planHash: SHA256_SCHEMA,
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "status",
        "kind",
        "approvalRequired",
        "expectsDexMappings",
        "payloadHash",
        "sourceSnapshotFingerprint",
        "documentationEffectsFingerprint",
        "planHash",
        "summary",
      ],
    ),
  };
}

function reviewVerdictArtifact(): Record<string, unknown> {
  return {
    name: "plan-review-verdict",
    reviews: "dex-graph-proposal",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: {
          type: "string",
          enum: ["accept", "revise", "reject", "park"],
        },
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      ["schemaVersion", "status", "summary"],
    ),
  };
}

function approvedPlanArtifact(): Record<string, unknown> {
  return {
    name: "approved-plan",
    description:
      "Exact post-approval plan consumed directly by the Plan Applier through CEL.",
    reviews: "dex-graph-proposal",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        plan: DEX_PLAN_SCHEMA,
        planHash: SHA256_SCHEMA,
        proposalPlanHash: SHA256_SCHEMA,
        approvalGateId: NON_EMPTY_STRING_SCHEMA,
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "plan",
        "planHash",
        "proposalPlanHash",
        "approvalGateId",
        "summary",
      ],
    ),
  };
}

function planApplicationArtifact(): Record<string, unknown> {
  return {
    name: "plan-application",
    description:
      "Normalized checkpoint, receipt, and result references from the application workflow.",
    reviews: "approved-plan",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: { type: "string", enum: ["succeeded", "failed"] },
        planId: { type: "string", pattern: PLAN_ID_PATTERN },
        planHash: SHA256_SCHEMA,
        idempotencyKey: SHA256_SCHEMA,
        attempt: { type: "integer", minimum: 1 },
        checkpointDataName: NON_EMPTY_STRING_SCHEMA,
        receiptDataName: NON_EMPTY_STRING_SCHEMA,
        resultDataName: { type: "string" },
        mappings: {
          type: "array",
          items: strictObjectSchema(
            {
              clientRef: {
                type: "string",
                pattern: CLIENT_REF_PATTERN,
                maxLength: 64,
              },
              dexTaskId: {
                type: "string",
                pattern: TASK_ID_PATTERN,
                maxLength: 128,
              },
              disposition: {
                type: "string",
                enum: ["created", "attachedExisting"],
              },
            },
            ["clientRef", "dexTaskId", "disposition"],
          ),
        },
        retryDisposition: {
          type: "string",
          enum: ["none", "retry", "do-not-retry", "manual-review"],
        },
        errorCode: { type: "string" },
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "status",
        "planId",
        "planHash",
        "idempotencyKey",
        "attempt",
        "checkpointDataName",
        "receiptDataName",
        "resultDataName",
        "mappings",
        "retryDisposition",
        "errorCode",
        "summary",
      ],
    ),
  };
}

function planningAuditArtifact(): Record<string, unknown> {
  return {
    name: "planning-audit",
    description: "Post-application graph and planning-policy verification.",
    reviews: "plan-application",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: { type: "string", enum: ["passed", "failed"] },
        planId: NON_EMPTY_STRING_SCHEMA,
        verifiedTaskIds: stringArraySchema(),
        approvedEpicTaskId: { type: "string", pattern: TASK_ID_PATTERN },
        unresolvedIssues: stringArraySchema(),
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      [
        "schemaVersion",
        "status",
        "planId",
        "verifiedTaskIds",
        "unresolvedIssues",
        "summary",
      ],
    ),
  };
}

function handoffArtifact(): Record<string, unknown> {
  return {
    name: "planning-handoff",
    description:
      "Planning outcome for a later Delivery handoff; this profile does not start delivery.",
    reviews: "planning-audit",
    schema: strictObjectSchema(
      {
        schemaVersion: { type: "integer", enum: [1] },
        status: {
          type: "string",
          enum: ["ready", "no-ready-work", "human-gate"],
        },
        planId: NON_EMPTY_STRING_SCHEMA,
        candidateTaskId: { type: "string", pattern: TASK_ID_PATTERN },
        approvedEpicTaskId: { type: "string", pattern: TASK_ID_PATTERN },
        summary: NON_EMPTY_STRING_SCHEMA,
      },
      ["schemaVersion", "status", "planId", "summary"],
    ),
  };
}

type PlanningTerminalStage =
  | "done"
  | "rejected"
  | "parked"
  | "failed-apply"
  | "failed-audit"
  | "aborted";

function observedTerminalTarget(
  profile: DexPlanningFactoryProfile,
  terminalStage: PlanningTerminalStage,
): string {
  return profile.adapters.terminalObserver === undefined
    ? terminalStage
    : `${terminalStage}-observability`;
}

function terminalObservabilityStage(
  terminalStage: PlanningTerminalStage,
  workflow: string,
  maxDispatchesPerCycle: number,
): FactoryStage {
  return {
    id: `${terminalStage}-observability`,
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
        properties: { workItem: NON_EMPTY_STRING_SCHEMA },
      },
    },
    transitions: [{ name: "finalize", to: terminalStage }],
  };
}

function inventoryStage(profile: DexPlanningFactoryProfile): FactoryStage {
  return {
    id: "inventory",
    initial: true,
    description:
      "Collect deterministic repository facts before asking judgment questions.",
    maxCycles: profile.budgets.inventory,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(profile.adapters.inventory, "inventory-run"),
    artifacts: [inventoryArtifact()],
    transitions: [
      {
        name: "inventory-tracker",
        to: "tracker-inventory",
        gates: [
          adapterSucceededGate(profile.adapters.inventory, "inventory-run", [
            "planning-inventory",
          ]),
          artifactExists("planning-inventory"),
        ],
      },
    ],
  };
}

function trackerInventoryStage(
  profile: DexPlanningFactoryProfile,
): FactoryStage {
  return {
    id: "tracker-inventory",
    description:
      "Read related Dex tasks through the consumer tracker adapter before proposing work.",
    maxCycles: profile.budgets.inventory,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(
      profile.adapters.tracker,
      "tracker-inventory-run",
      {
        workItem: CEL_WORK_ITEM,
        inventory: PLANNING_INVENTORY_BINDING,
      },
      {
        workItem: NON_EMPTY_STRING_SCHEMA,
        inventory: inventoryArtifact().schema as FactoryDeclaredSchema,
      },
    ),
    artifacts: [trackerInventoryArtifact()],
    transitions: [
      {
        name: "clarify",
        to: "clarification",
        gates: [
          adapterSucceededGate(
            profile.adapters.tracker,
            "tracker-inventory-run",
            ["tracker-inventory"],
          ),
          artifactFresh("tracker-inventory"),
        ],
      },
    ],
  };
}

function clarificationStage(profile: DexPlanningFactoryProfile): FactoryStage {
  return {
    id: "clarification",
    description:
      "Conditionally grill only unresolved judgments; record not-needed when inventory is complete.",
    maxCycles: profile.budgets.clarification,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork(profile.clarification, [
      "planning-inventory",
      "tracker-inventory",
    ]),
    artifacts: [clarificationArtifact()],
    transitions: [
      {
        name: "intent",
        to: "clarified-intent",
        gates: [
          artifactFresh("clarification"),
          celGate(
            'artifacts.clarification.status in ["not-needed", "clarified"] && ((artifacts.planning_inventory.clarificationRequired && artifacts.clarification.status == "clarified") || (!artifacts.planning_inventory.clarificationRequired && artifacts.clarification.status == "not-needed"))',
            "clarification status must match the deterministic inventory decision",
          ),
        ],
      },
      {
        name: "park",
        to: observedTerminalTarget(profile, "parked"),
        gates: [
          artifactFresh("clarification"),
          celGate(
            'artifacts.clarification.status == "parked"',
            "parking requires an explicit parked clarification",
          ),
        ],
      },
    ],
  };
}

function clarifiedIntentStage(
  profile: DexPlanningFactoryProfile,
): FactoryStage {
  return {
    id: "clarified-intent",
    description: "Normalize the objective into a complete typed intent.",
    maxCycles: profile.budgets.intent,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork(profile.intent, [
      "planning-inventory",
      "tracker-inventory",
      "clarification",
      "plan-review-findings",
      "plan-review-verdict",
    ]),
    artifacts: [clarifiedIntentArtifact()],
    transitions: [
      {
        name: "documentation-effects",
        to: "documentation-effects",
        gates: [
          artifactFresh("clarified-intent"),
          celGate(
            'artifacts.clarified_intent.status == "ready"',
            "documentation planning requires ready clarified intent",
          ),
        ],
      },
      {
        name: "clarify-again",
        to: "clarification",
        gates: [
          artifactFresh("clarified-intent"),
          celGate(
            'artifacts.clarified_intent.status == "needs-clarification"',
            "clarification re-entry requires an explicit needs-clarification status",
          ),
        ],
      },
      {
        name: "park",
        to: observedTerminalTarget(profile, "parked"),
        gates: [
          artifactFresh("clarified-intent"),
          celGate(
            'artifacts.clarified_intent.status == "parked"',
            "parking requires an explicit parked intent",
          ),
        ],
      },
    ],
  };
}

function documentationEffectsStage(
  profile: DexPlanningFactoryProfile,
): FactoryStage {
  return {
    id: "documentation-effects",
    description:
      "Propose documentation effects through read-only repository policy.",
    maxCycles: profile.budgets.documentation,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(
      profile.adapters.documentationPolicy,
      "documentation-policy-run",
      {
        workItem: CEL_WORK_ITEM,
        inventory: PLANNING_INVENTORY_BINDING,
        trackerInventory: TRACKER_INVENTORY_BINDING,
        intent: CLARIFIED_INTENT_BINDING,
      },
      {
        workItem: NON_EMPTY_STRING_SCHEMA,
        inventory: inventoryArtifact().schema as FactoryDeclaredSchema,
        trackerInventory: trackerInventoryArtifact()
          .schema as FactoryDeclaredSchema,
        intent: clarifiedIntentArtifact().schema as FactoryDeclaredSchema,
      },
    ),
    artifacts: [documentationEffectsArtifact()],
    transitions: [
      {
        name: "revise-intent",
        to: "clarified-intent",
        gates: [artifactExists("clarified-intent")],
      },
      {
        name: "propose-graph",
        to: "graph-proposal",
        gates: [
          adapterSucceededGate(
            profile.adapters.documentationPolicy,
            "documentation-policy-run",
            ["documentation-effects"],
          ),
          artifactFresh("documentation-effects"),
        ],
      },
    ],
  };
}

function graphProposalStage(profile: DexPlanningFactoryProfile): FactoryStage {
  const usesApplicationBundle =
    profile.adapters.applicationBundle !== undefined;
  const taskCountExpression = usesApplicationBundle
    ? "size(artifacts.dex_graph_proposal.plan.createTasks) + size(artifacts.dex_graph_proposal.plan.attachExistingTasks) <= 250"
    : "size(artifacts.dex_graph_proposal.plan.createTasks) + size(artifacts.dex_graph_proposal.plan.attachExistingTasks) > 0 && size(artifacts.dex_graph_proposal.plan.createTasks) + size(artifacts.dex_graph_proposal.plan.attachExistingTasks) <= 250";
  return {
    id: "graph-proposal",
    description: usesApplicationBundle
      ? "Propose the complete consumer application bundle and any Dex graph without mutating repository state."
      : "Propose a complete Dex graph without mutating tracker state.",
    maxCycles: profile.budgets.proposal,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork(profile.proposal, [
      "planning-inventory",
      "tracker-inventory",
      "clarified-intent",
      "documentation-effects",
      "plan-review-findings",
      "plan-review-verdict",
    ]),
    artifacts: [
      graphProposalArtifact(),
      ...(usesApplicationBundle ? [applicationBundleArtifact()] : []),
    ],
    transitions: [
      {
        name: usesApplicationBundle
          ? "validate-application-bundle"
          : "review-plan",
        to: usesApplicationBundle
          ? "application-bundle-validation"
          : "plan-review",
        gates: [
          artifactFresh("dex-graph-proposal"),
          ...(usesApplicationBundle
            ? [artifactFresh("application-bundle")]
            : []),
          celGate(
            `${taskCountExpression} && artifacts.dex_graph_proposal.plan.createTasks.all(task, (task.parentKind == 'root' && task.parentClientRef == '') || (task.parentKind == 'reference' && task.parentClientRef.matches('${CLIENT_REF_PATTERN}'))) && artifacts.dex_graph_proposal.plan.attachExistingTasks.all(task, (((task.parentKind in ['preserve', 'root']) && task.parentClientRef == '') || (task.parentKind == 'reference' && task.parentClientRef.matches('${CLIENT_REF_PATTERN}'))) && ((task.selectorKind == 'id' && size(task.selectorValue) <= 128 && task.selectorValue.matches('${TASK_ID_PATTERN}')) || (task.selectorKind == 'exactName' && size(task.selectorValue) <= 51200)))`,
            usesApplicationBundle
              ? "bundle proposal permits zero to 250 normalized tasks; consumer validation owns route-specific graph requirements"
              : "proposal requires one to 250 normalized tasks with Plan-Applier-compatible parent and selector values",
          ),
        ],
      },
    ],
  };
}

function applicationBundleValidationStage(
  profile: DexPlanningFactoryProfile,
): FactoryStage {
  const hook = profile.adapters.applicationBundle;
  if (hook === undefined) {
    throw new Error("Application bundle validation requires a configured hook");
  }
  return {
    id: "application-bundle-validation",
    description:
      "Validate the complete consumer-owned mutation preview before review or approval.",
    maxCycles: profile.budgets.proposal,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(
      hook.validator,
      "application-bundle-validation-run",
      {
        workItem: CEL_WORK_ITEM,
        inventory: PLANNING_INVENTORY_BINDING,
        trackerInventory: TRACKER_INVENTORY_BINDING,
        documentationEffects: DOCUMENTATION_EFFECTS_BINDING,
        reviewedPlan: GRAPH_PROPOSAL_BINDING,
        applicationBundle: APPLICATION_BUNDLE_BINDING,
      },
      {
        workItem: NON_EMPTY_STRING_SCHEMA,
        inventory: inventoryArtifact().schema as FactoryDeclaredSchema,
        trackerInventory: trackerInventoryArtifact()
          .schema as FactoryDeclaredSchema,
        documentationEffects: documentationEffectsArtifact()
          .schema as FactoryDeclaredSchema,
        reviewedPlan: DEX_PLAN_SCHEMA,
        applicationBundle: applicationBundleArtifact()
          .schema as FactoryDeclaredSchema,
      },
    ),
    artifacts: [applicationBundleValidationArtifact()],
    transitions: [
      {
        name: "review-plan",
        to: "plan-review",
        gates: [
          adapterSucceededGate(
            hook.validator,
            "application-bundle-validation-run",
            ["application-bundle-validation"],
          ),
          artifactFresh("application-bundle-validation"),
          celGate(
            "artifacts.application_bundle_validation.status == 'validated' && artifacts.application_bundle_validation.kind == artifacts.application_bundle.kind && artifacts.application_bundle_validation.approvalRequired == artifacts.application_bundle.approvalRequired && artifacts.application_bundle_validation.expectsDexMappings == artifacts.application_bundle.expectsDexMappings && artifacts.application_bundle_validation.payloadHash == artifacts.application_bundle.payloadHash && artifacts.application_bundle_validation.sourceSnapshotFingerprint == artifacts.application_bundle.sourceSnapshotFingerprint && artifacts.application_bundle_validation.sourceSnapshotFingerprint == artifacts.planning_inventory.sourceSnapshotFingerprint && artifacts.application_bundle_validation.documentationEffectsFingerprint == artifacts.application_bundle.documentationEffectsFingerprint && artifacts.application_bundle_validation.documentationEffectsFingerprint == artifacts.documentation_effects.fingerprint && artifacts.application_bundle_validation.planHash == artifacts.application_bundle.planHash && artifacts.application_bundle_validation.planHash == artifacts.dex_graph_proposal.planHash",
            "application bundle validation must bind the complete preview envelope",
          ),
        ],
      },
    ],
  };
}

function reviewStage(profile: DexPlanningFactoryProfile): FactoryStage {
  const usesApplicationBundle =
    profile.adapters.applicationBundle !== undefined;
  const acceptedProposalGates = [
    artifactFresh("plan-review-findings"),
    artifactFresh("plan-review-verdict"),
    {
      type: "findings-clear",
      config: {
        artifact: "plan-review-findings",
        blocking: profile.review.blockingSeverities,
      },
    },
    celGate(
      'artifacts.plan_review_verdict.status == "accept"',
      "application requires an explicit accept verdict",
    ),
  ];
  const reviewedArtifact = usesApplicationBundle
    ? "application-bundle"
    : "dex-graph-proposal";
  return {
    id: "plan-review",
    description: usesApplicationBundle
      ? "Independently review the complete validated application bundle."
      : "Independently review the documentation and Dex graph proposals.",
    maxCycles: profile.budgets.review,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: {
      mode: "dispatch",
      skills: profile.review.skills,
      systemPrompt: profile.review.systemPrompt,
      context: {
        inject: [
          "planning-inventory",
          "tracker-inventory",
          "clarified-intent",
          "documentation-effects",
          "dex-graph-proposal",
          ...(usesApplicationBundle
            ? ["application-bundle", "application-bundle-validation"]
            : []),
        ],
      },
    },
    artifacts: [
      {
        name: "plan-review-findings",
        kind: "findings",
        reviews: reviewedArtifact,
      },
      { ...reviewVerdictArtifact(), reviews: reviewedArtifact },
    ],
    transitions: [
      {
        name: "reinventory",
        to: "inventory",
        gates: [
          artifactFresh("plan-review-findings"),
          artifactFresh("plan-review-verdict"),
          celGate(
            'artifacts.plan_review_verdict.status == "revise"',
            "reinventory requires an explicit revise verdict",
          ),
        ],
      },
      {
        name: "revise",
        to: "clarified-intent",
        gates: [
          artifactFresh("plan-review-findings"),
          artifactFresh("plan-review-verdict"),
          celGate(
            'artifacts.plan_review_verdict.status == "revise"',
            "revision requires an explicit revise verdict",
          ),
        ],
      },
      ...(usesApplicationBundle
        ? [
          {
            name: "apply-without-graduation-approval",
            to: "plan-application",
            gates: [
              ...acceptedProposalGates,
              celGate(
                "artifacts.application_bundle.approvalRequired == false",
                "approval-free application requires a validated no-approval bundle",
              ),
            ],
          },
          {
            name: "approve-and-apply",
            to: "plan-application",
            gates: [
              ...acceptedProposalGates,
              celGate(
                "artifacts.application_bundle.approvalRequired == true",
                "graduation application requires an approval-bound bundle",
              ),
              humanApprovalGate(profile.humanGate),
            ],
          },
        ]
        : [
          {
            name: "approve",
            to: "approval",
            gates: [
              ...acceptedProposalGates,
              humanApprovalGate(profile.humanGate),
            ],
          },
        ]),
      {
        name: "human-reject",
        to: observedTerminalTarget(profile, "rejected"),
        gates: [
          ...acceptedProposalGates,
          ...(usesApplicationBundle
            ? [celGate(
              "artifacts.application_bundle.approvalRequired == true",
              "human rejection applies only to approval-bound bundles",
            )]
            : []),
          humanRejectionGate(profile.humanGate),
        ],
      },
      {
        name: "reject",
        to: observedTerminalTarget(profile, "rejected"),
        gates: [
          artifactFresh("plan-review-findings"),
          artifactFresh("plan-review-verdict"),
          celGate(
            'artifacts.plan_review_verdict.status == "reject"',
            "rejection requires an explicit reject verdict",
          ),
        ],
      },
      {
        name: "park",
        to: observedTerminalTarget(profile, "parked"),
        gates: [
          artifactFresh("plan-review-findings"),
          artifactFresh("plan-review-verdict"),
          celGate(
            'artifacts.plan_review_verdict.status == "park"',
            "parking requires an explicit park verdict",
          ),
        ],
      },
    ],
  };
}

function approvalStage(profile: DexPlanningFactoryProfile): FactoryStage {
  return {
    id: "approval",
    description:
      "Persist the exact approved proposal only after the human approval gate.",
    maxCycles: profile.budgets.approval,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork(profile.approval, [
      "documentation-effects",
      "dex-graph-proposal",
      "plan-review-verdict",
    ]),
    artifacts: [approvedPlanArtifact()],
    transitions: [
      {
        name: "apply-plan",
        to: "plan-application",
        gates: [
          artifactFresh("approved-plan"),
          celGate(
            'artifacts.approved_plan.plan == artifacts.dex_graph_proposal.plan && artifacts.approved_plan.planHash == artifacts.dex_graph_proposal.planHash && artifacts.approved_plan.proposalPlanHash == artifacts.dex_graph_proposal.planHash && artifacts.approved_plan.approvalGateId == "' +
              profile.humanGate.id +
              '"',
            "approved plan must retain the reviewed proposal hash and approval gate",
          ),
        ],
      },
    ],
  };
}

function planApplicationStage(
  profile: DexPlanningFactoryProfile,
): FactoryStage {
  const usesApplicationBundle =
    profile.adapters.applicationBundle !== undefined;
  const work = usesApplicationBundle
    ? adapterWork(
      profile.adapters.planApplier,
      "plan-apply-run",
      {
        workItem: CEL_WORK_ITEM,
        planningInventory: PLANNING_INVENTORY_BINDING,
        trackerInventory: TRACKER_INVENTORY_BINDING,
        documentationEffects: DOCUMENTATION_EFFECTS_BINDING,
        reviewedPlan: GRAPH_PROPOSAL_BINDING,
        applicationBundle: APPLICATION_BUNDLE_BINDING,
        applicationBundleValidation: APPLICATION_BUNDLE_VALIDATION_BINDING,
        approvalGateId:
          '${{ data.latest(self.name, "artifact-application-bundle").payload.approvalRequired ? "' +
          profile.humanGate.id +
          '" : "not-required" }}',
      },
      {
        workItem: NON_EMPTY_STRING_SCHEMA,
        planningInventory: inventoryArtifact().schema as FactoryDeclaredSchema,
        trackerInventory: trackerInventoryArtifact()
          .schema as FactoryDeclaredSchema,
        documentationEffects: documentationEffectsArtifact()
          .schema as FactoryDeclaredSchema,
        reviewedPlan: DEX_PLAN_SCHEMA,
        applicationBundle: applicationBundleArtifact()
          .schema as FactoryDeclaredSchema,
        applicationBundleValidation: applicationBundleValidationArtifact()
          .schema as FactoryDeclaredSchema,
        approvalGateId: NON_EMPTY_STRING_SCHEMA,
      },
    )
    : adapterWork(
      profile.adapters.planApplier,
      "plan-apply-run",
      {
        workItem: CEL_WORK_ITEM,
        reviewedPlan: REVIEWED_PLAN_BINDING,
        plan: APPROVED_PLAN_BINDING,
      },
      {
        workItem: NON_EMPTY_STRING_SCHEMA,
        reviewedPlan: DEX_PLAN_SCHEMA,
        plan: DEX_APPLIER_INPUT_SCHEMA,
      },
    );
  const requiredArtifacts = usesApplicationBundle
    ? ["approved-plan", "plan-application"]
    : ["plan-application"];
  return {
    id: "plan-application",
    description: usesApplicationBundle
      ? "Persist the exact reviewed boundary and apply its validated consumer bundle immediately after any required approval."
      : "Apply the approved graph through one consumer fan-out adapter.",
    maxCycles: profile.budgets.application,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work,
    artifacts: [
      ...(usesApplicationBundle ? [approvedPlanArtifact()] : []),
      planApplicationArtifact(),
    ],
    transitions: [
      {
        name: "audit",
        to: "planning-audit",
        gates: [
          adapterSucceededGate(
            profile.adapters.planApplier,
            "plan-apply-run",
            requiredArtifacts,
          ),
          ...(usesApplicationBundle
            ? [
              artifactFresh("approved-plan"),
              celGate(
                'artifacts.approved_plan.plan == artifacts.dex_graph_proposal.plan && artifacts.approved_plan.planHash == artifacts.dex_graph_proposal.planHash && artifacts.approved_plan.proposalPlanHash == artifacts.dex_graph_proposal.planHash && artifacts.approved_plan.approvalGateId == (artifacts.application_bundle.approvalRequired ? "' +
                  profile.humanGate.id +
                  '" : "not-required")',
                "recorded application boundary must retain the reviewed plan and exact approval disposition",
              ),
            ]
            : []),
          artifactFresh("plan-application"),
          celGate(
            usesApplicationBundle
              ? 'artifacts.plan_application.status == "succeeded" && artifacts.plan_application.retryDisposition == "none" && artifacts.plan_application.errorCode == "" && artifacts.plan_application.resultDataName != "" && ((artifacts.application_bundle.expectsDexMappings && size(artifacts.plan_application.mappings) > 0) || (!artifacts.application_bundle.expectsDexMappings && size(artifacts.plan_application.mappings) == 0))'
              : 'artifacts.plan_application.status == "succeeded" && artifacts.plan_application.retryDisposition == "none" && artifacts.plan_application.errorCode == "" && artifacts.plan_application.resultDataName != "" && size(artifacts.plan_application.mappings) > 0',
            usesApplicationBundle
              ? "audit requires a complete successful bundle result with route-correct Dex mappings"
              : "audit requires a complete successful Plan Applier result",
          ),
        ],
      },
      {
        name: "failed-apply",
        to: observedTerminalTarget(profile, "failed-apply"),
        gates: [
          adapterSucceededGate(
            profile.adapters.planApplier,
            "plan-apply-run",
            requiredArtifacts,
          ),
          ...(usesApplicationBundle ? [artifactFresh("approved-plan")] : []),
          artifactFresh("plan-application"),
          celGate(
            'artifacts.plan_application.status == "failed" && artifacts.plan_application.retryDisposition != "none" && artifacts.plan_application.errorCode != "" && artifacts.plan_application.resultDataName == ""',
            "failed application requires a complete typed failure receipt",
          ),
        ],
      },
    ],
  };
}

function planningAuditStage(profile: DexPlanningFactoryProfile): FactoryStage {
  const usesApplicationBundle =
    profile.adapters.applicationBundle !== undefined;
  return {
    id: "planning-audit",
    description: usesApplicationBundle
      ? "Verify the applied consumer bundle and repository planning policy before handoff."
      : "Verify the applied graph and repository planning policy before handoff.",
    maxCycles: profile.budgets.audit,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: adapterWork(
      profile.adapters.audit,
      "planning-audit-run",
      usesApplicationBundle
        ? {
          workItem: CEL_WORK_ITEM,
          reviewedPlan: GRAPH_PROPOSAL_BINDING,
          applicationBundle: APPLICATION_BUNDLE_BINDING,
          applicationBundleValidation: APPLICATION_BUNDLE_VALIDATION_BINDING,
          application: PLAN_APPLICATION_BINDING,
          documentationEffects: DOCUMENTATION_EFFECTS_BINDING,
        }
        : {
          workItem: CEL_WORK_ITEM,
          approvedPlan: APPROVED_PLAN_BINDING,
          application: PLAN_APPLICATION_BINDING,
          documentationEffects: DOCUMENTATION_EFFECTS_BINDING,
        },
      usesApplicationBundle
        ? {
          workItem: NON_EMPTY_STRING_SCHEMA,
          reviewedPlan: DEX_PLAN_SCHEMA,
          applicationBundle: applicationBundleArtifact()
            .schema as FactoryDeclaredSchema,
          applicationBundleValidation: applicationBundleValidationArtifact()
            .schema as FactoryDeclaredSchema,
          application: planApplicationArtifact()
            .schema as FactoryDeclaredSchema,
          documentationEffects: documentationEffectsArtifact()
            .schema as FactoryDeclaredSchema,
        }
        : {
          workItem: NON_EMPTY_STRING_SCHEMA,
          approvedPlan: DEX_APPLIER_INPUT_SCHEMA,
          application: planApplicationArtifact()
            .schema as FactoryDeclaredSchema,
          documentationEffects: documentationEffectsArtifact()
            .schema as FactoryDeclaredSchema,
        },
    ),
    artifacts: [planningAuditArtifact()],
    transitions: [
      {
        name: "handoff",
        to: "handoff",
        gates: [
          adapterSucceededGate(
            profile.adapters.audit,
            "planning-audit-run",
            ["planning-audit"],
          ),
          artifactFresh("planning-audit"),
          celGate(
            'artifacts.planning_audit.status == "passed" && size(artifacts.planning_audit.unresolvedIssues) == 0',
            "handoff requires a clean planning audit",
          ),
        ],
      },
      {
        name: "failed-audit",
        to: observedTerminalTarget(profile, "failed-audit"),
        gates: [
          adapterSucceededGate(
            profile.adapters.audit,
            "planning-audit-run",
            ["planning-audit"],
          ),
          artifactFresh("planning-audit"),
          celGate(
            'artifacts.planning_audit.status == "failed" || size(artifacts.planning_audit.unresolvedIssues) > 0',
            "failed audit requires failed status or unresolved issues",
          ),
        ],
      },
    ],
  };
}

function handoffStage(profile: DexPlanningFactoryProfile): FactoryStage {
  return {
    id: "handoff",
    description:
      "Expose one typed planning result without starting Delivery or creating more work.",
    maxCycles: profile.budgets.handoff,
    maxDispatchesPerCycle: profile.budgets.maxDispatchesPerCycle,
    work: interactiveWork(profile.handoff, [
      "approved-plan",
      "plan-application",
      "planning-audit",
      ...(profile.adapters.applicationBundle === undefined
        ? []
        : ["application-bundle", "application-bundle-validation"]),
    ]),
    artifacts: [handoffArtifact()],
    transitions: [
      {
        name: "finish",
        to: observedTerminalTarget(profile, "done"),
        gates: [artifactFresh("planning-handoff")],
      },
    ],
  };
}

/** Compile one repository profile into @swamp/software-factory arguments. */
export function compileDexPlanningFactoryProfile(
  input: DexPlanningFactoryProfile,
): CompiledDexPlanningFactoryProfile {
  const profile = DexPlanningFactoryProfileSchema.parse(input);
  const stages = [
    inventoryStage(profile),
    trackerInventoryStage(profile),
    clarificationStage(profile),
    clarifiedIntentStage(profile),
    documentationEffectsStage(profile),
    graphProposalStage(profile),
    ...(profile.adapters.applicationBundle === undefined
      ? []
      : [applicationBundleValidationStage(profile)]),
    reviewStage(profile),
    ...(profile.adapters.applicationBundle === undefined
      ? [approvalStage(profile)]
      : []),
    planApplicationStage(profile),
    planningAuditStage(profile),
    handoffStage(profile),
    ...(profile.adapters.terminalObserver === undefined ? [] : ([
      "done",
      "rejected",
      "parked",
      "failed-apply",
      "failed-audit",
      "aborted",
    ] as const).map((terminalStage) =>
      terminalObservabilityStage(
        terminalStage,
        profile.adapters.terminalObserver!.workflow,
        profile.budgets.maxDispatchesPerCycle,
      )
    )),
    { id: "done", terminal: true },
    { id: "rejected", terminal: true },
    { id: "parked", terminal: true },
    { id: "failed-apply", terminal: true },
    { id: "failed-audit", terminal: true },
    { id: "aborted", terminal: true },
  ];

  return CompiledDexPlanningFactoryProfileSchema.parse({
    schemaVersion: 1,
    compilerVersion: DEX_PLANNING_FACTORY_VERSION,
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
          to: observedTerminalTarget(profile, "aborted"),
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

const STRUCTURED_PROFILE_KEYS = [
  "adapters",
  "clarification",
  "intent",
  "proposal",
  "review",
  "approval",
  "handoff",
  "humanGate",
  "budgets",
] as const;

function normalizePlanningProfileGlobalArgs(
  rawProfile: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...rawProfile };
  for (const key of STRUCTURED_PROFILE_KEYS) {
    const value = normalized[key];
    if (typeof value !== "string") continue;
    try {
      normalized[key] = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Global argument '${key}' must be structured JSON`);
    }
  }
  return normalized;
}

/** Compile and persist the planning profile configured on this model. */
export async function executeDexPlanningFactoryCompile(
  _contextArgs: Record<string, never>,
  context: DexPlanningFactoryMethodContext,
): Promise<DexPlanningFactoryExecutionResult> {
  context.logger.info("Compiling Dex Planning Factory profile");
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
  const compiled = compileDexPlanningFactoryProfile(
    DexPlanningFactoryProfileSchema.parse(
      normalizePlanningProfileGlobalArgs(rawProfile),
    ),
  );
  const handle = await context.writeResource(
    "profile",
    "compiled-profile",
    compiled,
  );
  context.logger.info("Compiled Dex Planning Factory profile {profileName}", {
    profileName: compiled.profileName,
  });
  return { dataHandles: [handle] };
}
