"use client";

import type { Run } from "@/lib/types";
import { STATUS_COPY } from "@/lib/statusCopy";
import { card } from "@/lib/styles";

export function StatusBanner({
  run,
  canDecide = false,
  busy = false,
  onApprove,
  onDeny,
}: {
  run: Run;
  canDecide?: boolean;
  busy?: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  const meta = STATUS_COPY[run.status] ?? {
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
      {canDecide && onApprove && onDeny && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="good" disabled={busy} onClick={onApprove}>
            Approve
          </button>
          <button className="bad" disabled={busy} onClick={onDeny}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
