import { Modal, ScrollView, Platform, StyleSheet, TouchableOpacity } from "react-native";
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
  const [isPickerVisible, setPickerVisible] = useState(false);

  const supportedModels = [
    {name: "Nova Micro", id: "us.amazon.nova-micro-v1:0"},
    {name: "Nova Lite", id: "us.amazon.nova-lite-v1:0"},
    {name: "Nova Pro", id: "us.amazon.nova-pro-v1:0"},
    {name: "Llama 3.3", id: "meta.llama3-3-70b-instruct-v1:0"},
    {name: "Claude 3 Haiku", id: "anthropic.claude-3-haiku-20240307-v1:0"},
    {name: "Claude 3.5 Haiku", id: "anthropic.claude-3-5-haiku-20241022-v1:0"},
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

  const handleModelPress = () => {
    setPickerVisible(true);
  };

  const handlePickerChange = (itemValue) => {
    setBot({ ...bot, model: itemValue });
    setPickerVisible(false);
  };

  return bot ? (
    <ScrollView contentContainerStyle={styles.container}>
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
        <TouchableOpacity onPress={handleModelPress}>
          <ThemedText style={styles.input}>{bot.model}</ThemedText>
        </TouchableOpacity>
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
      <PlatformPressable
        onPress={() => saveBot()}>
        <ThemedText>Save</ThemedText>
      </PlatformPressable>
    </ScrollView>
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
    padding: 8,
  },
  picker: {
    height: Platform.OS === "web" ? 40 : 200,
    width: "100%"
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  textArea: {
    height: 200,
    borderColor: "gray",
    borderWidth: 1,
    paddingLeft: 8,
    textAlignVertical: "top",
  },
});
