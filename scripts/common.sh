# Shared defaults for deploy / verify scripts. Source from scripts/*.sh.
PROJECT="${PROJECT:-sre-multiagent}"
REGION="${REGION:-us-central1}"
REPO="${REGION}-docker.pkg.dev/${PROJECT}/sre-agents"

run_service_url() {
  local svc="$1"
  gcloud run services describe "$svc" \
    --project="$PROJECT" --region="$REGION" \
    --format='value(status.url)'
}

run_service_revision() {
  local svc="$1"
  local field="$2"
  gcloud run services describe "$svc" \
    --project="$PROJECT" --region="$REGION" \
    --format="value(${field})"
}
