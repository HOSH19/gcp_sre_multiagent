"use client";

import { useEffect, useRef } from "react";
import { EventChip } from "@/components/EventChip";
import { specialistLabel, type Specialist } from "@/lib/agents";
import type { AgentEvent } from "@/lib/types";
import { agentColor } from "@/lib/timeline";
import { card } from "@/lib/styles";

export type AgentPhase = "idle" | "live" | "done";

const PHASE_COPY: Record<AgentPhase, string> = {
  idle: "waiting",
  live: "live",
  done: "done",
};

export function AgentCard(props: {
  agent: Specialist;
  events: AgentEvent[];
  phase: AgentPhase;
}) {
  const color = agentColor(props.agent);
  const live = props.phase === "live";
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!live) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [props.events.length, live]);

  return (
    <div
      style={{
        ...card,
        padding: "0.85rem 0.9rem",
        borderColor: live ? color : "var(--line)",
        boxShadow: live ? `0 0 0 1px ${color}33` : undefined,
        display: "flex",
        flexDirection: "column",
        minHeight: 160,
        maxHeight: 320,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#041018",
            background: color,
            borderRadius: 6,
            padding: "2px 8px",
          }}
        >
          {specialistLabel(props.agent)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: live ? color : "var(--muted)",
            marginLeft: "auto",
          }}
        >
          {PHASE_COPY[props.phase]}
          {props.events.length ? ` · ${props.events.length}` : ""}
        </span>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: "auto",
          display: "grid",
          gap: 6,
          alignContent: "start",
        }}
      >
        {props.events.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No activity yet</p>
        )}
        {props.events.map((e) => (
          <EventChip key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}
