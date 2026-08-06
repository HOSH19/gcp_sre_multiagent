"use client";

export function Metric(props: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "muted";
}) {
  const color =
    props.tone === "good" ? "var(--good)" : props.tone === "bad" ? "var(--bad)" : "var(--text)";

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "#10161d",
        border: "1px solid var(--line)",
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
        {props.label}
      </div>
      <div style={{ color, fontSize: 14, lineHeight: 1.4 }}>{props.value}</div>
    </div>
  );
}
