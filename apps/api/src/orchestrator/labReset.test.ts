import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";
import { makeRun } from "../test/fixtures.js";
import { isPatientBusyRun } from "./labReset.js";

describe("isPatientBusyRun", () => {
  it("matches busy runs for the default patient", () => {
    const run = makeRun({ status: "remediating", targetService: "patient" });
    expect(isPatientBusyRun(run, "patient")).toBe(true);
  });

  it("ignores terminal runs", () => {
    const run = makeRun({ status: "completed", targetService: "patient" });
    expect(isPatientBusyRun(run, "patient")).toBe(false);
  });

  it("ignores busy runs for other services", () => {
    const run = makeRun({ status: "running", targetService: "billing" });
    expect(isPatientBusyRun(run, "patient")).toBe(false);
  });
});

describe("resetLab", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("clears busy patient runs and releases leases", async () => {
    vi.doMock("../tools/chaosClient.js", () => ({
      resetChaosController: vi.fn(async () => true),
    }));

    const busy = makeRun({ id: "run_busy", status: "remediating" });
    const done = makeRun({ id: "run_done", status: "completed" });
    const other = makeRun({ id: "run_other", status: "running", targetService: "billing" });

    vi.doMock("../store/index.js", () => ({
      listRuns: vi.fn(async () => [busy, done, other]),
      releaseAllInvestigationLeases: vi.fn(async () => undefined),
    }));

    const cancelBusyRun = vi.fn(async (run: InvestigationRun) => run.status !== "completed");
    vi.doMock("../store/cancelRun.js", () => ({
      CANCELLABLE_STATUSES: new Set(["queued", "running", "awaiting_approval", "remediating"]),
      cancelBusyRun,
    }));

    const { resetLab } = await import("./labReset.js");
    const result = await resetLab("patient");

    expect(result).toEqual({
      ok: true,
      chaosReset: true,
      runsCleared: ["run_busy"],
      leasesReleased: true,
    });
    expect(cancelBusyRun).toHaveBeenCalledTimes(1);
    expect(cancelBusyRun.mock.calls[0]?.[0]?.id).toBe("run_busy");
  });
});
