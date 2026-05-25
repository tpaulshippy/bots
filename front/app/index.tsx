import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function ChildHome() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to chat screen as the default landing page
    router.replace("/chat");
  }, [router]);

  return null;
}
