"use client";

import { useEffect, useRef } from "react";

/** Call `fn` on an interval while `enabled` is true. */
export function useInterval(enabled: boolean, ms: number, fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(t);
  }, [enabled, ms]);
}
