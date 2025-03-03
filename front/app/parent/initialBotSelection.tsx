import { StyleSheet, Switch, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedButton } from "@/components/ThemedButton";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MenuItem } from "@/components/MenuItem";
import { useState } from "react";
import { Bot, upsertBot } from "@/api/bots";
import { useRouter } from "expo-router";
import { generateSystemPrompt, templates } from "@/api/botTemplates";
import { fetchAiModels } from "@/api/aiModels";

const themes = [
  {
    name: "Lord of the Rings",
    icon: "mountain.2",
    bots: ["Gandalf", "Samwise Gamgee"],
  },
  {
    name: "Harry Potter",
    icon: "wand.and.sparkles",
    bots: ["Ron Weasley", "Hermione Granger"],
  },
  {
    name: "Star Wars",
    icon: "star",
    bots: ["R2D2", "C-3PO"],
  },
];

export default function InitialBotSelection() {
  const router = useRouter();
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const bgColor = useThemeColor({}, "cardBackground");
  const bgColorSelected = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");

  const toggleTheme = (themeName: string) => {
    setSelectedThemes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(themeName)) {
        newSet.delete(themeName);
      } else {
        newSet.add(themeName);
      }
      return newSet;
    });
  };

  const createBots = async () => {
    if (selectedThemes.size === 0) return;
    setIsLoading(true);

    try {
      // Get all bot templates that belong to selected themes
      const botsToCreate = templates.filter((template) =>
        Array.from(selectedThemes).some((theme) =>
          themes.find((t) => t.name === theme)?.bots.includes(template.name)
        )
      );
      const models = await fetchAiModels();
      const defaultModel = models.results.find((model) => model.is_default);

      // Create each bot
      for (const template of botsToCreate) {
        const newBot: Bot = {
          id: -1,
          bot_id: "",
          name: template.name,
          ai_model: defaultModel?.model_id || models.results[0]?.model_id || "",
          template_name: template.name,
          simple_editor: true,
          restrict_language: true,
          restrict_adult_topics: true,
          deleted_at: null,
          system_prompt: template.content,
          response_length: 200,
        };
        newBot.system_prompt = generateSystemPrompt(newBot);
        await upsertBot(newBot as Bot);
      }

      router.replace("/");
    } catch (error) {
      console.error("Failed to create bots:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Welcome to Syft Learning</ThemedText>
      <ThemedText style={styles.subtitle}>
        Choose your favorites to make your first bots!
      </ThemedText>

      <ThemedView style={styles.outerThemesContainer}>
        <ThemedView style={styles.themesContainer}>
          {themes.map((theme) => (
            <MenuItem
              key={theme.name}
              iconName={theme.icon}
              title={theme.name}
              subtitle={`Includes: ${theme.bots.join(", ")}`}
              hideChevron={true}
              onPress={() => toggleTheme(theme.name)}
              style={[
                styles.themeItem,
                selectedThemes.has(theme.name)
                  ? { backgroundColor: bgColorSelected }
                  : { backgroundColor: bgColor },
              ]}
            />
          ))}
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.footer}>
        <ThemedButton
          onPress={createBots}
          style={[
            styles.button,
            selectedThemes.size === 0 && styles.buttonDisabled,
          ]}
        >
          <IconSymbol
            name="sparkles"
            color={buttonIconColor}
            size={24}
            style={styles.buttonIcon}
          />
          <ThemedText style={styles.buttonText}>
            {isLoading ? "Creating..." : "Create Bots"}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    marginTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  outerThemesContainer: {
    height: 184,
  },
  themesContainer: {
    flex: 1,
  },
  themeItem: {
    borderRadius: 10,
    marginBottom: 10,
  },
  footer: {
    marginTop: "auto",
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
