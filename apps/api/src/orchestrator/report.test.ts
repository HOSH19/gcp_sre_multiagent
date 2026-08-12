import { describe, expect, it, vi } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";

const runTool = vi.fn(async () => ({ ok: true }));
const llmStep = vi.fn(async () => "writeReport(...)");

vi.mock("./runner.js", () => ({
  runTool,
  llmStep,
}));

describe("finalizeWithScribe", () => {
  it("runs deterministic scribe tool sequence without llmStep", async () => {
    vi.clearAllMocks();
    const { finalizeWithScribe } = await import("./report.js");
    const run = {
      id: "run_test",
      costUsd: 0.01,
      tokensIn: 10,
      tokensOut: 5,
      stepCount: 0,
      toolCallCount: 0,
      hypotheses: [],
      evidence: [],
      events: [],
      createdAt: new Date().toISOString(),
      status: "remediating",
    } as InvestigationRun;

    await finalizeWithScribe(run, "approved", [], { ok: true, detail: "Patient healthy" });

    expect(llmStep).not.toHaveBeenCalled();
    expect(runTool.mock.calls.map((call) => call[2])).toEqual([
      "writeReport",
      "writeBigQueryTrace",
      "finalizeRun",
    ]);
  });
});
