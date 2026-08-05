/**
 * Swamp model entrypoint for bounded Factory Application Metrics emission.
 *
 * @module
 */
import {
  executeFactoryMetricEmission,
  FACTORY_METRIC_MODEL_VERSION,
  FactoryMetricEmissionArgsSchema,
  FactoryMetricEmissionReceiptSchema,
  FactoryMetricGlobalArgsSchema,
} from "./factory-sentry-metrics-emitter.ts";
import type {
  FactoryMetricEmissionArgs,
  FactoryMetricMethodContext,
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
  },
  methods: {
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
