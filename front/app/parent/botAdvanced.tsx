import {
  Modal,
  Platform,
  StyleSheet,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { ThemedButton } from "@/components/ThemedButton";

import { useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

interface SupportedModel {
  name: string;
  id: string;
}

interface AdvancedBotEditorProps {
  botEditing: Bot;
}

export default function AdvancedBotEditor({botEditing} : AdvancedBotEditorProps) {
  const router = useRouter();
  const [bot, setBot] = useState<Bot>(botEditing);
  const [nameMissing, setNameMissing] = useState(false);
  const [modelMissing, setModelMissing] = useState(false);
  const [isPickerVisible, setPickerVisible] = useState(false);

  const supportedModels: SupportedModel[] = [
    { name: "Nova Micro", id: "us.amazon.nova-micro-v1:0" },
    { name: "Nova Lite", id: "us.amazon.nova-lite-v1:0" },
    { name: "Nova Pro", id: "us.amazon.nova-pro-v1:0" },
    { name: "Llama 3.3", id: "meta.llama3-3-70b-instruct-v1:0" },
    { name: "Claude 3 Haiku", id: "anthropic.claude-3-haiku-20240307-v1:0" },
    {
      name: "Claude 3.5 Haiku",
      id: "anthropic.claude-3-5-haiku-20241022-v1:0",
    },
  ];

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
    setModelMissing(!bot?.model);
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

  const deleteBot = async () => {
    if (bot && confirm("Are you sure you want to delete this bot?")) {
      bot.deleted_at = new Date();
      await upsertBot(bot);
      await AsyncStorage.removeItem("selectedBot");
      router.back();
    }
  };

  const handleModelPress = () => {
    setPickerVisible(true);
  };

  const handlePickerChange = (itemValue : string) => {
    setBot({ ...bot, model: itemValue });
    setPickerVisible(false);
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
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Model</ThemedText>
        <ThemedButton onPress={handleModelPress}>
          <ThemedText
            style={[styles.input, modelMissing ? styles.missing : {}]}
          >
            {bot.model}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
      <Modal visible={isPickerVisible} transparent={true} animationType="slide">
        <ThemedView style={styles.modalContainer}>
          <Picker
            selectedValue={bot?.model}
            style={styles.picker}
            onValueChange={handlePickerChange}
          >
            {supportedModels.map((model, index) => (
              <Picker.Item key={index} label={model.name} value={model.id} />
            ))}
          </Picker>
          <ThemedButton
            onPress={() => setPickerVisible(false)}
            style={styles.button}
          >
            <ThemedText>Close</ThemedText>
          </ThemedButton>
        </ThemedView>
      </Modal>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>System Prompt</ThemedText>
        <ThemedTextInput
          style={styles.textArea}
          value={bot.system_prompt}
          onChangeText={(text) => setBot({ ...bot, system_prompt: text })}
          multiline
        />
      </ThemedView>
      <ThemedView style={styles.buttons}>
        <ThemedButton style={styles.button} onPress={() => saveBot()}>
          <ThemedText>Save</ThemedText>
        </ThemedButton>
        <ThemedButton style={styles.button} onPress={() => deleteBot()}>
          <ThemedText>Delete</ThemedText>
        </ThemedButton>
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
