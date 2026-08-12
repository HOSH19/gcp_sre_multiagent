import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";
import { makeRun } from "../test/fixtures.js";

const store = vi.hoisted(() => {
  const runs = new Map<string, InvestigationRun>();
  return {
    runs,
    appendEvent: vi.fn(async () => undefined),
    getRun: vi.fn(async (id: string) => runs.get(id)),
    saveRun: vi.fn(async (run: InvestigationRun) => {
      runs.set(run.id, { ...run });
      return run;
    }),
    releaseLock: vi.fn(async () => undefined),
    tryTransitionRunStatus: vi.fn(
      async (runId: string, from: InvestigationRun["status"], to: InvestigationRun["status"]) => {
        const run = runs.get(runId);
        if (!run || run.status !== from) return false;
        run.status = to;
        runs.set(runId, run);
        return true;
      },
    ),
  };
});

vi.mock("../store/index.js", () => store);
vi.mock("../paging/index.js", () => ({
  queueNotifyRunStatus: vi.fn(),
}));
vi.mock("./report.js", () => ({
  finalizeWithScribe: vi.fn(async (run: InvestigationRun) => {
    run.status = "completed";
    store.runs.set(run.id, run);
  }),
}));
vi.mock("../tools/index.js", () => ({
  rollbackTraffic: vi.fn(async () => ({ ok: true })),
  patchEnvVars: vi.fn(async () => ({ ok: true })),
  verifyHealth: vi.fn(async () => ({ id: "ev_health", source: "health", summary: "ok", raw: { patient: { ok: true } } })),
}));

import { queueApproval } from "./approval.js";
import { rollbackTraffic } from "../tools/index.js";

describe("queueApproval", () => {
  beforeEach(() => {
    store.runs.clear();
    vi.clearAllMocks();
  });

  function awaitingRun(id: string): InvestigationRun {
    const now = new Date().toISOString();
    return makeRun({
      id,
      status: "awaiting_approval",
      createdAt: now,
      updatedAt: now,
      proposedRemediation: {
        summary: "rollback",
        risk: "low",
        actions: [{ type: "rollback_traffic", reason: "bad rev", details: {} }],
      },
    });
  }

  it("returns remediating run immediately on approve", async () => {
    store.runs.set("run_1", awaitingRun("run_1"));

    const run = await queueApproval("run_1", "approved");
    expect(run.status).toBe("remediating");
    await vi.waitFor(() => expect(store.runs.get("run_1")?.status).toBe("completed"));
  });

  it("rejects a second approve while remediating", async () => {
    store.runs.set("run_2", awaitingRun("run_2"));

    await queueApproval("run_2", "approved");
    await expect(queueApproval("run_2", "approved")).rejects.toThrow(/not awaiting approval/);
  });

  it("marks run failed when rollback throws", async () => {
    vi.mocked(rollbackTraffic).mockRejectedValueOnce(new Error("rollback failed"));
    store.runs.set("run_3", awaitingRun("run_3"));

    await queueApproval("run_3", "approved");
    await vi.waitFor(() => expect(store.runs.get("run_3")?.status).toBe("failed"));
    expect(store.runs.get("run_3")?.error).toBe("rollback failed");
    expect(store.releaseLock).toHaveBeenCalled();
    expect(store.appendEvent).toHaveBeenCalledWith(
      "run_3",
      expect.objectContaining({ type: "error", message: "rollback failed" }),
    );
  });
});
