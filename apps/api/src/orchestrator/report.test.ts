import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";

const runReactAgent = vi.fn(async () => ({
  text: "Finalizing report.",
  toolsCalled: ["writeReport", "writeBigQueryTrace", "finalizeRun"],
}));
const runTool = vi.fn(async () => ({ ok: true }));
const appendEvent = vi.fn(async () => undefined);

vi.mock("./react.js", () => ({
  runReactAgent,
}));

vi.mock("./runner.js", () => ({
  runTool,
}));

vi.mock("../store/index.js", () => ({
  appendEvent,
}));

const reactEnabled = vi.fn(() => true);

vi.mock("../config.js", () => ({
  config: { get reactEnabled() { return reactEnabled(); } },
}));

function baseRun(): InvestigationRun {
  return {
    id: "run_test",
    costUsd: 0.01,
    tokensIn: 10,
    tokensOut: 5,
    stepCount: 0,
    toolCallCount: 0,
    hypotheses: [{ rootCauseLabel: "bad revision", confidence: 0.9, summary: "test", evidenceIds: [] }],
    evidence: [],
    events: [],
    createdAt: new Date().toISOString(),
    status: "remediating",
  } as InvestigationRun;
}

describe("finalizeWithScribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactEnabled.mockReturnValue(true);
  });

  it("uses runReactAgent when reactEnabled", async () => {
    const { finalizeWithScribe } = await import("./report.js");
    const run = baseRun();

    await finalizeWithScribe(run, "approved", [], { ok: true, detail: "Patient healthy" });

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "scribe",
        terminalTools: ["finalizeRun"],
        tools: ["writeReport", "writeBigQueryTrace", "finalizeRun"],
        toolArgs: expect.objectContaining({
          decision: "approved",
          healthAfter: { ok: true, detail: "Patient healthy" },
          cost: expect.objectContaining({ totalUsd: 0.01 }),
        }),
      }),
    );
    expect(runTool).not.toHaveBeenCalled();
  });

  it("falls back to deterministic tools when ReAct misses finalizeRun", async () => {
    runReactAgent.mockResolvedValueOnce({
      text: "Could not finalize.",
      toolsCalled: ["writeReport"],
    });
    const { finalizeWithScribe } = await import("./report.js");
    const run = baseRun();

    await finalizeWithScribe(run, "denied");

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runTool.mock.calls.map((call) => call[2])).toEqual(["writeBigQueryTrace", "finalizeRun"]);
  });

  it("falls back to deterministic tools when ReAct throws", async () => {
    runReactAgent.mockRejectedValueOnce(new Error("vertex timeout"));
    const { finalizeWithScribe } = await import("./report.js");
    const run = baseRun();

    await finalizeWithScribe(run, "denied");

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runTool.mock.calls.map((call) => call[2])).toEqual([
      "writeReport",
      "writeBigQueryTrace",
      "finalizeRun",
    ]);
  });

  it("runs deterministic scribe tool sequence when react is disabled", async () => {
    reactEnabled.mockReturnValue(false);
    const { finalizeWithScribe } = await import("./report.js");
    const run = baseRun();

    await finalizeWithScribe(run, "approved", [], { ok: true, detail: "Patient healthy" });

    expect(runReactAgent).not.toHaveBeenCalled();
    expect(runTool.mock.calls.map((call) => call[2])).toEqual([
      "writeReport",
      "writeBigQueryTrace",
      "finalizeRun",
    ]);
  });
});
