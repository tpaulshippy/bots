import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";

import { useSessionMode } from "@/hooks/useSessionMode";

/**
 * Teen-delegated devices have no parent surfaces: any navigation into
 * /parent/* (deep link or stale state) bounces to the chat screen.
 */
export function useDelegatedRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { isTeenDelegated } = useSessionMode();

  useEffect(() => {
    if (isTeenDelegated && pathname?.startsWith("/parent")) {
      router.replace("/chat");
    }
  }, [isTeenDelegated, pathname, router]);
}
