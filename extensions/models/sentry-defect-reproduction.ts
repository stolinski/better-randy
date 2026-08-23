import { z } from "npm:zod@4.4.3";

import {
  canonicalSentryJson,
  createSentrySha256,
  type SentryCommandRunner,
} from "./sentry-issue-intake-adapter.ts";
import { SentryIssueRepairEvidenceSchema } from "./sentry-issue-repair-evidence.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const RouteSchema = z.string().regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,500}$/);

export const ReproduceSentryDefectArgsSchema = z.strictObject({
  evidenceName: z.string().min(1).max(220),
  expectedEvidenceFingerprint: FingerprintSchema,
});

export const VerifySentryNoRecurrenceArgsSchema = z.strictObject({
  reproductionName: z.string().min(1).max(220),
  expectedReproductionFingerprint: FingerprintSchema,
  integratedRevision: GitRevisionSchema,
  verificationRecordedAt: z.string().datetime(),
});

export const SentryDefectReproductionAttemptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("supers-sentry-code-owned-reproduction-v1"),
  evidenceName: z.string().min(1),
  evidenceFingerprint: FingerprintSchema,
  issueId: z.string().min(1),
  shortId: z.string().min(1),
  checkoutRevision: GitRevisionSchema,
  route: RouteSchema,
  sourceEventId: z.string().min(1),
  sourceLastSeen: z.string().datetime(),
  preparedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryDefectReproductionRejectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("supers-sentry-code-owned-reproduction-v1"),
  capabilityVersion: z.literal(2),
  status: z.literal("unsupported"),
  reason: z.enum(["no-code-owned-route", "not-reproduced-on-head"]),
  evidenceName: z.string().min(1),
  evidenceFingerprint: FingerprintSchema,
  repairIntentFingerprint: FingerprintSchema,
  repairIdentityFingerprint: FingerprintSchema,
  issueId: z.string().min(1),
  shortId: z.string().min(1),
  checkoutRevision: GitRevisionSchema,
  rejectedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryDefectReproductionReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("supers-sentry-code-owned-reproduction-v1"),
  status: z.literal("reproduced"),
  evidenceName: z.string().min(1),
  evidenceFingerprint: FingerprintSchema,
  repairIdentityFingerprint: FingerprintSchema,
  issueId: z.string().min(1),
  shortId: z.string().min(1),
  checkoutRevision: GitRevisionSchema,
  reproducedInRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
  route: RouteSchema,
  sourceEventId: z.string().min(1),
  reproducedEventId: z.string().min(1),
  sourceLastSeen: z.string().datetime(),
  reproducedLastSeen: z.string().datetime(),
  observedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryNoRecurrenceReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("supers-sentry-code-owned-no-recurrence-v1"),
  status: z.literal("passed"),
  reproductionName: z.string().min(1),
  reproductionFingerprint: FingerprintSchema,
  issueId: z.string().min(1),
  shortId: z.string().min(1),
  integratedRevision: GitRevisionSchema,
  verifiedRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
  route: RouteSchema,
  priorEventId: z.string().min(1),
  priorLastSeen: z.string().datetime(),
  checkedAt: z.string().datetime(),
  verificationRecordedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

type RepairEvidence = z.infer<typeof SentryIssueRepairEvidenceSchema>;
type FreshIssue = {
  id: string;
  shortId: string;
  status: string;
  lastSeen: string;
  eventId: string;
  eventRelease: string | null;
};

const RawIssueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  status: z.string(),
  lastSeen: z.string().datetime(),
  event: z.object({
    eventID: z.string(),
    release: z.union([z.string(), z.object({ version: z.string() }).passthrough()]).nullish(),
  }).passthrough(),
}).passthrough();

export type SentryDefectReproductionContext = {
  modelId: string;
  repoDir: string;
  dataRepository: {
    getContent(type: unknown, modelId: string, name: string, version?: number): Promise<Uint8Array | null>;
  };
  writeResource(specName: string, name: string, data: Record<string, unknown>): Promise<{ name: string }>;
};

