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
import { useLocalSearchParams, useRouter } from "expo-router";


export default function BotEditor() {
  const router = useRouter();
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

  const switchToAdvanced = (bot: Bot) => {
    router.replace({
      pathname: `/parent/botEditor`,
      params: { title: bot.name || "New Bot", botId: bot.bot_id || "" },
    });
  };


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
            onSwitchEditor={(bot: Bot) => switchToAdvanced(bot)}
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
});
