#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

IMAGE="${IMAGE:-${REPO}/patient:latest}"

gcloud config set project "$PROJECT"

echo "==> Capture current serving (good) revision"
GOOD_REVISION="$(run_service_revision patient status.latestReadyRevisionName)"
if [[ -z "$GOOD_REVISION" ]]; then
  echo "ERROR: patient service has no ready revision. Deploy patient first." >&2
  exit 1
fi
echo "GOOD_REVISION=${GOOD_REVISION}"

echo "==> Deploy bad revision (0% traffic)"
gcloud run deploy patient \
  --project="$PROJECT" --region="$REGION" \
  --image="${IMAGE}" \
  --no-traffic \
  --tag=bad \
  --update-env-vars="IS_BAD_REVISION=true,APP_SECRET=deployed-secret,REQUIRED_CONFIG_KEY=APP_SECRET,MODE=gcp" \
  --quiet

BAD_REVISION="$(run_service_revision patient status.latestCreatedRevisionName)"
echo "BAD_REVISION=${BAD_REVISION}"

echo "==> Restore healthy service template (0% traffic)"
gcloud run deploy patient \
  --project="$PROJECT" --region="$REGION" \
  --image="${IMAGE}" \
  --no-traffic \
  --update-env-vars="IS_BAD_REVISION=false,APP_SECRET=deployed-secret,REQUIRED_CONFIG_KEY=APP_SECRET,MODE=gcp" \
  --quiet

echo "==> Pin 100% traffic back to good revision"
gcloud run services update-traffic patient \
  --project="$PROJECT" --region="$REGION" \
  --to-revisions="${GOOD_REVISION}=100" \
  --quiet

cat <<EOF

Bad revision ready (0% traffic):
  GOOD_REVISION=${GOOD_REVISION}
  BAD_REVISION=${BAD_REVISION}

Export for chaos-controller deploy:
  export GOOD_REVISION=${GOOD_REVISION}
  export BAD_REVISION=${BAD_REVISION}
EOF
