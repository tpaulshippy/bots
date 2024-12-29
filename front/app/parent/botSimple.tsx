import { Modal, Platform, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { PlatformPressable } from "@react-navigation/elements";

import { useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

interface SimpleBotEditorProps {
  botEditing: Bot;
  onSwitchEditor: () => void;
}

export default function SimpleBotEditor({
  botEditing,
  onSwitchEditor,
}: SimpleBotEditorProps) {
  const router = useRouter();
  const [bot, setBot] = useState<Bot>(botEditing);
  const [nameMissing, setNameMissing] = useState(false);

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
  };

  const saveBot = async () => {
    await validateBot();

    if (bot) {
      try {
        const newBot = await upsertBot(bot);
        bot.id = newBot.id;
        bot.bot_id = newBot.bot_id;
        await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
        router.back();
      } catch (error) {
        console.error("Failed to save bot", error);
      }
    }
  };

  const switchToAdvancedEditor = async () => {
    bot.simple_editor = false;
    await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
    if (onSwitchEditor) {
      onSwitchEditor();
    }
  };

  const deleteBot = async () => {
    if (bot && confirm("Are you sure you want to delete this bot?")) {
      bot.deleted_at = new Date();
      await upsertBot(bot);
      await AsyncStorage.removeItem("selectedBot");
      router.back();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Name</ThemedText>
        <ThemedTextInput
          style={[styles.input, nameMissing ? styles.missing : {}]}
          value={bot.name}
          onChangeText={(text) => setBot({ ...bot, name: text })}
        />
      </ThemedView>

      <ThemedView style={styles.buttons}>
        <PlatformPressable style={styles.button} onPress={() => saveBot()}>
          <ThemedText>Save</ThemedText>
        </PlatformPressable>
        <PlatformPressable
          style={styles.button}
          onPress={() => switchToAdvancedEditor()}
        >
          <ThemedText>Use Advanced Editor</ThemedText>
        </PlatformPressable>
        <PlatformPressable style={styles.button} onPress={() => deleteBot()}>
          <ThemedText>Delete</ThemedText>
        </PlatformPressable>
      </ThemedView>
    </ThemedView>
  );
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
    backgroundColor: "#222",
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
