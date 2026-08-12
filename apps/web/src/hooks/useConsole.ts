"use client";

import { useCallback, useEffect, useState } from "react";
import { decide, fetchRun, resetLab, startInvestigate } from "@/lib/api";
import type { Run, ScenarioId } from "@/lib/types";
import { useInterval } from "@/hooks/useInterval";

const LIVE_STATUSES = new Set(["queued", "running", "remediating"]);
const INVESTIGATION_BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "denied"]);

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function runPollMs(status: string | undefined): number | null {
  if (!status) return null;
  if (status === "remediating") return 400;
  if (LIVE_STATUSES.has(status)) return 700;
  if (status === "awaiting_approval") return 2000;
  return null;
}

export function useConsole() {
  const [scenario, setScenario] = useState<ScenarioId>("bad_revision_traffic");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const refreshRun = useCallback(async () => {
    if (!run?.id) return;
    const fresh = await fetchRun(run.id);
    setRun(fresh);
    return fresh;
  }, [run?.id]);

  useInterval(pollMs != null, pollMs ?? 1000, () => {
    void refreshRun().catch((err) => setError(errMsg(err)));
  });

  const wrap = useCallback((fn: () => Promise<void>) => {
    void (async () => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
      } catch (err) {
        setError(errMsg(err));
        if (run?.id) {
          void refreshRun().catch(() => {});
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [run?.id, refreshRun]);

  const decideAndRefresh = useCallback(
    async (decision: "approve" | "deny") => {
      if (!run) return;
      const updated = await decide(run.id, decision);
      setRun(updated);
      if (!TERMINAL_STATUSES.has(updated.status)) {
        void refreshRun().catch((err) => setError(errMsg(err)));
      }
    },
    [run, refreshRun],
  );

  return {
    scenario,
    setScenario,
    run,
    busy,
    resetBusy,
    locked,
    error,
    notice,
    investigate: () =>
      wrap(async () => {
        setRun(await startInvestigate(scenario));
      }),
    approve: () => wrap(() => decideAndRefresh("approve")),
    deny: () => wrap(() => decideAndRefresh("deny")),
    resetLab: () => {
      void (async () => {
        setResetBusy(true);
        setError(null);
        setNotice(null);
        try {
          const result = await resetLab();
          setRun(null);
          const cleared = result.runsCleared.length;
          setNotice(
            cleared
              ? `Lab reset: cleared ${cleared} run${cleared === 1 ? "" : "s"}${result.chaosReset ? ", chaos reset" : ""}.`
              : "Lab reset: chaos cleared, ready for a new investigation.",
          );
        } catch (err) {
          setError(errMsg(err));
        } finally {
          setResetBusy(false);
        }
      })();
    },
  };
}
