"use client";

import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function Timeline({ run }: { run: Run }) {
  return (
    <div style={card}>
      <h2 style={h2}>Live timeline</h2>
      <p className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>
        {run.id} · {run.status} · ${run.costUsd.toFixed(4)}
      </p>
      <div style={{ maxHeight: 420, overflow: "auto", marginTop: 12 }}>
        {run.events.map((e) => (
          <div key={e.id} style={{ borderLeft: "2px solid var(--line)", padding: "0.45rem 0.75rem", marginBottom: 6 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              {e.agent} · {e.type}
            </div>
            <div style={{ fontSize: 14 }}>{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
