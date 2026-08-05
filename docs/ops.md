# Production ops notes (P4)

## AuthZ

| Surface | Auth model |
|---|---|
| **API** (`api` Cloud Run) | Deployed with `--no-allow-unauthenticated`. Callers need `roles/run.invoker` (user ADC, Pub/Sub push SA, or web BFF). |
| **Remediation** | Same API identity. Mutations only after human `POST /runs/:id/approve`; action types are allowlisted in code. |
| **Web** console | Prefer Identity-Aware Proxy (IAP) in front of the `web` service, or Cloud Run IAM + authenticated proxy (`gcloud run services proxy`). Deep-links use `WEB_ORIGIN/?runId=…`. |
| **Chaos controller** | Separate Cloud Run service + `CHAOS_ADMIN_TOKEN` (Secret Manager). Used only by API inject / soak paths — **never** registered as an LLM tool. |

### Chaos admin token

- Stored as Secret Manager `chaos-admin-token` and mounted as `CHAOS_ADMIN_TOKEN` on patient / chaos / api.
- Sent only as `x-chaos-token` from `apps/api/src/tools/chaosClient.ts` to the chaos-controller.
- Not part of `AGENT_TOOLS`, `toolHandlers`, or Vertex function declarations. Do not add inject/chaos tools to the ReAct surface.

Local eval (`MODE=local`, `npm run eval`) keeps using the default `dev-chaos-token` against the in-process chaos controller.

## Paging

| Env | Purpose |
|---|---|
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook (global; registry `pagerPolicy.slackChannel` is a message hint). |
| `PAGERDUTY_ROUTING_KEY` | PagerDuty Events API v2 routing key (global default). |
| `PAGING` | Force on/off. Default: off in `MODE=local`; on in `MODE=gcp` when either secret is set. |
| `WEB_ORIGIN` | Base URL for approval deep-links (`/?runId=`). |

Per-service overrides: registry `pagerPolicy.pagerDutyServiceKey` and `severity`.

Notifications fire (fail-open) on:

1. `awaiting_approval` — after Mitigator proposes remediation  
2. `completed` / `denied` — after Scribe `finalizeRun`  
3. `failed` — investigation/approval/BQ failure paths  

Local eval: paging no-ops unless `PAGING=on` and secrets are set.

## Concurrency + soak durability

- `MAX_CONCURRENT_RUNS` — global lease slots (`locks/investigations` in Firestore when durable).
- `MAX_CONCURRENT_PER_SERVICE` — default `1`; blocks a second investigation for the same target (alerts correlate onto the active run).
- Soak jobs persist to Firestore `soaks/{id}` + soak lease when `MODE=gcp` / `STORE_BACKEND=firestore`. Local/eval remains in-memory.