export type SentryDefectReproductionDependencies = {
  commandRunner: SentryCommandRunner;
  driveRoute(route: string): Promise<void>;
  waitForObservation(): Promise<void>;
  now(): string;
};

function withoutFingerprint(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "fingerprint"));
}

async function fingerprinted<T extends Record<string, unknown>>(base: T): Promise<T & { fingerprint: string }> {
  return { ...base, fingerprint: await createSentrySha256(canonicalSentryJson(base)) };
}

async function readResource<T>(
  context: SentryDefectReproductionContext,
  type: string,
  modelId: string,
  name: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const content = await context.dataRepository.getContent(type, modelId, name);
  if (content === null) throw new Error(`Missing deterministic Sentry resource ${name}`);
  return schema.parse(JSON.parse(new TextDecoder().decode(content)));
}

function routeFromEvidence(evidence: RepairEvidence): string | null {
  const candidates = [evidence.localRoute, evidence.culprit, ...evidence.breadcrumbCategories];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const route = candidate.match(/\/(?:api\/|p\/)?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*/)?.[0];
    if (route && RouteSchema.safeParse(route).success) return route;
  }
  return null;
}

async function freshIssue(
  shortId: string,
  context: SentryDefectReproductionContext,
  dependencies: SentryDefectReproductionDependencies,
): Promise<FreshIssue> {
  const result = await dependencies.commandRunner.run(
    ["issue", "view", shortId, "--fresh", "--json"],
    context.repoDir,
    60_000,
  );
  if (result.code !== 0) throw new Error(`Fresh Sentry issue read failed with exit ${result.code}`);
  const issue = RawIssueSchema.parse(JSON.parse(result.stdout));
  const release = typeof issue.event.release === "string"
    ? issue.event.release
    : issue.event.release?.version ?? null;
  return {
    id: issue.id,
    shortId: issue.shortId,
    status: issue.status,
    lastSeen: issue.lastSeen,
    eventId: issue.event.eventID,
    eventRelease: release,
  };
}

async function readOptional<T>(
  context: SentryDefectReproductionContext,
  specName: string,
  name: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const content = await context.dataRepository.getContent(
    "@supers/sentry-issue-intake",
    context.modelId,
    name,
  );
  return content === null ? null : schema.parse(JSON.parse(new TextDecoder().decode(content)));
}

