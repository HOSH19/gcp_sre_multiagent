# Eval harness

Scenarios are defined in [`scenarios.json`](./scenarios.json) and executed by:

```bash
# terminals: patient + chaos-controller + (optional) nothing else — eval imports orchestrator in-process
npm run dev:patient
npm run dev:chaos
npm run eval
```

Success criteria (plan §15C):

1. Predicted root-cause label matches `expectedRootCause`
2. After Approve, patient health recovers

Caps enforced during each run: 20 steps / 5 min / $0.50 / 40 tools / 1 concurrent.
