import { z } from "npm:zod@4.4.3";

import {
  SupersRenderMatrixBundleSchema,
  SupersRenderMatrixManifestSchema,
  SupersRenderRegistrySnapshotSchema,
} from "../models/supers-deterministic-factory-contract.ts";
import { SupersRenderMatrixRunSchema } from "../models/supers-render-matrix-verification.ts";

interface ReportHandle {
  specName?: string;
  name: string;
  version?: number;
}
interface ReportContext {
  methodName: string;
  modelType: string;
  modelId: string;
  dataHandles: ReportHandle[];
  dataRepository: {
    getContent: (
      type: string,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
}

async function readHandle<T>(
  context: ReportContext,
  specName: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const handle = context.dataHandles.find((entry) =>
    entry.specName === specName
  );
  if (!handle) throw new Error(`Render matrix report is missing ${specName}`);
  const content = await context.dataRepository.getContent(
    context.modelType,
    context.modelId,
    handle.name,
    handle.version,
  );
  if (!content) throw new Error(`Render matrix report cannot read ${specName}`);
  return schema.parse(JSON.parse(new TextDecoder().decode(content)));
}

function coordinateLabel(
  cell: z.infer<typeof SupersRenderMatrixBundleSchema>["cells"][number],
): string {
  const coordinate = cell.coordinate;
  return `${coordinate.presetSlug} / ${coordinate.packId} / ${coordinate.orientation} / ${coordinate.sample.sampleId}`;
}

/** Method report. It summarizes objective data but never changes routing authority. */
export const report = {
  name: "@supers/render-matrix",
  description:
    "Exact objective render-matrix failures, unavailable evidence, freshness, and non-routing advisories",
  scope: "method",
  labels: ["render", "verification", "matrix"],
  execute: async (context: ReportContext) => {
    if (context.methodName !== "verify-render-matrix") {
      return {
        markdown: "Render matrix report applies to verify-render-matrix only.",
        json: { applicable: false },
      };
    }
    const run = await readHandle(
      context,
      "render-matrix-run",
      SupersRenderMatrixRunSchema,
    );
    if (run.status === "not-applicable") {
      return {
        markdown:
          `# Supers render matrix\n\n- **Scope**: affected\n- **Work item**: ${run.workItem}\n- **Status**: not applicable\n- **Reason**: no deliverable render impact\n\n## Advisory observations — no routing authority\n\nNone.\n`,
        json: {
          applicable: true,
          ...run,
          failedCoordinates: [],
          unavailableCoordinates: [],
        },
      };
    }
    const [snapshot, manifest, bundle] = await Promise.all([
      readHandle(
        context,
        "render-registry-snapshot",
        SupersRenderRegistrySnapshotSchema,
      ),
      readHandle(
        context,
        "render-matrix-manifest",
        SupersRenderMatrixManifestSchema,
      ),
      readHandle(
        context,
        "render-matrix-bundle",
        SupersRenderMatrixBundleSchema,
      ),
    ]);
    if (
      snapshot.snapshotDigest !== run.registrySnapshotDigest ||
      manifest.manifestDigest !== run.manifestDigest ||
      bundle.manifestDigest !== manifest.manifestDigest ||
      bundle.bundleDigest !== run.bundleDigest ||
      bundle.sourceRevision !== run.sourceRevision ||
      bundle.outcome !== run.outcome ||
      bundle.cells.length !== run.counts.cells
    ) {
      throw new Error(
        "Render matrix report resource linkage is stale or mixed",
      );
    }
    const failedCoordinates = bundle.cells
      .filter((cell) => cell.outcome === "fail")
      .map((cell) => ({
        cellId: cell.coordinate.cellId,
        presetSlug: cell.coordinate.presetSlug,
        packId: cell.coordinate.packId,
        orientation: cell.coordinate.orientation,
        sampleId: cell.coordinate.sample.sampleId,
        codes: cell.checks.filter((check) => check.outcome === "fail").map((
          check,
        ) => check.code),
      }));
    const unavailableCoordinates = bundle.cells
      .filter((cell) => cell.outcome === "unavailable")
      .map((cell) => ({
        cellId: cell.coordinate.cellId,
        presetSlug: cell.coordinate.presetSlug,
        packId: cell.coordinate.packId,
        orientation: cell.coordinate.orientation,
        sampleId: cell.coordinate.sample.sampleId,
        codes: cell.checks.filter((check) => check.outcome === "unavailable")
          .map((check) => check.code),
      }));
    const cellLines = (outcome: "fail" | "unavailable"): string => {
      const cells = bundle.cells.filter((cell) => cell.outcome === outcome);
      return cells.length === 0
        ? "None."
        : cells.map((cell) =>
          `- **${coordinateLabel(cell)}** — ${
            cell.checks.filter((check) => check.outcome === outcome).map((
              check,
            ) => check.code).join(", ")
          }`
        ).join("\n");
    };
    const markdown = [
      "# Supers render matrix",
      "",
      `- **Scope**: ${run.scope}`,
      `- **Work item**: ${run.workItem}`,
      `- **Source revision**: ${run.sourceRevision}`,
      `- **Tree fingerprint**: ${run.expectedTreeFingerprint}`,
      `- **Snapshot / manifest / bundle / evidence**: ${snapshot.snapshotDigest} / ${manifest.manifestDigest} / ${bundle.bundleDigest} / ${run.evidenceArchiveDigest}`,
      `- **Live axes**: ${run.counts.presets} Presets × ${run.counts.packs} Packs × ${run.counts.orientations} orientations; ${run.counts.samples} declared samples`,
      `- **Cells**: ${run.counts.cells} total — ${run.counts.passed} PASS, ${run.counts.failed} FAIL, ${run.counts.unavailable} UNAVAILABLE`,
      "",
      "## Failed objective cells",
      "",
      cellLines("fail"),
      "",
      "## Unavailable objective cells",
      "",
      cellLines("unavailable"),
      "",
      "## Freshness receipt",
      "",
      `- Local before: ${run.freshness.localBefore}`,
      `- Served before: ${run.freshness.servedBefore}`,
      `- Served after: ${run.freshness.servedAfter}`,
      `- Local after: ${run.freshness.localAfter}`,
      "",
      "## Advisory observations — no routing authority",
      "",
      run.advisories.length === 0
        ? "None."
        : run.advisories.map((entry) => `- ${entry.summary}`).join("\n"),
      "",
    ].join("\n");
    return {
      markdown,
      json: {
        applicable: true,
        schemaVersion: 1,
        status: run.status,
        scope: run.scope,
        workItem: run.workItem,
        sourceRevision: run.sourceRevision,
        expectedTreeFingerprint: run.expectedTreeFingerprint,
        registrySnapshotDigest: snapshot.snapshotDigest,
        manifestDigest: manifest.manifestDigest,
        bundleDigest: bundle.bundleDigest,
        evidenceArchiveDigest: run.evidenceArchiveDigest,
        counts: run.counts,
        outcome: run.outcome,
        freshness: run.freshness,
        failedCoordinates,
        unavailableCoordinates,
        advisories: run.advisories,
      },
    };
  },
};
