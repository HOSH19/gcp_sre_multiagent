async function identityToken(audience: string): Promise<string | null> {
  if (process.env.GCP_IDENTITY_TOKEN) return process.env.GCP_IDENTITY_TOKEN;
  try {
    const url =
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
      `?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

export async function proxyTo(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const token = await identityToken(baseUrl.replace(/\/$/, ""));
  const headers = new Headers(init.headers);
  headers.set("content-type", headers.get("content-type") ?? "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (process.env.CHAOS_ADMIN_TOKEN) {
    headers.set("x-chaos-token", process.env.CHAOS_ADMIN_TOKEN);
  }
  return fetch(url, { ...init, headers });
}
