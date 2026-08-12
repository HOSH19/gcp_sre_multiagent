"use client";

import { useState } from "react";
import type { AgentEvent } from "@gcp-sre/shared";
import { eventDetails, eventSummary, toolName, typeLabel } from "@/lib/timeline";
import { eventData } from "@/lib/timeline/json";

const TYPE_TONE: Record<string, string> = {
  thought: "var(--muted)",
  tool_call: "var(--accent)",
  tool_result: "var(--good)",
  status: "var(--warn)",
  error: "var(--bad)",
};

export function EventChip({ event }: { event: AgentEvent }) {
  const [open, setOpen] = useState(false);
  const summary = eventSummary(event);
  const details = eventDetails(event);
  const tool = toolName(event);
  const tone = TYPE_TONE[event.type] ?? "var(--muted)";

  return (
    <div
      className="chip-in"
      style={{
        borderRadius: 8,
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${tone}`,
        background: "#10161d",
        padding: "0.45rem 0.55rem",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 10, color: tone, fontWeight: 600 }}>
          {typeLabel(event.type)}
          {tool ? ` · ${tool}` : ""}
        </span>
        {eventData(event)?.mocked === false ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            live
          </span>
        ) : null}
        {details && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{ marginLeft: "auto", padding: "1px 6px", fontSize: 11 }}
          >
            {open ? "Hide" : "…"}
          </button>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4, color: "var(--text)" }}>
        {summary}
      </div>
      {open && details && (
        <pre
          className="mono"
          style={{
            marginTop: 8,
            marginBottom: 0,
            padding: 8,
            borderRadius: 6,
            background: "#0c1117",
            border: "1px solid var(--line)",
            fontSize: 10,
            lineHeight: 1.4,
            overflow: "auto",
            maxHeight: 180,
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
