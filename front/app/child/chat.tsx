import { useState } from "react";
import Chat from "../parent/screens/chat";
import SelectBot from "../parent/screens/selectBot";
import { useLocalSearchParams } from "expo-router";

export default function ChildChat() {
  const [botSelected, setBotSelected] = useState(false);
  const local = useLocalSearchParams();

  return botSelected || local.chatId ? <Chat /> : <SelectBot setBotSelected={setBotSelected} />;
}
