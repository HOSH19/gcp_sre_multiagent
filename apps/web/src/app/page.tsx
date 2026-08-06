"use client";

import { AgentBoard } from "@/components/AgentBoard";
import { Header } from "@/components/Header";
import { HypothesesCard } from "@/components/HypothesesCard";
import { InvestigatePanel } from "@/components/InvestigatePanel";
import { ReportCard } from "@/components/ReportCard";
import { StatusBanner } from "@/components/StatusBanner";
import { useConsole } from "@/hooks/useConsole";

const CAPACITY_HINTS = [
  "already active",
  "already running",
  "capacity reached",
  "max per service",
];

function ErrorBanner({ message }: { message: string }) {
  const capacity = CAPACITY_HINTS.some((h) => message.includes(h));
  return (
    <p style={{ color: "var(--bad)", marginBottom: "1rem" }} className="mono">
      {message}
      {capacity
        ? " — Wait for an investigation slot (see MAX_CONCURRENT_RUNS) or finish the active run for that service."
        : ""}
    </p>
  );
}

export default function HomePage() {
  const c = useConsole();

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
      <Header />
      <section className="console-top">
        <InvestigatePanel
          scenario={c.scenario}
          busy={c.locked}
          onScenario={c.setScenario}
          onInvestigate={c.investigate}
        />
        <HypothesesCard run={c.run} />
        <ReportCard run={c.run} />
      </section>
      {c.error && <ErrorBanner message={c.error} />}
      {c.run && (
        <StatusBanner
          run={c.run}
          canDecide={c.run.status === "awaiting_approval"}
          busy={c.busy}
          onApprove={c.approve}
          onDeny={c.deny}
        />
      )}
      {c.run && <AgentBoard run={c.run} />}
    </main>
  );
}
