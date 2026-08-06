export const STATUS_COPY: Record<string, { title: string; detail: string; color: string }> = {
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
    detail:
      "Investigation paused. Click Approve to remediate, or Deny to finish without changes. This is not the end yet.",
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
    detail: "See the error message and agent cards for details.",
    color: "var(--bad)",
  },
};
