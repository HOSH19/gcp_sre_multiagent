import { CHAOS_ADMIN_TOKEN, PATIENT_SERVICE_URL } from "./config.js";

export async function patientChaos(path: string, body?: unknown) {
  const res = await fetch(`${PATIENT_SERVICE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chaos-token": CHAOS_ADMIN_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: json };
}
