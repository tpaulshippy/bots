import { Modal, Platform, StyleSheet } from "react-native";
import alert from "@/components/Alert";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { ThemedButton } from "@/components/ThemedButton";

import React, { useEffect, useLayoutEffect, useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import { useNavigation, useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { PlatformPressable } from "@react-navigation/elements";
import { useThemeColor } from "@/hooks/useThemeColor";
import { AiModel, fetchAiModels } from "@/api/aiModels";
import * as Sentry from "@sentry/react-native";

interface AdvancedBotEditorProps {
  botEditing: Bot;
}

export default function AdvancedBotEditor({
  botEditing,
}: AdvancedBotEditorProps) {
  const navigation = useNavigation();
  const router = useRouter();
  const [bot, setBot] = useState<Bot>(botEditing);
  const [nameMissing, setNameMissing] = useState(false);
  const [modelMissing, setModelMissing] = useState(false);
  const [isPickerVisible, setPickerVisible] = useState(false);
  const iconColor = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");
  const [aiModels, setAiModels] = useState<AiModel[]>([]);


  useEffect(() => {
    const fetchModels = async () => {
      const models = await fetchAiModels();
      if (!models) {
        return;
      }
      setAiModels(models.results);
    };

    fetchModels();
  }, []);

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
    setModelMissing(!bot?.ai_model);
  };

  const saveBot = async () => {
    await validateBot();

    if (bot) {
      try {
        await upsertBot(bot);
        router.back();
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  };

  const deleteBot = async () => {
    alert("Delete Bot", "Are you sure you want to delete this bot?", [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {},
      },
      {
        text: "Delete",
        onPress: async () => {
          if (bot) {
            bot.deleted_at = new Date();
            await upsertBot(bot);
            router.back();
          }
        },
      },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <PlatformPressable onPress={saveBot}>
          <IconSymbol
            name="checkmark"
            color={iconColor}
            size={40}
            style={styles.saveIcon}
          ></IconSymbol>
        </PlatformPressable>
      ),
    });
  }, [navigation, saveBot]);

  const handleModelPress = () => {
    setPickerVisible(true);
  };

  const handlePickerChange = (itemValue: string) => {
    setBot({ ...bot, ai_model: itemValue });
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
            {aiModels.find(m => m.model_id == bot.ai_model)?.name || "Select a model"}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
      <Modal visible={isPickerVisible} transparent={true} animationType="slide">
        <ThemedView style={styles.modalContainer}>
          <Picker
            selectedValue={bot?.ai_model}
            style={styles.picker}
            onValueChange={handlePickerChange}
          >
            {aiModels.map((model, index) => (
              <Picker.Item key={index} label={model.name} value={model.model_id} />
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
        <ThemedButton onPress={() => deleteBot()} style={styles.button}>
          <IconSymbol
            name="trash"
            color={buttonIconColor}
            size={40}
            style={styles.deleteIcon}
          ></IconSymbol>
          <ThemedText>Delete Bot</ThemedText>
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
  textArea: {
    height: 200,
    borderColor: "gray",
    borderWidth: 1,
    paddingLeft: 8,
    textAlignVertical: "top",
  },
  missing: {
    borderColor: "red",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    paddingLeft: 10,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  deleteIcon: {
    paddingRight: 5,
  },
  saveIcon: {
    marginRight: 5,
  },
});
