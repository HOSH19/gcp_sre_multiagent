#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

API_URL="$(run_service_url api)"
PATIENT_URL="$(run_service_url patient)"
HOST="$(echo "$PATIENT_URL" | sed -E 's#https://##' | sed -E 's#/.*##')"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
PUSH_USER_SA="pubsub-push@${PROJECT}.iam.gserviceaccount.com"

echo "==> Pub/Sub topic + push subscription"
gcloud pubsub topics create sre-incidents --project="$PROJECT" 2>/dev/null || true
gcloud pubsub topics create sre-incidents-dlq --project="$PROJECT" 2>/dev/null || true

gcloud iam service-accounts create pubsub-push \
  --project="$PROJECT" --display-name="Pub/Sub push to API" 2>/dev/null || true

gcloud run services add-iam-policy-binding api \
  --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:${PUSH_USER_SA}" \
  --role="roles/run.invoker" --quiet

gcloud iam service-accounts add-iam-policy-binding "$PUSH_USER_SA" \
  --project="$PROJECT" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet

gcloud pubsub subscriptions delete sre-incidents-api-push --project="$PROJECT" --quiet 2>/dev/null || true
gcloud pubsub subscriptions create sre-incidents-api-push \
  --project="$PROJECT" \
  --topic=sre-incidents \
  --push-endpoint="${API_URL}/hooks/pubsub" \
  --push-auth-service-account="$PUSH_USER_SA" \
  --ack-deadline=60 \
  --quiet

echo "==> Uptime check"
gcloud monitoring uptime create patient-health \
  --project="$PROJECT" \
  --resource-type=uptime-url \
  --resource-labels="host=${HOST},project_id=${PROJECT}" \
  --path=/health --protocol=https --port=443 --period=1 --timeout=10 --quiet \
  2>/dev/null || true

echo "==> Notification channel + alert"
gcloud pubsub topics add-iam-policy-binding sre-incidents \
  --project="$PROJECT" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-monitoring-notification.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" --quiet || true

CHANNEL="$(gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName='sre-incidents-pubsub'" --format='value(name)' | head -1 || true)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create \
    --project="$PROJECT" \
    --display-name="sre-incidents-pubsub" \
    --type=pubsub \
    --channel-labels="topic=projects/${PROJECT}/topics/sre-incidents" \
    --format='value(name)' --quiet)"
fi

python3 - "$CHANNEL" <<'PY'
import json, sys
channel = sys.argv[1]
policy = {
  "displayName": "patient-unhealthy",
  "combiner": "OR",
  "conditions": [{
    "displayName": "patient uptime failing",
    "conditionThreshold": {
      "filter": 'resource.type = "uptime_url" AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"',
      "comparison": "COMPARISON_LT",
      "thresholdValue": 1,
      "duration": "60s",
      "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_FRACTION_TRUE"}],
    },
  }],
  "notificationChannels": [channel],
  "documentation": {"content": "gcp-sre-agents incident via sre-incidents.", "mimeType": "text/markdown"},
  "enabled": True,
}
open("/tmp/alert-policy.json", "w").write(json.dumps(policy))
PY

EXISTING="$(gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName='patient-unhealthy'" --format='value(name)' | head -1 || true)"
[[ -n "$EXISTING" ]] && gcloud alpha monitoring policies delete "$EXISTING" --project="$PROJECT" --quiet || true
gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file=/tmp/alert-policy.json --quiet

gcloud pubsub topics publish sre-incidents --project="$PROJECT" \
  --message='{"scenario":"missing_config"}' --attribute=scenario=missing_config

cat <<EOF

Monitoring wired:
  topic: projects/${PROJECT}/topics/sre-incidents
  push: sre-incidents-api-push → ${API_URL}/hooks/pubsub
  uptime: patient-health (${HOST}/health)
  alert: patient-unhealthy → Pub/Sub
EOF
