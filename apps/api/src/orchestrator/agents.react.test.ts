import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";

const runReactAgent = vi.fn(async () => ({
  text: "done",
  toolsCalled: [] as string[],
}));
const runTool = vi.fn(async () => ({ ok: true }));
const llmStep = vi.fn(async () => undefined);
const appendEvent = vi.fn(async () => undefined);
const inferHypotheses = vi.fn(() => ({
  hypotheses: [{ rootCauseLabel: "bad revision", confidence: 0.8, summary: "test", evidenceIds: [] }],
  ruledOut: [] as string[],
}));
const proposeRemediation = vi.fn(() => ({
  summary: "rollback traffic",
  risk: "low",
  actions: [{ type: "rollback_traffic", details: {} }],
}));
const ensureRemediationProposal = vi.fn((run: InvestigationRun) => {
  run.proposedRemediation = proposeRemediation();
});

vi.mock("./react.js", () => ({ runReactAgent }));
vi.mock("./runner.js", () => ({ runTool, llmStep }));
vi.mock("../store/index.js", () => ({ appendEvent }));
vi.mock("./hypothesis.js", () => ({ inferHypotheses }));
vi.mock("../tools/index.js", () => ({
  proposeRemediation,
  ensureRemediationProposal,
}));

const reactEnabled = vi.fn(() => true);

vi.mock("../config.js", () => ({
  config: {
    get reactEnabled() {
      return reactEnabled();
    },
  },
}));

function baseRun(): InvestigationRun {
  return {
    id: "run_test",
    patientService: "patient",
    targetService: "patient",
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    stepCount: 0,
    toolCallCount: 0,
    hypotheses: [],
    ruledOut: [],
    proposedRemediation: null,
    evidence: [{ id: "ev1", source: "queryLogs", summary: "errors", at: "", raw: {} }],
    events: [],
    createdAt: new Date().toISOString(),
    status: "running",
  } as InvestigationRun;
}

describe("specialist agents (reactEnabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactEnabled.mockReturnValue(true);
    runReactAgent.mockResolvedValue({ text: "done", toolsCalled: [] });
  });

  it("detector uses runReactAgent as primary path", async () => {
    runReactAgent.mockResolvedValueOnce({
      text: "checked",
      toolsCalled: [
        "getServiceHealth",
        "listRecentErrors",
        "getUptimeCheckState",
        "listCloudRunServices",
      ],
    });
    const { runDetector } = await import("./agentDetector.js");
    await runDetector(baseRun());

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "detector",
        tools: [
          "getServiceHealth",
          "listRecentErrors",
          "getUptimeCheckState",
          "listCloudRunServices",
        ],
        terminalTools: [],
      }),
    );
    expect(llmStep).not.toHaveBeenCalled();
  });

  it("detector falls back to missing tools after incomplete ReAct", async () => {
    runReactAgent.mockResolvedValueOnce({
      text: "partial",
      toolsCalled: ["getServiceHealth"],
    });
    const { runDetector } = await import("./agentDetector.js");
    await runDetector(baseRun());

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runTool.mock.calls.map((c) => c[2])).toEqual([
      "listRecentErrors",
      "getUptimeCheckState",
      "listCloudRunServices",
    ]);
  });

  it("detector falls back on ReAct throw", async () => {
    runReactAgent.mockRejectedValueOnce(new Error("vertex timeout"));
    const { runDetector } = await import("./agentDetector.js");
    await runDetector(baseRun());

    expect(runTool.mock.calls.map((c) => c[2])).toEqual([
      "getServiceHealth",
      "listRecentErrors",
      "getUptimeCheckState",
      "listCloudRunServices",
    ]);
  });

  it("log_diver uses runReactAgent as primary path", async () => {
    runReactAgent.mockResolvedValueOnce({
      text: "collected",
      toolsCalled: [
        "queryLogs",
        "getErrorGroup",
        "listRevisions",
        "getRevisionTraffic",
        "getServiceEnv",
      ],
    });
    const { runLogDiver } = await import("./agentLogDiver.js");
    await runLogDiver(baseRun());

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "log_diver",
        tools: [
          "queryLogs",
          "getErrorGroup",
          "listRevisions",
          "getRevisionTraffic",
          "getServiceEnv",
        ],
      }),
    );
    expect(llmStep).not.toHaveBeenCalled();
  });

  it("hypothesis uses runReactAgent with submitHypotheses terminal tool", async () => {
    const { runHypothesis } = await import("./agentHypothesis.js");
    await runHypothesis(baseRun());

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "hypothesis",
        terminalTools: ["submitHypotheses"],
      }),
    );
  });

  it("hypothesis falls back to inferHypotheses when ReAct throws", async () => {
    runReactAgent.mockRejectedValueOnce(new Error("vertex down"));
    const { runHypothesis } = await import("./agentHypothesis.js");
    const run = baseRun();
    await runHypothesis(run);

    expect(inferHypotheses).toHaveBeenCalledOnce();
    expect(run.hypotheses[0]?.rootCauseLabel).toBe("bad revision");
  });

  it("mitigator uses runReactAgent with proposeRemediation terminal tool", async () => {
    const { runMitigatorPropose } = await import("./agentMitigator.js");
    await runMitigatorPropose({
      ...baseRun(),
      hypotheses: [{ rootCauseLabel: "bad revision", confidence: 0.9, summary: "x", evidenceIds: [] }],
    });

    expect(runReactAgent).toHaveBeenCalledOnce();
    expect(runReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "mitigator",
        terminalTools: ["proposeRemediation"],
      }),
    );
  });

  it("mitigator falls back when ReAct throws", async () => {
    runReactAgent.mockRejectedValueOnce(new Error("vertex down"));
    const { runMitigatorPropose } = await import("./agentMitigator.js");
    const run = baseRun();
    await runMitigatorPropose(run);

    expect(ensureRemediationProposal).toHaveBeenCalledOnce();
    expect(run.proposedRemediation?.summary).toBe("rollback traffic");
  });
});

describe("specialist agents (react disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactEnabled.mockReturnValue(false);
  });

  it("skips runReactAgent and uses deterministic paths", async () => {
    const { runDetector } = await import("./agentDetector.js");
    const { runLogDiver } = await import("./agentLogDiver.js");
    const { runHypothesis } = await import("./agentHypothesis.js");
    const { runMitigatorPropose } = await import("./agentMitigator.js");

    await runDetector(baseRun());
    await runLogDiver(baseRun());
    await runHypothesis(baseRun());
    await runMitigatorPropose(baseRun());

    expect(runReactAgent).not.toHaveBeenCalled();
    expect(llmStep).toHaveBeenCalled();
    expect(inferHypotheses).toHaveBeenCalled();
    expect(proposeRemediation).toHaveBeenCalled();
  });
});
