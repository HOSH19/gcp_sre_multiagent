# gcp-sre-agents

Multi-agent **GCP Incident Response Crew** — a portfolio project that investigates a controlled Cloud Run “patient” app, streams a live agent timeline, writes an evidence-backed incident report, and applies **rollback** or **env patch** remediation only after human approval.

## Architecture

```text
UI / CLI / Monitoring→Pub/Sub
            │
     Cloud Run API (orchestrator)
            │
   Detector → LogDiver → Hypothesis → Mitigator → Scribe
            │                 │              │
      Logging/Revisions   Gemini Flash   Approve gate
            │
   Firestore (live) + BigQuery (traces) + GCS (artifacts)
```

Agents and allowlisted tools:

| Agent | Model | Tools |
|---|---|---|
| Detector | Flash-Lite | getServiceHealth, listRecentErrors, getUptimeCheckState |
| LogDiver | Flash-Lite | queryLogs, getErrorGroup, listRevisions, getRevisionTraffic, getServiceEnv |
| Hypothesis | Flash | evidence bundle only |
| Mitigator | Flash | proposeRemediation, rollbackTraffic, patchEnvVars, verifyHealth |
| Scribe | Flash-Lite | writeReport, writeBigQueryTrace, finalizeRun |

## Demo scenarios

| ID | Failure | Expected root cause |
|---|---|---|
| `http_500s` | In-app chaos forces 500s | `application_exception_500` |
| `missing_config` | Required env removed | `missing_required_env` |
| `bad_revision_traffic` | Traffic on unhealthy revision | `unhealthy_revision_receiving_traffic` |

## Local quickstart (no GCP required)

```bash
cp .env.example .env
npm install
npm run build -w @gcp-sre/shared

# three terminals
APP_SECRET=local-secret npm run dev:patient
npm run dev:chaos
MODE=local npm run dev:api

# optional UI
npm run dev:web

# CLI
npm run cli -- scenarios
npm run cli -- investigate --scenario bad_revision_traffic
npm run cli -- approve <runId>

# eval harness (patient + chaos must be up)
npm run eval
```

Open http://127.0.0.1:3000 — private console for local demos. On GCP, deploy with Cloud Run IAM (`--no-allow-unauthenticated`).

## Caps & cost guardrails

- 20 agent steps / 5 min wall / **$0.50** / 40 tool calls / **1 concurrent** run
- Budget alerts at **$20** and **$40** (Terraform, when `billing_account` set)
- Scale-to-zero Cloud Run; Flash-Lite by default; Flash only for Hypothesis + Mitigator

## GCP deploy (outline)

1. Create a dedicated GCP project (do not reuse unrelated projects).
2. Phase 1: enable APIs, Artifact Registry (`sre-agents`), Secret Manager (`chaos-admin-token`), budgets.
3. Phase 2: `./scripts/deploy-cloud-run.sh` — builds/pushes images and deploys `patient`, `chaos-controller`, `api`.
4. `./scripts/deploy-web.sh` — private Next.js console with server-side BFF to API/chaos.
5. `./scripts/setup-monitoring.sh` — uptime check + alert → Pub/Sub → `POST /hooks/pubsub`.

Health endpoints use `/health` (Cloud Run frontends can intercept `/healthz`).

Open the private UI locally:

```bash
gcloud run services proxy web --project=sre-multiagent --region=us-central1 --port=8080
# http://127.0.0.1:8080
```


## Demo video checklist

1. Inject **bad revision traffic** → Investigate → live timeline  
2. Show top hypothesis `unhealthy_revision_receiving_traffic`  
3. Approve rollback → health OK + cost line  
4. Repeat for **HTTP 500s** and **missing config**  
5. Show eval summary **3/3** and architecture diagram in README  

## Repo layout

```text
apps/patient            Demo Cloud Run app + /chaos/500
apps/chaos-controller   Inject A/B/C + local remediation APIs
apps/api                Orchestrator, tools, approval, Pub/Sub hook
apps/web                Next.js private console
packages/shared         Types, caps, scenarios
packages/cli            gcp-sre CLI
infra/                  Terraform
evals/                  Scenario fixtures + notes
```

## License

MIT — portfolio / educational use.
