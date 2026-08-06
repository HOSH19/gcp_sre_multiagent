import type { FunctionDeclaration } from "../llm/types.js";

const emptyParams: Record<string, unknown> = {
  type: "object",
  properties: {},
};

const READ_TOOL_META: Record<string, { description: string }> = {
  getServiceHealth: { description: "Fetch current health of the target Cloud Run service." },
  listRecentErrors: { description: "List recent error signals for the target service." },
  getUptimeCheckState: { description: "Get Cloud Monitoring uptime check state for the target." },
  queryLogs: { description: "Query recent Cloud Logging entries for the target service." },
  getErrorGroup: { description: "Fetch grouped error details if available." },
  listRevisions: { description: "List Cloud Run revisions and health hints." },
  getRevisionTraffic: { description: "Get traffic split across revisions." },
  getServiceEnv: { description: "Inspect non-secret env configuration on the service." },
  listCloudRunServices: {
    description:
      "List in-scope Cloud Run services from the fleet registry (intersected with live Cloud Run in gcp mode).",
  },
  verifyHealth: { description: "Re-check service health after remediation." },
  writeReport: { description: "Compose and persist the incident report (orchestrator supplies decision/cost)." },
  writeBigQueryTrace: { description: "Write the investigation trace to BigQuery." },
  finalizeRun: { description: "Mark the run terminal and release the lease." },
};

function readDecl(name: string): FunctionDeclaration {
  return {
    name,
    description: READ_TOOL_META[name]?.description ?? `Call ${name}`,
    parameters: emptyParams,
  };
}

const SPECIAL_DECLS: Record<string, FunctionDeclaration> = {
  submitHypotheses: {
    name: "submitHypotheses",
    description:
      "Submit ranked root-cause hypotheses. Set rootCauseLabel to free-form text and canonicalRootCause to a known scenario id when applicable. Call this when ready to conclude.",
    parameters: {
      type: "object",
      properties: {
        hypotheses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rootCauseLabel: { type: "string", description: "Free-form human-readable root cause label" },
              canonicalRootCause: {
                type: "string",
                description:
                  "Canonical id when applicable: unhealthy_revision_receiving_traffic | missing_required_env. Free-form or omit when unknown.",
              },
              confidence: { type: "number", description: "0-1 confidence" },
              summary: { type: "string" },
              evidenceIds: { type: "array", items: { type: "string" } },
            },
            required: ["rootCauseLabel", "confidence", "summary"],
          },
        },
        ruledOut: { type: "array", items: { type: "string" } },
      },
      required: ["hypotheses"],
    },
  },
  proposeRemediation: {
    name: "proposeRemediation",
    description:
      "Propose remediation actions. Prefer allowlisted types rollback_traffic or patch_env. Unknown types are propose-only and never executed.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        risk: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Action type, e.g. rollback_traffic or patch_env" },
              reason: { type: "string" },
              details: {
                type: "object",
                description:
                  "For patch_env, use actual env var keys and values, e.g. {\"APP_SECRET\":\"restore-known-good\"}.",
                additionalProperties: { type: "string" },
              },
            },
            required: ["type", "reason"],
          },
        },
      },
      required: ["summary", "actions"],
    },
  },
  rollbackTraffic: {
    name: "rollbackTraffic",
    description: "Shift traffic to the last healthy revision (post-approval only).",
    parameters: emptyParams,
  },
  patchEnvVars: {
    name: "patchEnvVars",
    description: "Patch environment variables on the service (post-approval only).",
    parameters: {
      type: "object",
      properties: {
        vars: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["vars"],
    },
  },
};

/** Build Vertex functionDeclarations for the given tool names. */
export function toolDeclarations(names: string[]): FunctionDeclaration[] {
  return names.map((name) => SPECIAL_DECLS[name] ?? readDecl(name));
}
