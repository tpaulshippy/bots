import { useEffect } from "react";
import { useRouter } from "expo-router";
import { getTokens } from "@/api/tokens";

export default function ChildHome() {
  const router = useRouter();

  useEffect(() => {
    const checkAndRedirect = async () => {
      const tokens = await getTokens();
      if (!tokens || !tokens.access) {
        router.replace("/login");
        return;
      }
      // Redirect immediately without blocking on network calls.
      // Screens handle their own data fetching and auth errors.
      router.replace("/chat");
    };

    checkAndRedirect();
  }, [router]);

  return null;
}
