import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, type Specialist } from "./agents.js";

describe("AGENT_TOOLS", () => {
  const specialists = Object.keys(AGENT_TOOLS) as Specialist[];

  it("defines allowlists for every specialist", () => {
    expect(specialists.sort()).toEqual(
      ["detector", "hypothesis", "log_diver", "mitigator", "scribe"].sort(),
    );
  });

  it("never exposes chaos inject / admin tools to the LLM surface", () => {
    const forbidden = ["injectChaos", "chaosInject", "injectScenario", "resetChaos"];
    for (const agent of specialists) {
      for (const tool of AGENT_TOOLS[agent]) {
        expect(forbidden).not.toContain(tool);
        expect(tool.toLowerCase()).not.toContain("inject");
        expect(tool.toLowerCase()).not.toContain("chaos");
      }
    }
  });

  it("requires hypothesis to submit ranked causes", () => {
    expect(AGENT_TOOLS.hypothesis).toContain("submitHypotheses");
  });

  it("requires mitigator to propose (not execute) remediation", () => {
    expect(AGENT_TOOLS.mitigator).toContain("proposeRemediation");
    expect(AGENT_TOOLS.mitigator).not.toContain("rollbackTraffic");
    expect(AGENT_TOOLS.mitigator).not.toContain("patchEnvVars");
  });
});
