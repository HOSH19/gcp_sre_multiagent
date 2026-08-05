"use client";

import { Header } from "@/components/Header";
import { InjectPanel } from "@/components/InjectPanel";
import { SidePanel } from "@/components/SidePanel";
import { SoakPanel } from "@/components/SoakPanel";
import { StatusBanner } from "@/components/StatusBanner";
import { Timeline } from "@/components/Timeline";
import { useConsole } from "@/hooks/useConsole";

export default function HomePage() {
  const c = useConsole();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
      <Header apiHealth={c.apiHealth} />
      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          marginBottom: "1.5rem",
        }}
      >
        <InjectPanel
          scenario={c.scenario}
          busy={c.locked}
          onScenario={c.setScenario}
          onInject={c.inject}
          onInvestigate={c.investigate}
        />
        <SoakPanel soak={c.soak} locked={c.locked} onStart={c.startSoak} />
      </section>
      {c.error && (
        <p style={{ color: "var(--bad)", marginBottom: "1rem" }} className="mono">
          {c.error}
          {c.error.includes("already active") ||
          c.error.includes("already running") ||
          c.error.includes("capacity reached") ||
          c.error.includes("max per service")
            ? " — Wait for an investigation slot (see MAX_CONCURRENT_RUNS) or finish the active run for that service."
            : ""}
        </p>
      )}
      {c.soakRunning && (
        <p style={{ color: "var(--warn)", marginBottom: "1rem", fontSize: 14 }}>
          Soak in progress — remediation is auto-approved for each scenario.
        </p>
      )}
      {c.run && (
        <StatusBanner
          run={c.run}
          canDecide={c.run.status === "awaiting_approval" && !c.soakRunning}
          busy={c.busy || c.soakRunning}
          onApprove={c.approve}
          onDeny={c.deny}
        />
      )}
      {c.run && (
        <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.2fr 0.8fr" }}>
          <Timeline run={c.run} />
          <SidePanel run={c.run} />
        </section>
      )}
    </main>
  );
}
