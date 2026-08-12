import { afterEach, describe, expect, it, vi } from "vitest";

describe("isPostRemediationHealthy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires patient ok in gcp mode even when chaos scenario is still set", async () => {
    vi.stubEnv("MODE", "gcp");
    const { isPostRemediationHealthy } = await import("./health.js");
    expect(
      isPostRemediationHealthy(
        { ok: true, status: 200 },
        { activeScenario: "missing_config", env: {} },
      ),
    ).toBe(true);
  });

  it("requires chaos scenario cleared in local mode after missing_config patch", async () => {
    vi.stubEnv("MODE", "local");
    const { isPostRemediationHealthy } = await import("./health.js");
    expect(
      isPostRemediationHealthy(
        { ok: true, status: 200 },
        { activeScenario: "missing_config", env: {} },
      ),
    ).toBe(false);
    expect(
      isPostRemediationHealthy(
        { ok: true, status: 200 },
        { activeScenario: null, env: { APP_SECRET: "local-secret" } },
      ),
    ).toBe(true);
  });

  it("treats bad_revision_traffic overlay as unhealthy in local mode", async () => {
    vi.stubEnv("MODE", "local");
    const { isPostRemediationHealthy } = await import("./health.js");
    expect(
      isPostRemediationHealthy(
        { ok: true, status: 200 },
        { activeScenario: "bad_revision_traffic" },
      ),
    ).toBe(false);
  });
});

describe("healthEvidenceOk", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses chaos-aware ok for verifyHealth evidence in local mode", async () => {
    vi.stubEnv("MODE", "local");
    const { healthEvidenceOk } = await import("./health.js");
    const result = healthEvidenceOk({
      summary: "Patient unhealthy: missing_required_env (HTTP 503) — active chaos scenario=missing_config",
      raw: {
        patient: { ok: true, status: 200 },
        chaosState: { activeScenario: "missing_config", env: {} },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing_required_env");
  });
});
