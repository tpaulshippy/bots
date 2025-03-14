import { FlatList, Platform, StyleSheet, Switch, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Picker } from "@react-native-picker/picker";
import { ThemedButton } from "@/components/ThemedButton";
import { PlatformPressable } from "@react-navigation/elements";
import alert from "@/components/Alert";
import * as Sentry from "@sentry/react-native";

import { useEffect, useLayoutEffect, useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import { useNavigation, useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MenuItem } from "@/components/MenuItem";
import { generateSystemPrompt, templates } from "@/api/botTemplates";

interface SimpleBotEditorProps {
  botEditing: Bot;
  onSwitchEditor: (bot: Bot) => void;
}

export default function SimpleBotEditor({
  botEditing,
  onSwitchEditor,
}: SimpleBotEditorProps) {
  const navigation = useNavigation();
  const router = useRouter();
  const [bot, setBot] = useState<Bot>(botEditing);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [nameMissing, setNameMissing] = useState(false);
  const [templateMissing, setTemplateMissing] = useState(false);
  const [isPickerVisible, setPickerVisible] = useState(false);
  const iconColor = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({}, "cardBackground");
  const bgColorSelected = useThemeColor({}, "tint");

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
    setTemplateMissing(!bot?.name);
  };

  const switchToAdvancedEditor = async () => {
    await validateBot();
    if (bot) {
      bot.simple_editor = false;
      try {
        const newBot = await upsertBot(bot);
        if (onSwitchEditor && newBot) {
          onSwitchEditor(newBot);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <PlatformPressable onPress={switchToAdvancedEditor}>
          <IconSymbol
            name="checkmark"
            color={iconColor}
            size={40}
            style={styles.saveIcon}
          ></IconSymbol>
        </PlatformPressable>
      ),
    });
  }, [navigation, switchToAdvancedEditor]);

  const setBotProperty = (property: Partial<Bot>) => {
    setBot({ ...bot, ...property });
  };

  useEffect(() => {
    setBotProperty({
      ...bot,
      system_prompt: generateSystemPrompt(bot, inputs),
    });
  }, [
    bot.name,
    bot.template_name,
    bot.response_length,
    bot.restrict_language,
    bot.restrict_adult_topics,
    inputs,
  ]);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Select a Template</ThemedText>
        <FlatList
          scrollEnabled={false}
          data={templates}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <MenuItem
              key={item.name}
              iconName="cpu"
              title={item.name}
              hideChevron={true}
              onPress={() => setBotProperty({ template_name: item.name })}
              style={[
                item.name === bot.template_name
                  ? { backgroundColor: bgColorSelected }
                  : { backgroundColor: bgColor },
              ]}
            />
          )}
        />
      </ThemedView>
      {templates.find((template) => template.name === bot.template_name)?.inputs.map((input) => (
        <ThemedView style={styles.formGroup} key={input.name}>
          <ThemedText style={styles.label}>{input.name}</ThemedText>
          <ThemedTextInput
            autoFocus={true}
            style={[styles.input, nameMissing ? styles.missing : {}]}
            value={inputs[input.name]}
            onChangeText={(text) => {
              setInputs({ ...inputs, [input.name]: text })
              if (input.name === "Name") {
                setBotProperty({ name: text })
              }
            }}
          />
          <ThemedText style={styles.description}>{input.description}</ThemedText>
        </ThemedView>
      ))}
      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Response Length (words)</ThemedText>
        <ThemedTextInput
          keyboardType="numeric"
          style={styles.input}
          value={bot.response_length?.toString()}
          onChangeText={(text) =>
            setBotProperty({ response_length: text.trim() ? parseInt(text) : 0 })
          }
        />
      </ThemedView>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <ThemedText style={styles.checkboxLabel}>
          Restrict Foul Language
        </ThemedText>

        <Switch
          value={bot.restrict_language}
          onValueChange={(value) =>
            setBotProperty({ restrict_language: value })
          }
        />
      </ThemedView>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <ThemedText style={styles.checkboxLabel}>
          Restrict Adult Topics
        </ThemedText>

        <Switch
          value={bot.restrict_adult_topics}
          onValueChange={(value) =>
            setBotProperty({ restrict_adult_topics: value })
          }
        />
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
    justifyContent: "space-between",
    borderRadius: 10,
    padding: 5,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  description: {
    fontSize: 14,
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
    flex: 1,
    justifyContent: "flex-end",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    paddingRight: 10,
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