export async function executeReproduceSentryDefect(
  rawArgs: z.infer<typeof ReproduceSentryDefectArgsSchema>,
  context: SentryDefectReproductionContext,
  dependencies: SentryDefectReproductionDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = ReproduceSentryDefectArgsSchema.parse(rawArgs);
  const evidence = await readResource(
    context,
    "@supers/sentry-issue-intake",
    context.modelId,
    args.evidenceName,
    SentryIssueRepairEvidenceSchema,
  );
  if (
    evidence.fingerprint !== args.expectedEvidenceFingerprint ||
    evidence.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(evidence as unknown as Record<string, unknown>)))
  ) throw new Error("Sentry reproduction evidence fingerprint mismatch");

  const route = routeFromEvidence(evidence);
  if (route === null) {
    const rejectionBase = {
      schemaVersion: 1 as const,
      authority: "supers-sentry-code-owned-reproduction-v1" as const,
      capabilityVersion: 2 as const,
      status: "unsupported" as const,
      reason: "no-code-owned-route" as const,
      evidenceName: args.evidenceName,
      evidenceFingerprint: evidence.fingerprint,
      repairIntentFingerprint: evidence.repairIntentFingerprint,
      repairIdentityFingerprint: evidence.repairIdentityFingerprint,
      issueId: evidence.issueId,
      shortId: evidence.shortId,
      checkoutRevision: evidence.checkoutRevision,
      rejectedAt: evidence.capturedAt,
    };
    const rejection = SentryDefectReproductionRejectionSchema.parse(
      await fingerprinted(rejectionBase),
    );
    const name = `sentry-defect-reproduction-rejection-${rejection.fingerprint}`;
    const handle = await context.writeResource(
      "defect-reproduction-rejection",
      name,
      rejection,
    );
    return { dataHandles: [handle] };
  }
  const attemptBase = {
    schemaVersion: 1 as const,
    authority: "supers-sentry-code-owned-reproduction-v1" as const,
    evidenceName: args.evidenceName,
    evidenceFingerprint: evidence.fingerprint,
    issueId: evidence.issueId,
    shortId: evidence.shortId,
    checkoutRevision: evidence.checkoutRevision,
    route,
    sourceEventId: evidence.eventId,
    sourceLastSeen: evidence.lastSeen,
    preparedAt: evidence.capturedAt,
  };
  const attempt = SentryDefectReproductionAttemptSchema.parse(await fingerprinted(attemptBase));
  const attemptName = `sentry-defect-reproduction-attempt-${attempt.fingerprint}`;
  const receiptName = `sentry-defect-reproduction-${evidence.repairIdentityFingerprint}-${evidence.checkoutRevision}`;
  const existing = await readOptional(context, "defect-reproduction", receiptName, SentryDefectReproductionReceiptSchema);
  if (existing !== null) {
    if (existing.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(existing)))) {
      throw new Error("Existing deterministic Sentry reproduction receipt is corrupt");
    }
    return { dataHandles: [{ name: receiptName }] };
  }
  const handles: Array<{ name: string }> = [];
  const priorAttempt = await readOptional(context, "defect-reproduction-attempt", attemptName, SentryDefectReproductionAttemptSchema);
  if (priorAttempt === null) {
    handles.push(await context.writeResource("defect-reproduction-attempt", attemptName, attempt));
  } else if (priorAttempt.fingerprint !== attempt.fingerprint) {
    throw new Error("Conflicting deterministic Sentry reproduction attempt");
  }

  let observed = await freshIssue(evidence.shortId, context, dependencies);
  const alreadyObserved = observed.eventId !== evidence.eventId &&
    new Date(observed.lastSeen).getTime() > new Date(evidence.lastSeen).getTime() &&
    observed.eventRelease === `supers@${evidence.checkoutRevision}`;
  if (!alreadyObserved) {
    await dependencies.driveRoute(route);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dependencies.waitForObservation();
      observed = await freshIssue(evidence.shortId, context, dependencies);
      if (
        observed.eventId !== evidence.eventId &&
        new Date(observed.lastSeen).getTime() > new Date(evidence.lastSeen).getTime() &&
        observed.eventRelease === `supers@${evidence.checkoutRevision}`
      ) break;
    }
  }
  if (
    observed.id !== evidence.issueId || observed.shortId !== evidence.shortId ||
    observed.status !== "unresolved" || observed.eventId === evidence.eventId ||
    new Date(observed.lastSeen).getTime() <= new Date(evidence.lastSeen).getTime() ||
    observed.eventRelease !== `supers@${evidence.checkoutRevision}`
  ) {
    const rejection = SentryDefectReproductionRejectionSchema.parse(
      await fingerprinted({
        schemaVersion: 1 as const,
        authority: "supers-sentry-code-owned-reproduction-v1" as const,
        capabilityVersion: 2 as const,
        status: "unsupported" as const,
        reason: "not-reproduced-on-head" as const,
        evidenceName: args.evidenceName,
        evidenceFingerprint: evidence.fingerprint,
        repairIntentFingerprint: evidence.repairIntentFingerprint,
        repairIdentityFingerprint: evidence.repairIdentityFingerprint,
        issueId: evidence.issueId,
        shortId: evidence.shortId,
        checkoutRevision: evidence.checkoutRevision,
        rejectedAt: dependencies.now(),
      }),
    );
    const name = `sentry-defect-reproduction-rejection-${rejection.fingerprint}`;
    const handle = await context.writeResource(
      "defect-reproduction-rejection",
      name,
      rejection,
    );
    return { dataHandles: [...handles, handle] };
  }
  const receiptBase = {
    schemaVersion: 1 as const,
    authority: "supers-sentry-code-owned-reproduction-v1" as const,
    status: "reproduced" as const,
    evidenceName: args.evidenceName,
    evidenceFingerprint: evidence.fingerprint,
    repairIdentityFingerprint: evidence.repairIdentityFingerprint,
    issueId: evidence.issueId,
    shortId: evidence.shortId,
    checkoutRevision: evidence.checkoutRevision,
    reproducedInRelease: `supers@${evidence.checkoutRevision}`,
    route,
    sourceEventId: evidence.eventId,
    reproducedEventId: observed.eventId,
    sourceLastSeen: evidence.lastSeen,
    reproducedLastSeen: observed.lastSeen,
    observedAt: dependencies.now(),
  };
  const receipt = SentryDefectReproductionReceiptSchema.parse(await fingerprinted(receiptBase));
  handles.push(await context.writeResource("defect-reproduction", receiptName, receipt));
  return { dataHandles: handles };
}

