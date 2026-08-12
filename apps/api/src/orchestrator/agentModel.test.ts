import { describe, expect, it } from "vitest";
import { modelFor } from "./agentModel.js";

describe("modelFor", () => {
  it("uses flash for ReAct specialists including log_diver and detector", () => {
    expect(modelFor("log_diver")).toBe("gemini-2.5-flash");
    expect(modelFor("detector")).toBe("gemini-2.5-flash");
    expect(modelFor("hypothesis")).toBe("gemini-2.5-flash");
    expect(modelFor("mitigator")).toBe("gemini-2.5-flash");
    expect(modelFor("scribe")).toBe("gemini-2.5-flash");
  });
});
