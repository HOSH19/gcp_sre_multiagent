"use client";

import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function HypothesesCard({ run }: { run: Run | null }) {
  const hypotheses = run?.hypotheses ?? [];

  return (
    <div className="console-panel" style={card}>
      <h2 style={h2}>Hypotheses</h2>
      <div className="console-panel__scroll">
        {hypotheses.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
            Waiting for Hypothesis agent…
          </p>
        )}
        {hypotheses.map((h, i) => (
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

        {run?.proposedRemediation && (
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
    </div>
  );
}
