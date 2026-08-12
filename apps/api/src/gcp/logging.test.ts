import { describe, expect, it } from "vitest";
import { formatErrorGroupsSummary } from "./logging.js";

describe("formatErrorGroupsSummary", () => {
  it("states clearly when no error logs exist", () => {
    expect(formatErrorGroupsSummary([{ message: "No recent error-severity log entries", count: 0 }])).toBe(
      "No error-severity log entries in lookback window",
    );
  });

  it("uses entry counts instead of ambiguous n=", () => {
    expect(
      formatErrorGroupsSummary([
        { message: "ERROR log entry at 2026-01-01T00:00:00Z (no message body)", count: 40 },
      ]),
    ).toBe(
      "Error groups (1): ERROR log entry at 2026-01-01T00:00:00Z (no message body) (40 entries)",
    );
  });
});
