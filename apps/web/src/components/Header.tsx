"use client";

export function Header({ apiHealth }: { apiHealth: string }) {
  return (
    <header style={{ marginBottom: "2rem" }}>
      <p className="mono" style={{ color: "var(--muted)", letterSpacing: "0.08em", fontSize: 12 }}>
        GCP · MULTI-AGENT · PRIVATE CONSOLE
      </p>
      <h1 style={{ margin: "0.35rem 0", fontSize: "2.2rem", letterSpacing: "-0.03em" }}>gcp-sre-agents</h1>
      <p style={{ color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
        Incident Response Crew — inject a controlled failure, watch the agent timeline, then approve remediation.
      </p>
      <p className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>
        API: {apiHealth}
      </p>
    </header>
  );
}
