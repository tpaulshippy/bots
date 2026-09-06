import { useEffect, useState } from "react";

import { getSessionMode, SessionMode } from "@/api/tokens";

/**
 * Reads the current session mode (teen-delegated or parent) from the stored
 * JWT claims. Returns null until the claims load: consumers must fail
 * closed (treat unknown as teen-delegated) so a teen device never flashes
 * parent-only UI before the async read resolves.
 */
export function useSessionMode(): SessionMode | null {
  const [mode, setMode] = useState<SessionMode | null>(null);

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
