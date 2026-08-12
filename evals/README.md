# Eval harness

Scenarios live in `packages/shared` (`SCENARIOS`) and are executed by:

```bash
# Terminal 1 — patient needs APP_SECRET for a healthy baseline
APP_SECRET=local-secret npm run dev:patient

# Terminal 2
npm run dev:chaos

# Terminal 3
npm run eval
```

Set `APP_SECRET=local-secret` in `.env` (see `.env.example`) so the patient starts healthy; the `missing_config` scenario removes it.

Unit tests (no patient/chaos servers required):

```bash
npm test
```

Success criteria:

1. Predicted root-cause label matches `expectedRootCause` (via `canonicalRootCause` when set, else fuzzy `matchRootCause`)
2. After Approve, patient health recovers

Caps: see `RUN_CAPS` in `packages/shared` (steps / wall time / cost / tools / concurrency).
