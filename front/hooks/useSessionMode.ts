import { useEffect, useState } from "react";

import { getSessionMode, PARENT_SESSION_MODE, SessionMode } from "@/api/tokens";

/**
 * Reads the current session mode (teen-delegated or parent) from the stored
 * JWT claims. Re-evaluated on mount; parent mode is the default while the
 * claims load.
 */
export function useSessionMode(): SessionMode {
  const [mode, setMode] = useState<SessionMode>(PARENT_SESSION_MODE);

  useEffect(() => {
    let cancelled = false;
    getSessionMode().then((current) => {
      if (!cancelled) setMode(current);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
