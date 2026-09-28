import { useEffect, useState } from "react";

import { getSessionMode, subscribeToSessionMode, SessionMode } from "@/api/tokens";

/**
 * Reads the current session mode (teen-delegated or parent) from the stored
 * JWT claims. Returns null until the claims load: consumers must fail
 * closed (treat unknown as teen-delegated) so a teen device never flashes
 * parent-only UI before the async read resolves.
 *
 * Subscribes to token changes so a login/logout without an app restart
 * (e.g. teen login after a parent session) updates long-mounted UI like
 * the drawer and route guard immediately.
 */
export function useSessionMode(): SessionMode | null {
  const [mode, setMode] = useState<SessionMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionMode().then((current) => {
      if (!cancelled) setMode(current);
    });
    const unsubscribe = subscribeToSessionMode((next) => {
      if (!cancelled) setMode(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return mode;
}
