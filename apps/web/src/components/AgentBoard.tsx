"use client";

import { AgentCard, type AgentPhase } from "@/components/AgentCard";
import { SPECIALISTS, isSpecialist, type Specialist } from "@/lib/agents";
import type { AgentEvent, Run } from "@/lib/types";
import { h2 } from "@/lib/styles";

const LIVE = new Set(["queued", "running", "remediating"]);
const ROW1 = SPECIALISTS.slice(0, 3);
const ROW2 = SPECIALISTS.slice(3);

function groupByAgent(events: AgentEvent[]): Record<Specialist, AgentEvent[]> {
  const groups = Object.fromEntries(SPECIALISTS.map((a) => [a, [] as AgentEvent[]])) as Record<
    Specialist,
    AgentEvent[]
  >;
  for (const e of events) {
    if (isSpecialist(e.agent)) groups[e.agent].push(e);
  }
  return groups;
}

function activeSpecialist(events: AgentEvent[]): Specialist | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const agent = events[i].agent;
    if (isSpecialist(agent)) return agent;
  }
  return null;
}

function phaseFor(
  agent: Specialist,
  events: AgentEvent[],
  active: Specialist | null,
  runLive: boolean,
): AgentPhase {
  if (events.length === 0) return "idle";
  if (runLive && active === agent) return "live";
  return "done";
}

export function AgentBoard({ run }: { run: Run }) {
  const groups = groupByAgent(run.events);
  const active = activeSpecialist(run.events);
  const runLive = LIVE.has(run.status);

  const renderCard = (agent: Specialist) => (
    <AgentCard
      key={agent}
      agent={agent}
      events={groups[agent]}
      phase={phaseFor(agent, groups[agent], active, runLive)}
    />
  );

  return (
    <section>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ ...h2, marginBottom: 4 }}>Agents</h2>
        <p className="mono" style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          {run.id} · <span style={{ color: "var(--text)" }}>{run.status}</span> · $
          {run.costUsd.toFixed(4)}
          {run.scenario ? ` · ${run.scenario}` : ""}
        </p>
      </div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          }}
        >
          {ROW1.map(renderCard)}
        </div>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          {ROW2.map(renderCard)}
        </div>
      </div>
    </section>
  );
}
