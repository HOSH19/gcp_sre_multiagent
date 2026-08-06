import { CHAOS_TOKEN, CHAOS_URL } from "./config.js";

/** POST to the chaos-controller with the admin token. */
export async function chaosPost(path: string): Promise<unknown> {
  const res = await fetch(`${CHAOS_URL}${path}`, {
    method: "POST",
    headers: { "x-chaos-token": CHAOS_TOKEN },
  });
  return res.json();
}
