"use client";

import { useCallback, useEffect, useState } from "react";
import { decide, fetchRun, startInvestigate } from "@/lib/api";
import type { Run, ScenarioId } from "@/lib/types";
import { useInterval } from "@/hooks/useInterval";

const LIVE_STATUSES = new Set(["queued", "running", "remediating"]);
const INVESTIGATION_BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function runPollMs(status: string | undefined): number | null {
  if (!status) return null;
  if (LIVE_STATUSES.has(status)) return 700;
  if (status === "awaiting_approval") return 2000;
  return null;
}

export function useConsole() {
  const [scenario, setScenario] = useState<ScenarioId>("bad_revision_traffic");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const investigationBusy = Boolean(run && INVESTIGATION_BUSY.has(run.status));
  const locked = busy || investigationBusy;
  const pollMs = runPollMs(run?.status);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const runId = new URLSearchParams(window.location.search).get("runId");
    if (!runId) return;
    void fetchRun(runId)
      .then(setRun)
      .catch((err) => setError(errMsg(err)));
  }, []);

  const refreshRun = useCallback(() => {
    if (!run) return;
    void fetchRun(run.id)
      .then(setRun)
      .catch((err) => setError(errMsg(err)));
  }, [run?.id]);

  useInterval(pollMs != null, pollMs ?? 1000, refreshRun);

  const wrap = useCallback((fn: () => Promise<void>) => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return {
    scenario,
    setScenario,
    run,
    busy,
    locked,
    error,
    investigate: () =>
      wrap(async () => {
        setRun(await startInvestigate(scenario));
      }),
    approve: () =>
      wrap(async () => {
        if (!run) return;
        setRun(await decide(run.id, "approve"));
      }),
    deny: () =>
      wrap(async () => {
        if (!run) return;
        setRun(await decide(run.id, "deny"));
      }),
  };
}
