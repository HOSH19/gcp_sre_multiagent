#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-sre-multiagent}"
REGION="${REGION:-us-central1}"
REPO="${REGION}-docker.pkg.dev/${PROJECT}/sre-agents"
SKIP_BUILD="${SKIP_BUILD:-0}"

gcloud config set project "$PROJECT"

build_image() {
  local svc="$1"
  local image="${REPO}/${svc}:latest"
  echo "==> Building ${image}"
  gcloud builds submit --project="$PROJECT" --config=/dev/stdin . <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-t", "${image}", "-f", "apps/${svc}/Dockerfile", "."]
images:
  - ${image}
timeout: 1200s
EOF
}

if [[ "$SKIP_BUILD" != "1" ]]; then
  build_image patient
  build_image chaos-controller
  build_image api
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
ACCOUNT="$(gcloud config get-value account)"

gcloud secrets add-iam-policy-binding chaos-admin-token \
  --project="$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" --quiet

echo "==> Deploy patient (healthy revision)"
gcloud run deploy patient \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/patient:latest" \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --set-env-vars="APP_SECRET=deployed-secret,REQUIRED_CONFIG_KEY=APP_SECRET,MODE=gcp,IS_BAD_REVISION=false" \
  --set-secrets="CHAOS_ADMIN_TOKEN=chaos-admin-token:latest" \
  --quiet

PATIENT_URL="$(gcloud run services describe patient --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
GOOD_REVISION="$(gcloud run services describe patient --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
echo "PATIENT_URL=$PATIENT_URL"
echo "GOOD_REVISION=$GOOD_REVISION"

echo "==> Deploy bad patient revision (0% traffic)"
gcloud run deploy patient \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/patient:latest" \
  --no-traffic \
  --tag=bad \
  --update-env-vars="IS_BAD_REVISION=true" \
  --quiet

BAD_REVISION="$(gcloud run services describe patient --project="$PROJECT" --region="$REGION" --format='value(status.latestCreatedRevisionName)')"
echo "BAD_REVISION=$BAD_REVISION"

# Restore service *template* to healthy env so later env patches don't inherit IS_BAD_REVISION=true.
# Creates an unused revision at 0% traffic; pinned GOOD_REVISION keeps serving.
echo "==> Restore healthy service template (no traffic change to good)"
gcloud run deploy patient \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/patient:latest" \
  --no-traffic \
  --update-env-vars="IS_BAD_REVISION=false,APP_SECRET=deployed-secret,REQUIRED_CONFIG_KEY=APP_SECRET,MODE=gcp" \
  --quiet

gcloud run services update-traffic patient \
  --project="$PROJECT" --region="$REGION" \
  --to-revisions="${GOOD_REVISION}=100" \
  --quiet

# Chaos-controller mutates patient via Cloud Run Admin API
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.developer" --quiet >/dev/null || true

echo "==> Deploy chaos-controller"
gcloud run deploy chaos-controller \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/chaos-controller:latest" \
  --no-allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --set-env-vars="MODE=gcp,GCP_PROJECT_ID=${PROJECT},GCP_REGION=${REGION},PATIENT_SERVICE_NAME=patient,PATIENT_SERVICE_URL=${PATIENT_URL},APP_SECRET=deployed-secret,GOOD_REVISION=${GOOD_REVISION},BAD_REVISION=${BAD_REVISION}" \
  --set-secrets="CHAOS_ADMIN_TOKEN=chaos-admin-token:latest" \
  --quiet

CHAOS_URL="$(gcloud run services describe chaos-controller --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "CHAOS_URL=$CHAOS_URL"

gcloud run services add-iam-policy-binding chaos-controller \
  --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.invoker" --quiet

echo "==> Deploy api"
gcloud run deploy api \
  --project="$PROJECT" --region="$REGION" \
  --image="${REPO}/api:latest" \
  --no-allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --set-env-vars="MODE=gcp,GCP_PROJECT_ID=${PROJECT},GCP_REGION=${REGION},VERTEX_LOCATION=${REGION},PATIENT_SERVICE_NAME=patient,PATIENT_SERVICE_URL=${PATIENT_URL},PATIENT_HEALTH_URL=${PATIENT_URL}/health,CHAOS_CONTROLLER_URL=${CHAOS_URL},APP_SECRET=deployed-secret" \
  --set-secrets="CHAOS_ADMIN_TOKEN=chaos-admin-token:latest" \
  --quiet

API_URL="$(gcloud run services describe api --project="$PROJECT" --region="$REGION" --format='value(status.url)')"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/aiplatform.user" --quiet >/dev/null || true
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/logging.viewer" --quiet >/dev/null || true
# API reads Cloud Run revision/traffic/env
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.viewer" --quiet >/dev/null || true

gcloud run services add-iam-policy-binding api \
  --project="$PROJECT" --region="$REGION" \
  --member="user:${ACCOUNT}" \
  --role="roles/run.invoker" --quiet
gcloud run services add-iam-policy-binding chaos-controller \
  --project="$PROJECT" --region="$REGION" \
  --member="user:${ACCOUNT}" \
  --role="roles/run.invoker" --quiet

cat <<EOF

Deployed on project ${PROJECT}:
  PATIENT_URL=${PATIENT_URL}
  CHAOS_URL=${CHAOS_URL}
  API_URL=${API_URL}
  GOOD_REVISION=${GOOD_REVISION}
  BAD_REVISION=${BAD_REVISION}

Smoke test:
  curl -s "${PATIENT_URL}/health"
  curl -s -H "Authorization: Bearer \$(gcloud auth print-identity-token)" "${API_URL}/health"

Real chaos inject (bad revision):
  curl -s -X POST -H "Authorization: Bearer \$(gcloud auth print-identity-token)" \\
    -H "x-chaos-token: \$(gcloud secrets versions access latest --secret=chaos-admin-token --project=${PROJECT})" \\
    "${CHAOS_URL}/inject/bad_revision_traffic"
  curl -s "${PATIENT_URL}/health"
EOF
