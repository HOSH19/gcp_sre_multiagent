import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestigationRun } from "@gcp-sre/shared";
import { makeRun } from "../test/fixtures.js";

const llm = vi.hoisted(() => ({
  generateWithTools: vi.fn(),
}));

const store = vi.hoisted(() => {
  const runs = new Map<string, InvestigationRun>();
  return {
    runs,
    appendEvent: vi.fn(async (runId: string, event: Record<string, unknown>) => {
      const run = runs.get(runId);
      if (!run) return;
      run.events.push({
        id: `evt_${run.events.length}`,
        runId,
        at: "2026-08-12T00:00:00.000Z",
        agent: event.agent as InvestigationRun["events"][number]["agent"],
        type: event.type as InvestigationRun["events"][number]["type"],
        message: String(event.message ?? ""),
        data: event.data as Record<string, unknown> | undefined,
      });
    }),
    saveRun: vi.fn(async (run: InvestigationRun) => {
      runs.set(run.id, { ...run });
      return run;
    }),
  };
});

const runner = vi.hoisted(() => ({
  runTool: vi.fn(async (_run: InvestigationRun, _agent: string, tool: string) => ({
    id: `ev_${tool}`,
    source: tool,
    summary: "ok",
    at: "2026-08-12T00:00:00.000Z",
    raw: {},
  })),
}));

vi.mock("../llm/index.js", () => llm);
vi.mock("../store/index.js", () => store);
vi.mock("./runner.js", () => runner);
vi.mock("./caps.js", () => ({ assertCaps: vi.fn() }));
vi.mock("../tools/schemas.js", () => ({
  toolDeclarations: (tools: string[]) =>
    tools.map((name) => ({ name, description: name, parameters: { type: "object", properties: {} } })),
}));

import { runReactLoop } from "./reactLoop.js";

describe("runReactLoop", () => {
  beforeEach(() => {
    store.runs.clear();
    vi.clearAllMocks();
    llm.generateWithTools.mockResolvedValue({
      text: "",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0,
      model: "mock",
      mocked: true,
      functionCalls: [
        { name: "getServiceHealth", args: {} },
        { name: "listRecentErrors", args: {} },
        { name: "getUptimeCheckState", args: {} },
        { name: "listCloudRunServices", args: {} },
      ],
    });
  });

  it("exits after all allowed tools succeed in one turn (no extra Vertex round-trip)", async () => {
    const run = makeRun({ id: "run_test" });
    store.runs.set(run.id, run);

    const result = await runReactLoop({
      run,
      agent: "detector",
      system: "test",
      userPrompt: "go",
      terminalTools: [],
      maxTurns: 8,
      mockFinalText: "done",
    });

    expect(result.toolsCalled).toEqual([
      "getServiceHealth",
      "listRecentErrors",
      "getUptimeCheckState",
      "listCloudRunServices",
    ]);
    expect(llm.generateWithTools).toHaveBeenCalledTimes(1);
    expect(store.appendEvent).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({
        type: "status",
        message: expect.stringContaining("detector ReAct complete"),
      }),
    );
  });
});
