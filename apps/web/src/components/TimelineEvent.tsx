"use client";

import { useState } from "react";
import type { AgentEvent } from "@/lib/types";
import {
  agentColor,
  eventDetails,
  eventSummary,
  hasExpandableDetails,
  toolName,
  typeLabel,
} from "@/lib/timelineFormat";

export function TimelineEvent({ event }: { event: AgentEvent }) {
  const [open, setOpen] = useState(false);
  const color = agentColor(event.agent);
  const summary = eventSummary(event);
  const details = eventDetails(event);
  const expandable = hasExpandableDetails(event);
  const tool = toolName(event);

  return (
    <div
      style={{
        borderLeft: `3px solid ${color}`,
        background: "rgba(255,255,255,0.02)",
        borderRadius: "0 10px 10px 0",
        padding: "0.65rem 0.85rem",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "#041018",
            background: color,
            borderRadius: 999,
            padding: "2px 8px",
            fontWeight: 600,
          }}
        >
          {event.agent}
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {typeLabel(event.type)}
          {tool ? ` · ${tool}` : ""}
          {event.data?.mocked === false ? " · live LLM" : ""}
          {event.data?.mocked === true ? " · mock" : ""}
        </span>
        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 12 }}
          >
            {open ? "Hide details" : "Details"}
          </button>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{summary}</div>

      {open && details && (
        <pre
          className="mono"
          style={{
            marginTop: 10,
            marginBottom: 0,
            padding: 10,
            borderRadius: 8,
            background: "#0c1117",
            border: "1px solid var(--line)",
            fontSize: 11,
            lineHeight: 1.45,
            overflow: "auto",
            maxHeight: 260,
            color: "#c5d4e4",
            whiteSpace: "pre-wrap",
          }}
        >
          {details.value}
        </pre>
      )}
    </div>
  );
}
