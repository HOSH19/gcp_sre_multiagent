"use client";

import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function SidePanel({ run }: { run: Run }) {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={card}>
        <h2 style={h2}>Hypotheses</h2>
        {(run.hypotheses ?? []).length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>Waiting for Hypothesis agent…</p>
        )}
        {(run.hypotheses ?? []).map((h, i) => (
          <div
            key={h.rootCauseLabel}
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 10,
              background: i === 0 ? "rgba(61,156,240,0.08)" : "transparent",
              border: i === 0 ? "1px solid rgba(61,156,240,0.35)" : "1px solid transparent",
            }}
          >
            <div className="mono" style={{ color: i === 0 ? "var(--accent)" : "var(--muted)" }}>
              {i === 0 ? "TOP · " : ""}
              {h.rootCauseLabel} ({Math.round(h.confidence * 100)}%)
            </div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{h.summary}</div>
          </div>
        ))}

        {run.proposedRemediation && (
          <div style={{ marginTop: 8 }}>
            <h3 style={{ ...h2, fontSize: 15 }}>Proposed remediation</h3>
            <p style={{ margin: "0 0 6px" }}>{run.proposedRemediation.summary}</p>
            <p style={{ color: "var(--warn)", fontSize: 13, margin: "0 0 8px" }}>
              Risk: {run.proposedRemediation.risk}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 13 }}>
              {run.proposedRemediation.actions.map((a) => (
                <li key={a.type + a.reason}>
                  <span className="mono" style={{ color: "var(--good)" }}>
                    {a.type}
                  </span>{" "}
                  — {a.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {run.report && (
        <div style={card}>
          <h2 style={h2}>Report</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <Metric
              label="Approval"
              value={run.report.approval.decision}
              tone={run.report.approval.decision === "approved" ? "good" : "muted"}
            />
            <Metric label="Cost" value={`$${run.report.cost.totalUsd.toFixed(4)}`} />
            {run.report.eval && (
              <Metric
                label="Eval"
                value={`${run.report.eval.matched ? "PASS" : "FAIL"} · ${run.report.eval.predicted}`}
                tone={run.report.eval.matched ? "good" : "bad"}
              />
            )}
            {run.report.healthAfter && (
              <Metric
                label="Health"
                value={`${run.report.healthAfter.ok ? "OK" : "BAD"} — ${run.report.healthAfter.detail}`}
                tone={run.report.healthAfter.ok ? "good" : "bad"}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric(props: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  const color =
    props.tone === "good" ? "var(--good)" : props.tone === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "#10161d",
        border: "1px solid var(--line)",
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
        {props.label}
      </div>
      <div style={{ color, fontSize: 14, lineHeight: 1.4 }}>{props.value}</div>
    </div>
  );
}
