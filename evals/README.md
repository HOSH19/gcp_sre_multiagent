# Eval harness

Scenarios live in `packages/shared` (`SCENARIOS`) and are executed by:

```bash
npm run dev:patient
npm run dev:chaos
npm run eval
```

Unit tests (no patient/chaos servers required):

```bash
npm test
```

Success criteria:

1. Predicted root-cause label matches `expectedRootCause` (via `canonicalRootCause` when set, else fuzzy `matchRootCause`)
2. After Approve, patient health recovers

Caps: see `RUN_CAPS` in `packages/shared` (steps / wall time / cost / tools / concurrency).
