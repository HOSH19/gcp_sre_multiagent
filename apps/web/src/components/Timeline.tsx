"use client";

import { useEffect, useRef } from "react";
import { TimelineEvent } from "@/components/TimelineEvent";
import type { Run } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function Timeline({ run }: { run: Run }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [run.events.length, run.status]);

  return (
    <div style={card}>
      <h2 style={h2}>Live timeline</h2>
      <p className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>
        {run.id} · <span style={{ color: "var(--text)" }}>{run.status}</span> · $
        {run.costUsd.toFixed(4)}
        {run.scenario ? ` · ${run.scenario}` : ""}
      </p>
      <div style={{ maxHeight: 560, overflow: "auto", marginTop: 12, paddingRight: 4 }}>
        {run.events.map((e) => (
          <TimelineEvent key={e.id} event={e} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
