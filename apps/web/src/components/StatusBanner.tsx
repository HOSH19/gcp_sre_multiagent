"use client";

import type { Run } from "@/lib/types";
import { card } from "@/lib/styles";

const COPY: Record<string, { title: string; detail: string; color: string }> = {
  queued: {
    title: "Queued",
    detail: "Investigation is waiting to start.",
    color: "var(--muted)",
  },
  running: {
    title: "Running",
    detail: "Agents are collecting evidence and forming hypotheses.",
    color: "var(--accent)",
  },
  awaiting_approval: {
    title: "Waiting for your approval",
    detail: "Investigation paused. Click Approve to remediate, or Deny to finish without changes. This is not the end yet.",
    color: "var(--warn)",
  },
  remediating: {
    title: "Remediating",
    detail: "Approved actions are being applied.",
    color: "var(--accent)",
  },
  completed: {
    title: "Investigation complete",
    detail: "Remediation finished. Check the Report panel for eval + health.",
    color: "var(--good)",
  },
  denied: {
    title: "Investigation closed (denied)",
    detail: "No remediation was applied. You can start a new investigation.",
    color: "var(--muted)",
  },
  failed: {
    title: "Investigation failed",
    detail: "See the error message and timeline for details.",
    color: "var(--bad)",
  },
};

export function StatusBanner({ run }: { run: Run }) {
  const meta = COPY[run.status] ?? {
    title: run.status,
    detail: "",
    color: "var(--muted)",
  };
  return (
    <div
      style={{
        ...card,
        marginBottom: "1rem",
        borderColor: meta.color,
        borderLeftWidth: 4,
      }}
    >
      <div className="mono" style={{ color: meta.color, fontWeight: 600, marginBottom: 4 }}>
        {meta.title} · {run.status}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 14 }}>{meta.detail}</div>
    </div>
  );
}
