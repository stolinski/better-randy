/**
 * Swamp model entrypoint for compiling Dex-backed software Factory profiles and minimal observed-error Sentry completion.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  CompiledDexSoftwareFactoryProfileSchema,
  DEX_SOFTWARE_FACTORY_VERSION,
  DexSoftwareFactoryPlatformArgsSchema,
  executeDexSoftwareFactoryCompile,
} from "./dex-software-factory-compiler.ts";
import type { DexSoftwareFactoryMethodContext } from "./dex-software-factory-compiler.ts";
import {
  authorizeFactoryFailure,
  AuthorizeFactoryFailureArgsSchema,
  executeFactoryFailureBoundary,
  ExecuteFactoryFailureBoundaryArgsSchema,
  executeFactoryWorkBoundary,
  ExecuteFactoryWorkBoundaryArgsSchema,
  FactoryAuthorityReceiptSchema,
  FactoryDispatchBoundaryClaimSchema,
} from "./factory-execution-failure-authority.ts";
import type { FactoryFailureAuthorityContext } from "./factory-execution-failure-authority.ts";
import {
  authorizePiSubmissionRetry,
  AuthorizePiSubmissionRetryArgsSchema,
  bindPiHandoff,
  BindPiHandoffArgsSchema,
  bindPiLaunch,
  BindPiLaunchArgsSchema,
  claimPiExecution,
  ClaimPiExecutionArgsSchema,
  getPiDispatchRequest,
  parkPiSubmission,
  ParkPiSubmissionArgsSchema,
  PiDispatchOutboxSchema,
  PiDispatchTokenArgsSchema,
  PiExecutionClaimSchema,
  PiExecutionFailureReceiptSchema,
  PiHandoffAcceptanceSchema,
  PiLaunchReceiptSchema,
  reconcilePiDispatch,
  recordPiSubmissionAttempt,
  RecordPiSubmissionAttemptArgsSchema,
  reservePiDispatch,
  ReservePiDispatchArgsSchema,
} from "./factory-pi-dispatch-outbox.ts";
import type { PiDispatchOutboxContext } from "./factory-pi-dispatch-outbox.ts";

const CompileArgsSchema = z.object({});

/** Model definition for deterministic portable Factory profile compilation. */
export const model = {
  type: "@club_aqua_back_deck/dex-software-factory",
  version: DEX_SOFTWARE_FACTORY_VERSION,
  globalArguments: DexSoftwareFactoryPlatformArgsSchema,
  resources: {
    profile: {
      description:
        "Compiled arguments to materialize in an @swamp/software-factory definition",
      schema: CompiledDexSoftwareFactoryProfileSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "dispatch-boundary": {
      description:
        "Durable single-execution claim for one exact current Factory dispatch boundary",
      schema: FactoryDispatchBoundaryClaimSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "execution-failure": {
      description:
        "Durable receipt produced only by an actual failed operational command boundary",
      schema: FactoryAuthorityReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "authorized-failure": {
      description:
        "Current-dispatch failure receipt verified for the recovery-authorizer workflow",
      schema: FactoryAuthorityReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "pi-dispatch-outbox": {
      description:
        "Durable per-root Pi transport reservation and reconciliation state",
      schema: PiDispatchOutboxSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "pi-launch-receipt": {
      description:
        "Code-verified binding to Pi durable lifecycle and session artifacts",
      schema: PiLaunchReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "pi-execution-claim": {
      description: "Atomic single-writer claim for one verified Pi run",
      schema: PiExecutionClaimSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "pi-execution-failure": {
      description:
        "Exact failed Pi lifecycle bound to its verified launch and execution claim",
      schema: PiExecutionFailureReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "pi-handoff-acceptance": {
      description:
        "Content-addressed profile acceptance for one verified claimed Pi handoff",
      schema: PiHandoffAcceptanceSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    compile: {
      description:
        "Compile the configured portable profile into Factory global arguments",
      arguments: CompileArgsSchema,
      execute: (
        args: Record<string, never>,
        context: DexSoftwareFactoryMethodContext,
      ) => executeDexSoftwareFactoryCompile(args, context),
    },
    execute_failure_boundary: {
      description:
        "Execute one fixed code-owned prerequisite/tool probe against the exact current Factory dispatch",
      arguments: ExecuteFactoryFailureBoundaryArgsSchema,
      execute: (args: unknown, context: FactoryFailureAuthorityContext) =>
        executeFactoryFailureBoundary(args, context),
    },
    execute_work_boundary: {
      description:
        "Sole execution path for exact current workflow or method work, returning success or persisting its exact failure",
      arguments: ExecuteFactoryWorkBoundaryArgsSchema,
      execute: (args: unknown, context: FactoryFailureAuthorityContext) =>
        executeFactoryWorkBoundary(args, context),
    },
    authorize_execution_failure: {
      description:
        "Re-read a durable owned failure and authorize it only for the exact current Factory dispatch",
      arguments: AuthorizeFactoryFailureArgsSchema,
      execute: (args: unknown, context: FactoryFailureAuthorityContext) =>
        authorizeFactoryFailure(args, context),
    },
    reserve_pi_dispatch: {
      description:
        "Reserve an exact per-root Pi dispatch without consuming a Factory attempt",
      arguments: ReservePiDispatchArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        reservePiDispatch(args, context),
    },
    get_pi_dispatch_request: {
      description:
        "Read the exact canonical frozen Pi request through the trusted model-owned outbox boundary",
      arguments: PiDispatchTokenArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        getPiDispatchRequest(args, context),
    },
    record_pi_submission_attempt: {
      description:
        "Consume one Pi transport attempt immediately before an actual launch",
      arguments: RecordPiSubmissionAttemptArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        recordPiSubmissionAttempt(args, context),
    },
    reconcile_pi_dispatch: {
      description:
        "Read-only reconciliation of the outbox against fixed Pi runtime artifacts",
      arguments: PiDispatchTokenArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        reconcilePiDispatch(args, context),
    },
    bind_pi_launch: {
      description:
        "Bind one real Pi run after verifying its durable lifecycle and session artifacts",
      arguments: BindPiLaunchArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        bindPiLaunch(args, context),
    },
    claim_pi_execution: {
      description:
        "Atomically grant one verified Pi run the only execution claim for a dispatch",
      arguments: ClaimPiExecutionArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        claimPiExecution(args, context),
    },
    bind_pi_handoff: {
      description:
        "Accept only the handoff carrying the granted run and claim nonce",
      arguments: BindPiHandoffArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        bindPiHandoff(args, context),
    },
    authorize_pi_submission_retry: {
      description:
        "Apply an explicit human no-live-run decision before retrying uncertain or parked Pi submission",
      arguments: AuthorizePiSubmissionRetryArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        authorizePiSubmissionRetry(args, context),
    },
    park_pi_submission: {
      description:
        "Park exhausted or ambiguous Pi transport for explicit human action",
      arguments: ParkPiSubmissionArgsSchema,
      execute: (args: unknown, context: PiDispatchOutboxContext) =>
        parkPiSubmission(args, context),
    },
  },
};
