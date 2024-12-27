import { Platform, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { PlatformPressable } from "@react-navigation/elements";

import { useEffect, useState } from "react";
import { Bot, updateBot } from "@/api/bots";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

export default function BotScreen({}) {
  const router = useRouter();
  const [bot, setBot] = useState<Bot | null>(null);
  const supportedModels = [
    "us.amazon.nova-micro-v1:0",
    "us.amazon.nova-lite-v1:0",
    "us.amazon.nova-pro-v1:0",
    "meta.llama3-3-70b-instruct-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
  ];

  useEffect(() => {
    const loadSelectedBot = async () => {
      const botData = await AsyncStorage.getItem("selectedBot");
      if (botData) {
        const bot = JSON.parse(botData);
        setBot(bot);
      }
    };

    loadSelectedBot();
  }, []);

  const saveBot = async () => {
    try {
      if (bot) {
        await updateBot(bot);
        router.back();
      }
    } catch (error) {
      console.error("Failed to save the bot to local storage", error);
    }
  };

  return bot ? (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Name</ThemedText>
        <ThemedTextInput
          style={styles.input}
          value={bot.name}
          onChangeText={(text) => setBot({ ...bot, name: text })}
        />
      </ThemedView>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Model</ThemedText>
        <Picker
          selectedValue={bot?.model}
          style={styles.picker}
          onValueChange={(itemValue) => setBot({ ...bot, model: itemValue })}
        >
          {supportedModels.map((model, index) => (
            <Picker.Item key={index} label={model} value={model} />
          ))}
        </Picker>
      </ThemedView>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>System Prompt</ThemedText>
        <ThemedTextInput
          style={styles.textArea}
          value={bot.system_prompt}
          onChangeText={(text) => setBot({ ...bot, system_prompt: text })}
          multiline
        />
      </ThemedView>
      <PlatformPressable
        onPress={() => saveBot()}>
        <ThemedText>Save</ThemedText>
      </PlatformPressable>
    </ThemedView>
  ) : null;
}

const styles = StyleSheet.create({
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
    paddingLeft: 8,
  },
  picker: {
    height: 50,
    width: "100%",
  },
  textArea: {
    height: 100,
    borderColor: "gray",
    borderWidth: 1,
    paddingLeft: 8,
    textAlignVertical: "top",
  },
});