export async function executeVerifySentryNoRecurrence(
  rawArgs: z.infer<typeof VerifySentryNoRecurrenceArgsSchema>,
  context: SentryDefectReproductionContext,
  dependencies: SentryDefectReproductionDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = VerifySentryNoRecurrenceArgsSchema.parse(rawArgs);
  const reproduction = await readResource(
    context,
    "@supers/sentry-issue-intake",
    context.modelId,
    args.reproductionName,
    SentryDefectReproductionReceiptSchema,
  );
  if (
    reproduction.fingerprint !== args.expectedReproductionFingerprint ||
    reproduction.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(reproduction)))
  ) throw new Error("Sentry no-recurrence source fingerprint mismatch");
  const receiptName = `sentry-no-recurrence-${reproduction.issueId}-${args.integratedRevision}`;
  const existing = await readOptional(context, "no-recurrence", receiptName, SentryNoRecurrenceReceiptSchema);
  if (existing !== null) return { dataHandles: [{ name: receiptName }] };

  const before = await freshIssue(reproduction.shortId, context, dependencies);
  await dependencies.driveRoute(reproduction.route);
  let after = before;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await dependencies.waitForObservation();
    after = await freshIssue(reproduction.shortId, context, dependencies);
    if (after.eventId !== before.eventId || after.lastSeen !== before.lastSeen) break;
  }
  if (
    before.id !== reproduction.issueId || after.id !== reproduction.issueId ||
    after.eventId !== before.eventId || after.lastSeen !== before.lastSeen ||
    new Date(after.lastSeen).getTime() >= new Date(args.verificationRecordedAt).getTime()
  ) throw new Error("Sentry issue recurred after integrated verification");
  const base = {
    schemaVersion: 1 as const,
    authority: "supers-sentry-code-owned-no-recurrence-v1" as const,
    status: "passed" as const,
    reproductionName: args.reproductionName,
    reproductionFingerprint: reproduction.fingerprint,
    issueId: reproduction.issueId,
    shortId: reproduction.shortId,
    integratedRevision: args.integratedRevision,
    verifiedRelease: `supers@${args.integratedRevision}`,
    route: reproduction.route,
    priorEventId: after.eventId,
    priorLastSeen: after.lastSeen,
    checkedAt: dependencies.now(),
    verificationRecordedAt: args.verificationRecordedAt,
  };
  const receipt = SentryNoRecurrenceReceiptSchema.parse(await fingerprinted(base));
  return { dataHandles: [await context.writeResource("no-recurrence", receiptName, receipt)] };
}

export function createDefaultSentryDefectReproductionDependencies(
  commandRunner: SentryCommandRunner,
): SentryDefectReproductionDependencies {
  return {
    commandRunner,
    driveRoute: async (route) => {
      const response = await fetch(new URL(route, "http://localhost:7263"), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      await response.body?.cancel();
    },
    waitForObservation: () => new Promise((resolve) => setTimeout(resolve, 5_000)),
    now: () => new Date().toISOString(),
  };
}
