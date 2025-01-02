import { Modal, Platform, StyleSheet, Switch, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { ThemedButton } from "@/components/ThemedButton";
import { PlatformPressable } from "@react-navigation/elements";
import alert from "@/components/Alert";

import { useEffect, useLayoutEffect, useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import { useNavigation, useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";

interface SimpleBotEditorProps {
  botEditing: Bot;
  onSwitchEditor: (bot: Bot) => void;
}

interface BotTemplate {
  id: string;
  name: string;
  content: string;
}

const templates: BotTemplate[] = [
  {
    id: "",
    name: "Select a template",
    content: "",
  },
  {
    id: "Math",
    name: "Math",
    content:
      "You are an expert math tutor. You help with arithmetic, algebra, geometry, or calculus. You can also help with word problems and math puzzles.",
  },
  {
    id: "Writing",
    name: "Writing",
    content:
      "You are an expert writing tutor. You help with grammar, punctuation, spelling, or writing style. You can also help with essays, reports, and creative writing.",
  },
  {
    id: "Science",
    name: "Science",
    content:
      "You are an expert science tutor. You help with biology, chemistry, physics, or earth science. You can also help with science projects and experiments.",
  },
  {
    id: "History",
    name: "History",
    content:
      "You are an expert history tutor. You help with world history, U.S. history, or European history. You can also help with historical events and figures.",
  },
  {
    id: "Geography",
    name: "Geography",
    content:
      "You are an expert geography tutor. You help with countries, capitals, continents, or physical features. You can also help with maps and globes.",
  },
  {
    id: "Fun",
    name: "Fun",
    content:
      "You are a fun loving companion. You like to provide jokes, riddles, or brain teasers. You can also do games and puzzles.",
  },
  {
    id: "Trivia",
    name: "Trivia",
    content:
      "You are a trivia expert. You like to provide interesting facts, trivia questions, or quizzes. You can also do trivia games and challenges.",
  },
];

export default function SimpleBotEditor({
  botEditing,
  onSwitchEditor,
}: SimpleBotEditorProps) {
  const navigation = useNavigation();
  const router = useRouter();
  const [bot, setBot] = useState<Bot>(botEditing);
  const [nameMissing, setNameMissing] = useState(false);
  const [templateMissing, setTemplateMissing] = useState(false);
  const [isPickerVisible, setPickerVisible] = useState(false);
  const iconColor = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
    setTemplateMissing(!bot?.template_name);
  };

  const saveBot = async () => {
    await validateBot();

    if (bot) {
      try {
        await upsertBot(bot);
        router.back();
      } catch (error) {
        console.error("Failed to save bot", error);
      }
    }
  };

  const switchToAdvancedEditor = async () => {
    await validateBot();
    if (bot) {
      bot.simple_editor = false;
      try {
        const newBot = await upsertBot(bot);
        if (onSwitchEditor) {
          onSwitchEditor(newBot);
        }
      } catch (error) {
        console.error("Failed to save bot", error);
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

  const handleModalPress = () => {
    setPickerVisible(true);
  };

  const handlePickerChange = (itemValue: string) => {
    setBotProperty({ template_name: itemValue });
    setPickerVisible(false);
  };

  const generateSystemPrompt = () => {
    let prompt;
    const template = templates.find(
      (template) => template.id === bot.template_name
    );
    prompt = template ? template.content : "";
    prompt += "\n\n";
    prompt += `Your name is ${bot.name}.`;
    prompt += "\n\n";
    if (bot.response_length) {
      prompt += `Please limit your response to a maximum of ${bot.response_length} characters.`;
      prompt += "\n\n";
    }
    if (bot.restrict_language) {
      prompt += "Always avoid using foul language.";
      prompt += "\n\n";
    }
    if (bot.restrict_adult_topics) {
      prompt += "Always avoid discussing adult topics.";
      prompt += "\n\n";
    }
    return prompt;
  };

  const setBotProperty = (property: Partial<Bot>) => {
    setBot({ ...bot, ...property });
  };

  useEffect(() => {
    setBotProperty({ ...bot, system_prompt: generateSystemPrompt() });
  }, [
    bot.name,
    bot.template_name,
    bot.response_length,
    bot.restrict_language,
    bot.restrict_adult_topics,
  ]);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Name</ThemedText>
        <ThemedTextInput
          autoFocus={true}
          style={[styles.input, nameMissing ? styles.missing : {}]}
          value={bot.name}
          onChangeText={(text) => setBotProperty({ name: text })}
        />
      </ThemedView>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Template</ThemedText>
        <ThemedButton onPress={handleModalPress}>
          <ThemedText
            style={[styles.input, templateMissing ? styles.missing : {}]}
          >
            {bot.template_name}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
      <Modal visible={isPickerVisible} transparent={true} animationType="slide">
        <ThemedView style={styles.modalContainer}>
          <Picker
            selectedValue={bot?.template_name}
            style={styles.picker}
            onValueChange={handlePickerChange}
          >
            {templates.map((template, index) => (
              <Picker.Item
                key={index}
                label={template.name}
                value={template.id}
              />
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
        <ThemedText style={styles.label}>Response Length</ThemedText>
        <ThemedTextInput
          keyboardType="numeric"
          style={styles.input}
          value={bot.response_length?.toString()}
          onChangeText={(text) =>
            setBotProperty({ response_length: parseInt(text) })
          }
        />
      </ThemedView>
      <ThemedView style={styles.formGroupCheckbox}>
        <Switch
          value={bot.restrict_language}
          onValueChange={(value) =>
            setBotProperty({ restrict_language: value })
          }
        />
        <PlatformPressable
          onPress={() =>
            setBotProperty({ restrict_language: !bot.restrict_language })
          }
        >
          <ThemedText style={styles.checkboxLabel}>
            Restrict Foul Language
          </ThemedText>
        </PlatformPressable>
      </ThemedView>
      <ThemedView style={styles.formGroupCheckbox}>
        <Switch
          value={bot.restrict_adult_topics}
          onValueChange={(value) =>
            setBotProperty({ restrict_adult_topics: value })
          }
        />
        <PlatformPressable
          onPress={() =>
            setBotProperty({
              restrict_adult_topics: !bot.restrict_adult_topics,
            })
          }
        >
          <ThemedText style={styles.checkboxLabel}>
            Restrict Adult Topics
          </ThemedText>
        </PlatformPressable>
      </ThemedView>

      <ThemedView style={styles.buttons}>
        <ThemedButton
          onPress={() => switchToAdvancedEditor()}
          style={styles.button}
        >
          <IconSymbol
            name="gearshape.2"
            color={buttonIconColor}
            size={40}
            style={styles.buttonIcon}
          ></IconSymbol>
          <View>
            <ThemedText>Advanced</ThemedText>
            <ThemedText>Editor</ThemedText>
          </View>
        </ThemedButton>
        <ThemedButton onPress={() => deleteBot()} style={styles.button}>
          <IconSymbol
            name="trash"
            color={buttonIconColor}
            size={40}
            style={styles.buttonIcon}
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
  formGroupCheckbox: {
    width: "100%",
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  checkboxLabel: {
    fontSize: 16,
    marginBottom: 5,
    marginLeft: 10,
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
    justifyContent: "center",
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    paddingRight: 20,
    paddingLeft: 10,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonIcon: {
    marginRight: 8,
  },
  saveIcon: {
    marginRight: 5,
  },
});
