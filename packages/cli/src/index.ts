#!/usr/bin/env node
import {
  cmdApprove,
  cmdDeny,
  cmdInject,
  cmdInvestigate,
  cmdReport,
  cmdReset,
  cmdRuns,
  cmdScenarios,
} from "./commands/index.js";
import { usage } from "./usage.js";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();

  const handlers: Record<string, () => Promise<void>> = {
    scenarios: cmdScenarios,
    inject: () => cmdInject(rest[0]),
    reset: cmdReset,
    investigate: () => cmdInvestigate(rest),
    approve: () => cmdApprove(rest[0]),
    deny: () => cmdDeny(rest[0]),
    report: () => cmdReport(rest[0]),
    runs: cmdRuns,
  };

  const handler = handlers[cmd];
  if (!handler) usage();
  await handler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
