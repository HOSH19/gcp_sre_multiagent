import { getServiceHealth } from "../tools/index.js";

export async function healthAfterApprove(): Promise<{ ok: boolean; detail: string }> {
  const h = await getServiceHealth();
  const ok = Boolean((h.raw as { patient?: { ok?: boolean } })?.patient?.ok);
  return { ok, detail: h.summary };
}
