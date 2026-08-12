import { describe, expect, it } from "vitest";
import { missingTools, stillNeedsTools } from "./reactNudge.js";

describe("reactNudge helpers", () => {
  it("missingTools lists allowlist entries not yet called", () => {
    expect(missingTools(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
  });

  it("stillNeedsTools is false when every allowed tool was called", () => {
    const allowed = ["getServiceHealth", "listRecentErrors", "getUptimeCheckState", "listCloudRunServices"];
    const toolsCalled = [...allowed];
    expect(stillNeedsTools(allowed, toolsCalled, new Set())).toBe(false);
  });
});
