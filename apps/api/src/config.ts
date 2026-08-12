function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

const mode = (process.env.MODE ?? "local") as "local" | "gcp";
const projectId = process.env.GCP_PROJECT_ID ?? "local-project";

/**
 * Durable store (Firestore / BQ / GCS) is on when MODE=gcp unless STORE_BACKEND=memory.
 * Local eval (`npm run eval`, MODE=local) always uses the in-memory adapter.
 */
const storeBackend = (process.env.STORE_BACKEND ?? (mode === "gcp" ? "firestore" : "memory")) as
  | "firestore"
  | "memory";

/**
 * Open ReAct (Vertex function calling). Default on in MODE=gcp; off for local/CI eval.
 * Force with REACT=on|off regardless of mode.
 */
const reactEnabled = envBool("REACT", mode === "gcp");

export const config = {
  mode,
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 8080),
  projectId,
  region: process.env.GCP_REGION ?? "us-central1",
  webOrigin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:3000",
  patientHealthUrl: process.env.PATIENT_HEALTH_URL ?? "http://127.0.0.1:8081/health",
  patientServiceUrl: process.env.PATIENT_SERVICE_URL ?? "http://127.0.0.1:8081",
  patientServiceName: process.env.PATIENT_SERVICE_NAME ?? "patient",
  /**
   * Optional Cloud Monitoring uptime check id (short id or full resource name).
   * When unset in MODE=gcp, discover by monitoredResource host matching the service URL.
   */
  uptimeCheckId: process.env.UPTIME_CHECK_ID ?? "",
  /**
   * Optional JSON service registry override (array of entries or `{ services: [...] }`).
   * When unset, load from Firestore `config/serviceRegistry` (gcp) or patient default.
   */
  serviceRegistryJson: process.env.SERVICE_REGISTRY_JSON ?? "",
  chaosControllerUrl: process.env.CHAOS_CONTROLLER_URL ?? "http://127.0.0.1:8082",
  chaosAdminToken: process.env.CHAOS_ADMIN_TOKEN ?? "dev-chaos-token",
  flashLiteModel: process.env.GEMINI_FLASH_LITE_MODEL ?? "gemini-2.5-flash-lite",
  flashModel: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
  vertexLocation: process.env.VERTEX_LOCATION ?? "us-central1",
  /** Abort hung Vertex generateContent calls (ReAct). */
  vertexFetchTimeoutMs: Math.max(5_000, Number(process.env.VERTEX_FETCH_TIMEOUT_MS ?? 120_000)),
  /** Prefer Firestore when true; memory otherwise. */
  useDurableStore: storeBackend === "firestore",
  storeBackend,
  /** Vertex function-calling ReAct loop (production path). */
  reactEnabled,
  maxConcurrentRuns: Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS ?? 1)),
  /**
   * Max in-flight investigations per target service (default 1).
   * Correlation attaches repeat alerts; this blocks a second lease for the same service.
   */
  maxConcurrentPerService: Math.max(1, Number(process.env.MAX_CONCURRENT_PER_SERVICE ?? 1)),
  /** Owner id stamped on leases (Cloud Run revision / hostname / pid). */
  instanceId:
    process.env.INSTANCE_ID ??
    process.env.K_REVISION ??
    process.env.HOSTNAME ??
    `pid-${process.pid}`,
  leaseTtlMs: Number(process.env.LEASE_TTL_MS ?? 15 * 60 * 1000),
  artifactsBucket: process.env.ARTIFACTS_BUCKET ?? `${projectId}-sre-agents-artifacts`,
  bqDataset: process.env.BQ_DATASET ?? "sre_agents",
  bqTracesTable: process.env.BQ_TRACES_TABLE ?? "investigation_traces",
  /** Fail the run when BigQuery ingest fails in durable mode (default true). */
  bqFailClosed: envBool("BQ_FAIL_CLOSED", true),
  /**
   * Outbound paging (PagerDuty Events API v2).
   * Default on in MODE=gcp when routing key is set; always off in MODE=local unless PAGING=on.
   */
  pagingEnabled: (() => {
    const forced = process.env.PAGING;
    if (forced !== undefined && forced.trim() !== "") return envBool("PAGING", false);
    if (mode !== "gcp") return false;
    return Boolean((process.env.PAGERDUTY_ROUTING_KEY ?? "").trim());
  })(),
  /** PagerDuty Events API v2 routing key (global default; registry may override). */
  pagerDutyRoutingKey: (process.env.PAGERDUTY_ROUTING_KEY ?? "").trim(),
};
