/**
 * Read-only Sentry issue intake and reconciliation for the Supers repair Factory.
 *
 * This model snapshots bounded issue metadata. It cannot mutate Sentry, Dex, or
 * the repository and deliberately exposes no repair or resolve method.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  DEFAULT_SENTRY_ISSUE_INTAKE_DEPENDENCIES,
  executeSentryIssueIntake,
  SentryIssueIntakeArgsSchema,
  type SentryIssueIntakeContext,
  SentryIssueReconciliationSchema,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";

const GlobalArgsSchema = z.object({
  target: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/).default(
    "scott-tolinski-projects/supers",
  ),
});

export const model = {
  type: "@supers/sentry-issue-intake",
  version: "2026.08.09.2",
  globalArguments: GlobalArgsSchema,
  resources: {
    snapshot: {
      description:
        "Immutable bounded unresolved Supers issue snapshot from the Sentry CLI",
      schema: SentryIssueSnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    reconciliation: {
      description:
        "Read-only current, recent, historical, or ambiguous repair-candidate classification",
      schema: SentryIssueReconciliationSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
  },
  methods: {
    collect: {
      description:
        "Collect and reconcile unresolved Supers issues without mutating Sentry, Dex, or source code",
      arguments: SentryIssueIntakeArgsSchema,
      execute: (
        args: z.infer<typeof SentryIssueIntakeArgsSchema>,
        context: SentryIssueIntakeContext,
      ) =>
        executeSentryIssueIntake(
          args,
          context,
          DEFAULT_SENTRY_ISSUE_INTAKE_DEPENDENCIES,
        ),
    },
  },
};
