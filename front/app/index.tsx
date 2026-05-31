import { useEffect } from "react";
import { useRouter } from "expo-router";
import { getTokens } from "@/api/tokens";
import { fetchBots } from "@/api/bots";
import { UnauthorizedError } from "@/api/apiClient";

export default function ChildHome() {
  const router = useRouter();

  useEffect(() => {
    const checkAndRedirect = async () => {
      const tokens = await getTokens();
      if (!tokens || !tokens.access) {
        router.replace("/login");
        return;
      }

      try {
        const botsData = await fetchBots();
        if (botsData && botsData.count > 0) {
          router.replace("/chat");
        } else {
          router.replace("/chatHistory");
        }
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          router.replace("/login");
        } else {
          router.replace("/chatHistory");
        }
      }
    };

    checkAndRedirect();
  }, [router]);

  return null;
}
