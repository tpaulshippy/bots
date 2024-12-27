import { useState } from "react";
import Chat from "./botChat";
import SelectBot from "./selectBot";
import { useLocalSearchParams } from "expo-router";

export default function ChildChat() {
  const [botSelected, setBotSelected] = useState(false);
  const local = useLocalSearchParams();

  return botSelected || local.chatId ? <Chat /> : <SelectBot setBotSelected={setBotSelected} />;
}
