"use client";

import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function SidePanel({ run }: { run: Run }) {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={card}>
        <h2 style={h2}>Hypotheses</h2>
        {(run.hypotheses ?? []).map((h) => (
          <div key={h.rootCauseLabel} style={{ marginBottom: 10 }}>
            <div className="mono" style={{ color: "var(--accent)" }}>
              {h.rootCauseLabel} ({Math.round(h.confidence * 100)}%)
            </div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>{h.summary}</div>
          </div>
        ))}
        {run.proposedRemediation && (
          <>
            <h3 style={{ ...h2, fontSize: 15, marginTop: 16 }}>Proposed remediation</h3>
            <p style={{ margin: 0 }}>{run.proposedRemediation.summary}</p>
            <p style={{ color: "var(--warn)", fontSize: 13 }}>Risk: {run.proposedRemediation.risk}</p>
          </>
        )}
      </div>
      {run.report && (
        <div style={card}>
          <h2 style={h2}>Report</h2>
          <p className="mono" style={{ fontSize: 13 }}>
            approval={run.report.approval.decision}
            <br />
            cost=${run.report.cost.totalUsd.toFixed(4)}
            <br />
            {run.report.eval && (
              <>
                eval={run.report.eval.matched ? "PASS" : "FAIL"} ({run.report.eval.predicted} vs{" "}
                {run.report.eval.expected})
                <br />
              </>
            )}
            {run.report.healthAfter && (
              <>
                health={run.report.healthAfter.ok ? "OK" : "BAD"} — {run.report.healthAfter.detail}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
