"use client";

import { SCENARIO_OPTIONS, type SoakJob } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

const PHASE_COLOR: Record<string, string> = {
  pending: "var(--muted)",
  running: "var(--accent)",
  passed: "var(--good)",
  failed: "var(--bad)",
};

function labelFor(scenario: string): string {
  return SCENARIO_OPTIONS.find((s) => s.id === scenario)?.label ?? scenario;
}

export function SoakPanel(props: {
  soak: SoakJob | null;
  locked: boolean;
  onStart: () => void;
}) {
  const soak = props.soak;
  const running = soak?.status === "queued" || soak?.status === "running";
  const done = soak?.status === "completed" || soak?.status === "failed";

  return (
    <div style={card}>
      <h2 style={h2}>2. Scenario soak</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.45, margin: "0 0 12px" }}>
        Runs all three scenarios sequentially (reset → inject → investigate).{" "}
        <strong style={{ color: "var(--text)", fontWeight: 600 }}>
          Soak auto-approves remediation
        </strong>{" "}
        so it can finish without babysitting — same effectiveness check as{" "}
        <span className="mono">npm run eval</span>. Caps still apply per run.
      </p>
      <button className="primary" disabled={props.locked || running} onClick={props.onStart}>
        {running ? "Soak running…" : "Run all scenarios"}
      </button>

      {soak && (
        <div style={{ marginTop: 14 }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            {soak.id} · {soak.status}
            {soak.currentScenario ? ` · ${labelFor(soak.currentScenario)}` : ""}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {soak.results.map((r) => (
              <li
                key={r.scenario}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "0.45rem 0.55rem",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "#10161d",
                }}
              >
                <span style={{ fontSize: 14 }}>{labelFor(r.scenario)}</span>
                <span className="mono" style={{ fontSize: 12, color: PHASE_COLOR[r.phase] ?? "var(--muted)" }}>
                  {r.phase.toUpperCase()}
                  {typeof r.costUsd === "number" ? ` · $${r.costUsd.toFixed(4)}` : ""}
                </span>
              </li>
            ))}
          </ul>

          {done && (
            <div
              style={{
                marginTop: 12,
                padding: "0.7rem 0.8rem",
                borderRadius: 8,
                border: `1px solid ${soak.passed === soak.total ? "var(--good)" : "var(--bad)"}`,
                background: "#10161d",
              }}
            >
              <div
                className="mono"
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                  color: soak.passed === soak.total ? "var(--good)" : "var(--bad)",
                }}
              >
                Summary · {soak.passed}/{soak.total} passed · ${soak.totalCostUsd.toFixed(4)}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {soak.results.map((r) => (
                  <li key={`sum-${r.scenario}`} style={{ fontSize: 13, color: "var(--muted)" }}>
                    <span style={{ color: r.ok ? "var(--good)" : "var(--bad)" }}>
                      {r.ok ? "PASS" : "FAIL"}
                    </span>{" "}
                    {labelFor(r.scenario)}
                    {r.matched !== undefined ? ` · matched=${r.matched}` : ""}
                    {r.healthy !== undefined ? ` · healthy=${r.healthy}` : ""}
                    {r.runId ? (
                      <span className="mono"> · {r.runId}</span>
                    ) : null}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </li>
                ))}
              </ul>
              {soak.error && (
                <p style={{ color: "var(--bad)", margin: "8px 0 0", fontSize: 13 }}>{soak.error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
