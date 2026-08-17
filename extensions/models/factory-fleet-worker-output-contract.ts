const GIT_REVISION_PATTERN = "^[0-9a-f]{40,64}$";
const FACTORY_HANDOFF_PROTECTED_PATHS = [
  "extensions/models/upstream_extensions.json",
] as const;
const FACTORY_HANDOFF_PROTECTED_PREFIXES = [
  ".claude/skills/software-factory",
  ".swamp/pulled-extensions/@swamp/software-factory",
  ".swamp/bundles",
  ".swamp/report-bundles",
] as const;
const FACTORY_HANDOFF_PROTECTED_PATH_SET: ReadonlySet<string> = new Set(
  FACTORY_HANDOFF_PROTECTED_PATHS,
);
const escapeRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const protectedRepositoryPathPattern = [
  ...FACTORY_HANDOFF_PROTECTED_PATHS.map((path) =>
    `${escapeRegularExpression(path)}$`
  ),
  ...FACTORY_HANDOFF_PROTECTED_PREFIXES.map((prefix) =>
    `${escapeRegularExpression(prefix)}(?:/|$)`
  ),
].join("|");
const REPOSITORY_PATH_PATTERN =
  `^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!(?:${protectedRepositoryPathPattern})).+$`;

/** Central pre-integration policy for generic pulled Factory and registry paths. */
export function factoryHandoffPathIsProtected(path: string): boolean {
  return FACTORY_HANDOFF_PROTECTED_PATH_SET.has(path) ||
    FACTORY_HANDOFF_PROTECTED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}

export const FACTORY_FLEET_WORKER_OUTPUT_REQUIRED_FIELDS = [
  "rootEpicId",
  "activeTaskId",
  "workItem",
  "piKey",
  "dispatchToken",
  "piRunId",
  "claimNonce",
  "baseCommit",
  "childCommittedRevision",
  "changedPaths",
  "commandsRun",
  "residualRisks",
  "summary",
] as const;

export interface FactoryFleetWorkerIdentity {
  rootEpicId: string;
  activeTaskId: string;
  workItem: string;
  piKey: string;
}

export interface FactoryFleetWorkerOutput {
  rootEpicId: string;
  activeTaskId: string;
  workItem: string;
  piKey: string;
  dispatchToken: string;
  piRunId: string;
  claimNonce: string;
  baseCommit: string;
  childCommittedRevision: string;
  changedPaths: string[];
  commandsRun: Array<{
    command: string;
    result: "passed" | "failed" | "not-run";
    summary: string;
  }>;
  residualRisks: string[];
  summary: string;
}

export interface FactoryFleetWorkerOutputJsonSchema {
  type: "object";
  additionalProperties: false;
  required: readonly string[];
  properties: Readonly<Record<string, unknown>>;
}

/**
 * The authoritative Pi handoff JSON Schema. The integration parser is derived
 * from this exact lane-bound schema and adds only the ordering check that JSON
 * Schema cannot express.
 */
export function createFactoryFleetWorkerOutputJsonSchema(
  identity: FactoryFleetWorkerIdentity,
): FactoryFleetWorkerOutputJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: [...FACTORY_FLEET_WORKER_OUTPUT_REQUIRED_FIELDS],
    properties: {
      rootEpicId: { type: "string", enum: [identity.rootEpicId] },
      activeTaskId: { type: "string", enum: [identity.activeTaskId] },
      workItem: { type: "string", enum: [identity.workItem] },
      piKey: { type: "string", enum: [identity.piKey] },
      dispatchToken: { type: "string", pattern: "^[0-9a-f]{64}$" },
      piRunId: { type: "string", pattern: "^[A-Za-z0-9-]{8,128}$" },
      claimNonce: { type: "string", pattern: "^[0-9a-f]{64}$" },
      baseCommit: { type: "string", pattern: GIT_REVISION_PATTERN },
      childCommittedRevision: { type: "string", pattern: GIT_REVISION_PATTERN },
      changedPaths: {
        type: "array",
        minItems: 1,
        maxItems: 2_000,
        uniqueItems: true,
        items: {
          type: "string",
          minLength: 1,
          maxLength: 1_000,
          pattern: REPOSITORY_PATH_PATTERN,
        },
      },
      commandsRun: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["command", "result", "summary"],
          properties: {
            command: { type: "string", minLength: 1 },
            result: { type: "string", enum: ["passed", "failed", "not-run"] },
            summary: { type: "string", minLength: 1 },
          },
        },
      },
      residualRisks: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      summary: { type: "string", minLength: 1 },
    },
  };
}

function normalizeJsonSchema(value: unknown, parentKey?: string): unknown {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeJsonSchema(entry));
    if (parentKey === "required" || parentKey === "enum") {
      return normalized.sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      );
    }
    return normalized;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJsonSchema(entry, key)]),
    );
  }
  throw new TypeError(`Unsupported JSON Schema value: ${typeof value}`);
}

/** Compare JSON Schemas by meaning while still rejecting every extra contract keyword. */
export function factoryFleetWorkerOutputSchemasSemanticallyEqual(
  candidate: unknown,
  expected: FactoryFleetWorkerOutputJsonSchema,
): boolean {
  try {
    return JSON.stringify(normalizeJsonSchema(candidate)) ===
      JSON.stringify(normalizeJsonSchema(expected));
  } catch {
    return false;
  }
}

export function factoryFleetChangedPathsAreSorted(
  paths: readonly string[],
): boolean {
  return paths.every((path, index) =>
    index === 0 || paths[index - 1]!.localeCompare(path) < 0
  );
}

export function factoryFleetChangedPathsAreAllowed(
  paths: readonly string[],
): boolean {
  return paths.every((path) => !factoryHandoffPathIsProtected(path));
}
