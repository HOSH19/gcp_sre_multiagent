import { config } from "../config.js";

/** Console deep-link for a run (approval UX + paging adapters). */
export function approvalDeepLink(runId: string): string {
  const base = config.webOrigin.replace(/\/$/, "");
  return `${base}/?runId=${encodeURIComponent(runId)}`;
}
