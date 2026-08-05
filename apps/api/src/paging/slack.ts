import { config } from "../config.js";
import type { NotifyContext, NotifyResult } from "./types.js";

function approvalDeepLink(runId: string): string {
  const base = config.webOrigin.replace(/\/$/, "");
  return `${base}/?runId=${encodeURIComponent(runId)}`;
}

/** Post a Slack incoming-webhook message. No-ops when webhook unset or paging disabled. */
export async function notifySlack(ctx: NotifyContext): Promise<NotifyResult["slack"]> {
  if (!config.pagingEnabled || !config.slackWebhookUrl) return "noop";

  const { run, status, summary, registryEntry } = ctx;
  const channel = registryEntry?.pagerPolicy?.slackChannel;
  const link = approvalDeepLink(run.id);
  const target = run.targetService ?? run.patientService;
  const title =
    status === "awaiting_approval"
      ? `Investigation awaiting approval: ${target}`
      : `Investigation ${status}: ${target}`;

  const lines = [
    `*${title}*`,
    summary ? summary : undefined,
    `Run \`${run.id}\` · trigger=${run.trigger} · status=\`${status}\``,
    channel ? `Channel hint: ${channel}` : undefined,
    status === "awaiting_approval" ? `<${link}|Open approval console>` : `<${link}|Open run>`,
  ].filter(Boolean);

  const body = {
    text: title,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
    ],
  };

  try {
    const res = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[paging/slack] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[paging/slack] send failed:", err);
    return "failed";
  }
}

export { approvalDeepLink };
