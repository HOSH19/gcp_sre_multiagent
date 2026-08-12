# gcp-sre-agents

## Subagents

```mermaid
flowchart TB
  orch["Orchestrator — start run, caps/locks, sequence crew"]

  subgraph row1[" "]
    direction LR
    D["Detector<br/>health, errors, uptime"] --> L["LogDiver<br/>logs, revisions, traffic, env"] --> H["Hypothesis<br/>rank root causes"]
  end

  subgraph row2[" "]
    direction LR
    M["Mitigator<br/>propose → execute remediation"] --> gate{{Human approval}} --> S["Scribe<br/>report + finalize"]
  end

  orch --> D
  H --> M
  gate -->|deny| S
```

## GCP components

Demo project: **`sre-multiagent`**, region **`us-central1`**.

```mermaid
flowchart TB

  subgraph row1[" "]
    direction LR
    cb["Cloud Build<br/>CI deploy"] --> ar["Artifact Registry<br/>images"] --> run["Cloud Run<br/>patient · chaos · api · web"]
  end

  subgraph row2[" "]
    direction LR
    mon["Cloud Monitoring<br/>alerts"] --> pub["Pub/Sub<br/>sre-incidents"] --> api["api<br/>/hooks/pubsub"]
  end

  subgraph row3[" "]
    direction LR
    vertex["Vertex AI<br/>Gemini"] & sm["Secret Manager"] & iam["IAM"]
  end

  subgraph row4[" "]
    direction LR
    store["Firestore · BigQuery · GCS"]
  end

  web["web<br/>BFF UI"] --> api
  api --> vertex
  api --> page["PagerDuty"]
  sm -.-> api
  iam -.-> api
  store -.-> api
```

## GitHub Actions / CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| **ci.yml** | push/PR → `main` | `npm ci`, build, typecheck, and unit tests |
| **codeql.yml** | push/PR → `main` (+ weekly) | CodeQL security analysis (JS/TS) |
| **docker.yml** | push/PR → `main` | Build `patient`, `chaos-controller`, `api`, `web` images (`push: false`) |
| **deploy-cloud-run.yml** | `workflow_dispatch` only | Manual deploy via WIF; needs `GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT` secrets |
