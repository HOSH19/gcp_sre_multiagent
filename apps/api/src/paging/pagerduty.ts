import { config } from "../config.js";
import { approvalDeepLink } from "./links.js";
import type { NotifyContext, NotifyResult } from "./types.js";

const PD_ENQUEUE = "https://events.pagerduty.com/v2/enqueue";

function severityFor(ctx: NotifyContext): "info" | "warning" | "error" | "critical" {
  const fromPolicy = ctx.registryEntry?.pagerPolicy?.severity;
  if (fromPolicy) return fromPolicy;
  if (ctx.status === "failed") return "error";
  if (ctx.status === "awaiting_approval") return "warning";
  return "info";
}

function routingKey(ctx: NotifyContext): string {
  return (
    ctx.registryEntry?.pagerPolicy?.pagerDutyServiceKey?.trim() ||
    config.pagerDutyRoutingKey.trim()
  );
}

/**
 * PagerDuty Events API v2.
 * - awaiting_approval / failed → trigger
 * - completed / denied → resolve (same dedup key)
 */
export async function notifyPagerDuty(ctx: NotifyContext): Promise<NotifyResult["pagerDuty"]> {
  if (!config.pagingEnabled) return "noop";
  const key = routingKey(ctx);
  if (!key) return "noop";

  const { run, status, summary } = ctx;
  const target = run.targetService ?? run.patientService;
  const dedupKey = `gcp-sre-agents:${run.id}`;
  const link = approvalDeepLink(run.id);
  const eventAction = status === "completed" || status === "denied" ? "resolve" : "trigger";

  const body =
    eventAction === "resolve"
      ? {
          routing_key: key,
          event_action: "resolve" as const,
          dedup_key: dedupKey,
        }
      : {
          routing_key: key,
          event_action: "trigger" as const,
          dedup_key: dedupKey,
          client: "gcp-sre-agents",
          client_url: link,
          payload: {
            summary:
              summary ??
              (status === "awaiting_approval"
                ? `SRE agents: approval needed for ${target} (${run.id})`
                : `SRE agents: run ${status} for ${target} (${run.id})`),
            source: "gcp-sre-agents",
            severity: severityFor(ctx),
            component: target,
            group: run.projectId ?? config.projectId,
            class: status,
            custom_details: {
              runId: run.id,
              status,
              trigger: run.trigger,
              targetService: target,
              approvalUrl: link,
              error: run.error,
            },
          },
          links: [{ href: link, text: "Open console" }],
        };

  try {
    const res = await fetch(PD_ENQUEUE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[paging/pagerduty] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[paging/pagerduty] send failed:", err);
    return "failed";
  }
}
