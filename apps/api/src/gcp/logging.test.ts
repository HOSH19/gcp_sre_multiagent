import { describe, expect, it } from "vitest";
import { formatErrorGroupsSummary, groupErrorEntries } from "./logging.js";

describe("formatErrorGroupsSummary", () => {
  it("states clearly when no error logs exist", () => {
    expect(formatErrorGroupsSummary([{ message: "No recent error-severity log entries", count: 0 }])).toBe(
      "No error-severity log entries in lookback window",
    );
  });

  it("uses entry counts instead of ambiguous n=", () => {
    expect(
      formatErrorGroupsSummary([
        {
          message:
            "40 ERROR log entries (no message body) on patient — likely health-check/503 failures (2026-01-01T00:00:00Z .. 2026-01-01T00:05:00Z)",
          count: 40,
        },
      ]),
    ).toBe(
      "Error groups (1): 40 ERROR log entries (no message body) on patient — likely health-check/503 failures (2026-01-01T00:00:00Z .. 2026-01-01T00:05:00Z) (40 entries)",
    );
  });
});

describe("groupErrorEntries", () => {
  it("collapses 40 body-less errors into one group with count and time range", () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      timestamp: `2026-08-12T03:${String(29 + Math.floor(i / 10)).padStart(2, "0")}:${String(17 + (i % 10)).padStart(2, "0")}Z`,
      message: "",
      bodyLess: true,
    }));
    entries[0]!.timestamp = "2026-08-12T03:29:17Z";
    entries[39]!.timestamp = "2026-08-12T03:35:22Z";

    const groups = groupErrorEntries(entries, "patient");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(40);
    expect(groups[0]?.message).toBe(
      "40 ERROR log entries (no message body) on patient — likely health-check/503 failures (2026-08-12T03:29:17Z .. 2026-08-12T03:35:22Z)",
    );
  });

  it("keeps body-less bucket separate from distinct message groups", () => {
    const entries = [
      ...Array.from({ length: 5 }, () => ({
        timestamp: "2026-08-12T03:30:00Z",
        message: "",
        bodyLess: true,
      })),
      {
        timestamp: "2026-08-12T03:31:00Z",
        message: "Misconfigured: APP_SECRET missing",
        bodyLess: false,
      },
    ];

    const groups = groupErrorEntries(entries, "patient");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      message:
        "5 ERROR log entries (no message body) on patient — likely health-check/503 failures (2026-08-12T03:30:00Z)",
      count: 5,
    });
    expect(groups[1]).toEqual({ message: "Misconfigured: APP_SECRET missing", count: 1 });
  });
});
