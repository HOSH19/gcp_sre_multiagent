import type { InvestigationRun } from "@gcp-sre/shared";
import { config } from "../config.js";
import { registryEntryForRun } from "../fleet/registry.js";
import { notifyPagerDuty } from "./pagerduty.js";
import { approvalDeepLink } from "./links.js";
import { notifySlack } from "./slack.js";
import type { NotifyResult, NotifyStatus } from "./types.js";

/**
 * Send Slack / PagerDuty notifications for approval and terminal statuses.
 * Fail-open: never throws to callers; local / missing secrets → noop.
 */
async function notifyRunStatus(
  run: InvestigationRun,
  status: NotifyStatus,
  summary?: string,
): Promise<NotifyResult> {
  if (!config.pagingEnabled) {
    return { slack: "noop", pagerDuty: "noop", detail: "paging disabled" };
  }

  let registryEntry;
  try {
    registryEntry = await registryEntryForRun(run);
  } catch (err) {
    console.warn("[paging] registry lookup failed:", err);
  }

  const ctx = { run, status, summary, registryEntry };
  const [slack, pagerDuty] = await Promise.all([notifySlack(ctx), notifyPagerDuty(ctx)]);
  const result: NotifyResult = {
    slack,
    pagerDuty,
    detail: `deepLink=${approvalDeepLink(run.id)}`,
  };

  if (slack === "sent" || pagerDuty === "sent") {
    console.log(
      `[paging] run=${run.id} status=${status} slack=${slack} pagerDuty=${pagerDuty}`,
    );
  }
  return result;
}

/** Fire-and-forget wrapper for orchestrator call sites. */
export function queueNotifyRunStatus(
  run: InvestigationRun,
  status: NotifyStatus,
  summary?: string,
): void {
  void notifyRunStatus(run, status, summary).catch((err) => {
    console.error(`[paging] notify failed for ${run.id}:`, err);
  });
}
