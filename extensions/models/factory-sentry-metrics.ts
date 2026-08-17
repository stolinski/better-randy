/**
 * Swamp model entrypoint for bounded Factory Application Metrics emission.
 *
 * @module
 */
import {
  executeFactoryAgentTelemetryEmission,
  type FactoryAgentTelemetryArgs,
  FactoryAgentTelemetryArgsSchema,
  FactoryAgentTelemetryReceiptSchema,
} from "./factory-agent-telemetry-emitter.ts";
import {
  executeFactoryFlowMetricEmissionFromSource,
  executeFactoryMetricEmission,
  executePersistFactoryProjectedTerminalSummary,
  FACTORY_METRIC_MODEL_VERSION,
  FactoryFlowMetricSourceArgsSchema,
  FactoryMetricCoverageSchema,
  FactoryMetricEmissionArgsSchema,
  FactoryMetricEmissionReceiptSchema,
  FactoryMetricGlobalArgsSchema,
  FactoryProjectedTerminalSummaryArgsSchema,
  FactoryProjectedTerminalSummarySchema,
  verifyFactoryFlowMetricReceipt,
} from "./factory-sentry-metrics-emitter.ts";
import type {
  FactoryFlowMetricSourceArgs,
  FactoryMetricEmissionArgs,
  FactoryMetricMethodContext,
  FactoryProjectedTerminalSummaryArgs,
} from "./factory-sentry-metrics-emitter.ts";

/** Model definition for bounded Factory Application Metrics emission. */
export const model = {
  type: "@club_aqua_back_deck/software-factory-sentry-metrics",
  version: FACTORY_METRIC_MODEL_VERSION,
  globalArguments: FactoryMetricGlobalArgsSchema,
  resources: {
    receipt: {
      description:
        "Versioned, secret-free Factory metric emission result keyed by a local SHA-256 idempotency hash",
      schema: FactoryMetricEmissionReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "projected-summary": {
      description:
        "Canonical exact terminal projection persisted before Factory finalization",
      schema: FactoryProjectedTerminalSummarySchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    coverage: {
      description:
        "Local control-plane proof that one terminal Factory run has an emitted or duplicate Sentry receipt",
      schema: FactoryMetricCoverageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "agent-receipt": {
      description:
        "Secret-free idempotent receipt for one bounded Prime Agent cockpit telemetry batch",
      schema: FactoryAgentTelemetryReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
  },
  methods: {
    emit_agent_telemetry: {
      description:
        "Emit one bounded Prime Agent cockpit telemetry batch through the Factory Sentry DSN",
      arguments: FactoryAgentTelemetryArgsSchema,
      execute: (
        args: FactoryAgentTelemetryArgs,
        context: FactoryMetricMethodContext,
      ) => executeFactoryAgentTelemetryEmission(args, context),
    },
    persist_projected_summary: {
      description:
        "Persist the exact canonical terminal summary projected by the current observability route",
      arguments: FactoryProjectedTerminalSummaryArgsSchema,
      execute: (
        args: FactoryProjectedTerminalSummaryArgs,
        context: FactoryMetricMethodContext,
      ) => executePersistFactoryProjectedTerminalSummary(args, context),
    },
    emit_flow_report: {
      description:
        "Transform a canonical terminal Factory flow report, emit its bounded metrics, and store a non-gating receipt",
      arguments: FactoryFlowMetricSourceArgsSchema,
      execute: (
        args: FactoryFlowMetricSourceArgs,
        context: FactoryMetricMethodContext,
      ) => executeFactoryFlowMetricEmissionFromSource(args, context),
    },
    verify_flow_receipt: {
      description:
        "Fail visibly when a terminal Factory run lacks an emitted or duplicate local Sentry receipt",
      arguments: FactoryFlowMetricSourceArgsSchema,
      execute: (
        args: FactoryFlowMetricSourceArgs,
        context: FactoryMetricMethodContext,
      ) => verifyFactoryFlowMetricReceipt(args, context),
    },
    emit: {
      description:
        "Emit one bounded terminal Factory flow payload to Sentry Application Metrics and store a non-gating receipt",
      arguments: FactoryMetricEmissionArgsSchema,
      execute: (
        args: FactoryMetricEmissionArgs,
        context: FactoryMetricMethodContext,
      ) => executeFactoryMetricEmission(args, context),
    },
  },
};
