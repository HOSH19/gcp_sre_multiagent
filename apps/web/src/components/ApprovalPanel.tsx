"use client";

import { card, h2 } from "@/lib/styles";

export function ApprovalPanel(props: {
  busy: boolean;
  canDecide: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div style={card}>
      <h2 style={h2}>2. Approval gate</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.45 }}>
        Mitigator proposes rollback traffic and/or env patch. Nothing mutates until you approve.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="good" disabled={props.busy || !props.canDecide} onClick={props.onApprove}>
          Approve
        </button>
        <button className="bad" disabled={props.busy || !props.canDecide} onClick={props.onDeny}>
          Deny
        </button>
      </div>
    </div>
  );
}
