import {
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";

import { useEffect, useState } from "react";
import { Bot, fetchBot } from "@/api/bots";
import AdvancedBotEditor from "./botAdvanced";
import SimpleBotEditor from "./botSimple";
import { useLocalSearchParams } from "expo-router";

export default function BotEditor({}) {
  const [bot, setBot] = useState<Bot | null>(null);
  const local = useLocalSearchParams();

  const loadSelectedBot = async () => {
    const botId = local.botId as string;
    if (botId) {
      const bot = await fetchBot(botId);
      setBot(bot);
    }
    else {
      const newBot = {
        id: -1,
        bot_id: "",
        name: "",
        model: "us.amazon.nova-micro-v1:0",
        system_prompt: "",
        simple_editor: true,
        template_name: "",
        response_length: 200,
        restrict_language: true,
        restrict_adult_topics: true,
        deleted_at: null,
      };
      setBot(newBot);
    }
  };

  useEffect(() => {
    loadSelectedBot();
  }, []);

  return bot ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {bot.simple_editor ? (
          <SimpleBotEditor
            botEditing={bot}
            onSwitchEditor={() => loadSelectedBot()}
          />
        ) : (
          <AdvancedBotEditor botEditing={bot} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : null;
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: 20,
  },
  formGroup: {
    width: "100%",
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    padding: 8,
  },
  picker: {
    height: Platform.OS === "web" ? 40 : 200,
    width: "100%",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  button: {
    marginTop: 10,
    marginLeft: 10,
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  textArea: {
    height: 200,
    borderColor: "gray",
    borderWidth: 1,
    paddingLeft: 8,
    textAlignVertical: "top",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  missing: {
    borderColor: "red",
  },
});
