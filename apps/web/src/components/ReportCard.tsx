"use client";

import { Metric } from "@/components/Metric";
import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function ReportCard({ run }: { run: Run | null }) {
  const report = run?.report;

  if (!report) {
    return (
      <div className="console-panel" style={card}>
        <h2 style={h2}>Report</h2>
        <div className="console-panel__scroll">
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>Waiting for Scribe…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-panel" style={card}>
      <h2 style={h2}>Report</h2>
      <div className="console-panel__scroll">
        <div style={{ display: "grid", gap: 8 }}>
          <Metric
            label="Approval"
            value={report.approval.decision}
            tone={report.approval.decision === "approved" ? "good" : "muted"}
          />
          <Metric label="Cost" value={`$${report.cost.totalUsd.toFixed(4)}`} />
          {report.eval && (
            <Metric
              label="Eval"
              value={`${report.eval.matched ? "PASS" : "FAIL"} · ${report.eval.predicted}`}
              tone={report.eval.matched ? "good" : "bad"}
            />
          )}
          {report.healthAfter && (
            <Metric
              label="Health"
              value={`${report.healthAfter.ok ? "OK" : "BAD"} — ${report.healthAfter.detail}`}
              tone={report.healthAfter.ok ? "good" : "bad"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
