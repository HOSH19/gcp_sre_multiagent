"use client";

import { ApprovalPanel } from "@/components/ApprovalPanel";
import { Header } from "@/components/Header";
import { InjectPanel } from "@/components/InjectPanel";
import { SidePanel } from "@/components/SidePanel";
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
          busy={c.busy}
          onScenario={c.setScenario}
          onInject={c.inject}
          onInvestigate={c.investigate}
        />
        <ApprovalPanel
          busy={c.busy}
          canDecide={c.run?.status === "awaiting_approval"}
          onApprove={c.approve}
          onDeny={c.deny}
        />
      </section>
      {c.error && (
        <p style={{ color: "var(--bad)", marginBottom: "1rem" }} className="mono">
          {c.error}
          {c.error.includes("already active")
            ? " — Approve or Deny the current run first (only 1 concurrent investigation)."
            : ""}
        </p>
      )}
      {c.run && <StatusBanner run={c.run} />}
      {c.run && (
        <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.2fr 0.8fr" }}>
          <Timeline run={c.run} />
          <SidePanel run={c.run} />
        </section>
      )}
    </main>
  );
}
