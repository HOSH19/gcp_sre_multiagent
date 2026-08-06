"use client";

import { SCENARIO_OPTIONS, type ScenarioId } from "@/lib/types";
import { card, h2 } from "@/lib/styles";

export function InvestigatePanel(props: {
  scenario: ScenarioId;
  busy: boolean;
  onScenario: (s: ScenarioId) => void;
  onInvestigate: () => void;
}) {
  return (
    <div className="console-panel" style={card}>
      <h2 style={h2}>Investigate</h2>
      <div className="console-panel__scroll">
        <label style={{ display: "block", marginBottom: 8, color: "var(--muted)" }}>Scenario</label>
        <select
          value={props.scenario}
          onChange={(e) => props.onScenario(e.target.value as ScenarioId)}
          style={{
            width: "100%",
            padding: "0.55rem",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "#10161d",
            color: "var(--text)",
            marginBottom: 12,
          }}
        >
          {SCENARIO_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="primary" disabled={props.busy} onClick={props.onInvestigate}>
          Investigate
        </button>
      </div>
    </div>
  );
}
