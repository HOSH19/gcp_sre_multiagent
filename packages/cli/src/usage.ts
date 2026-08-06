/** Print CLI usage and exit. */
export function usage(): never {
  console.log(`gcp-sre — Incident Response Crew CLI

Usage:
  gcp-sre scenarios
  gcp-sre inject <http_500s|missing_config|bad_revision_traffic>
  gcp-sre reset
  gcp-sre investigate [--scenario <id>] [--no-inject]
  gcp-sre approve <runId>
  gcp-sre deny <runId>
  gcp-sre report <runId>
  gcp-sre runs
`);
  process.exit(1);
}
