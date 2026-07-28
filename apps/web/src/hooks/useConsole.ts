"use client";

import { useCallback, useEffect, useState } from "react";
import { decide, fetchApiHealth, fetchRun, injectScenario, startInvestigate } from "@/lib/api";
import type { Run, ScenarioId } from "@/lib/types";

const LIVE_STATUSES = new Set(["queued", "running", "remediating"]);

export function useConsole() {
  const [scenario, setScenario] = useState<ScenarioId>("bad_revision_traffic");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking…");

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
    busy,
    error,
    apiHealth,
    inject: () => void wrap(async () => injectScenario(scenario)),
    investigate: () =>
      void wrap(async () => {
        const next = await startInvestigate(scenario);
        setRun(next);
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
