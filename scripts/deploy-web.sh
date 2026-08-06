#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

API_URL="$(run_service_url api)"
CHAOS_URL="$(run_service_url chaos-controller)"
PATIENT_URL="$(run_service_url patient)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
ACCOUNT="$(gcloud config get-value account)"

echo "==> Build web"
gcloud builds submit --project="$PROJECT" --config=/dev/stdin . <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-t", "${REPO}/web:latest", "-f", "apps/web/Dockerfile", "."]
images:
  - ${REPO}/web:latest
timeout: 1200s
EOF

gcloud run services add-iam-policy-binding api \
  --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.invoker" --quiet

gcloud run services add-iam-policy-binding chaos-controller \
  --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.invoker" --quiet

gcloud secrets add-iam-policy-binding chaos-admin-token \
  --project="$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" --quiet

echo "==> Deploy web (IAM-only)"
gcloud run deploy web \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/web:latest" \
  --no-allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --set-env-vars="API_URL=${API_URL},CHAOS_URL=${CHAOS_URL},NEXT_PUBLIC_API_URL=/api/backend,NEXT_PUBLIC_CHAOS_URL=/api/chaos" \
  --set-secrets="CHAOS_ADMIN_TOKEN=chaos-admin-token:latest" \
  --quiet

WEB_URL="$(run_service_url web)"

gcloud run services add-iam-policy-binding web \
  --project="$PROJECT" --region="$REGION" \
  --member="user:${ACCOUNT}" \
  --role="roles/run.invoker" --quiet

gcloud run services update api \
  --project="$PROJECT" --region="$REGION" \
  --update-env-vars="WEB_ORIGIN=${WEB_URL}" \
  --no-cpu-throttling \
  --quiet

cat <<EOF

Web deployed:
  WEB_URL=${WEB_URL}
  PATIENT_URL=${PATIENT_URL}
  API_URL=${API_URL}

Open (requires your Google login / identity token):
  gcloud run services proxy web --project=${PROJECT} --region=${REGION} --port=8080
  then visit http://127.0.0.1:8080
EOF
