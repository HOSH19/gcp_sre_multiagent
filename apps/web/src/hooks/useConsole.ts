"use client";

import { useCallback, useEffect, useState } from "react";
import {
  decide,
  fetchApiHealth,
  fetchRun,
  fetchSoak,
  injectScenario,
  startInvestigate,
  startSoak,
} from "@/lib/api";
import type { Run, ScenarioId, SoakJob } from "@/lib/types";

const LIVE_STATUSES = new Set(["queued", "running", "remediating"]);
const INVESTIGATION_BUSY = new Set(["queued", "running", "awaiting_approval", "remediating"]);
const SOAK_LIVE = new Set(["queued", "running"]);

export function useConsole() {
  const [scenario, setScenario] = useState<ScenarioId>("bad_revision_traffic");
  const [run, setRun] = useState<Run | null>(null);
  const [soak, setSoak] = useState<SoakJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking…");

  const soakRunning = Boolean(soak && SOAK_LIVE.has(soak.status));
  const investigationBusy = Boolean(run && INVESTIGATION_BUSY.has(run.status));
  const locked = busy || soakRunning || investigationBusy;

  useEffect(() => {
    void fetchApiHealth().then(setApiHealth);
  }, []);

  // Poll while agents are actively working so the timeline fills in live.
  useEffect(() => {
    if (!run || !LIVE_STATUSES.has(run.status)) return;
    const t = setInterval(() => {
      void fetchRun(run.id)
        .then(setRun)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 700);
    return () => clearInterval(t);
  }, [run?.id, run?.status]);

  // Poll soak job while sequential scenarios run.
  useEffect(() => {
    if (!soak || !SOAK_LIVE.has(soak.status)) return;
    const t = setInterval(() => {
      void fetchSoak(soak.id)
        .then(async (next) => {
          setSoak(next);
          if (next.currentRunId && next.currentRunId !== run?.id) {
            try {
              setRun(await fetchRun(next.currentRunId));
            } catch {
              /* run may not be readable yet */
            }
          } else if (next.currentRunId && run?.id === next.currentRunId) {
            try {
              setRun(await fetchRun(next.currentRunId));
            } catch {
              /* ignore */
            }
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 900);
    return () => clearInterval(t);
  }, [soak?.id, soak?.status, soak?.currentRunId, run?.id]);

  const wrap = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    scenario,
    setScenario,
    run,
    soak,
    busy,
    locked,
    soakRunning,
    error,
    apiHealth,
    inject: () => void wrap(async () => injectScenario(scenario)),
    investigate: () =>
      void wrap(async () => {
        const next = await startInvestigate(scenario);
        setRun(next);
      }),
    startSoak: () =>
      void wrap(async () => {
        const next = await startSoak();
        setSoak(next);
        setRun(null);
      }),
    approve: () =>
      void wrap(async () => {
        if (!run) return;
        setRun(await decide(run.id, "approve"));
      }),
    deny: () =>
      void wrap(async () => {
        if (!run) return;
        setRun(await decide(run.id, "deny"));
      }),
  };
}
