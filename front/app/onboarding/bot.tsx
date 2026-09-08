import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { MenuItem } from "@/components/MenuItem";
import { BotAppearancePicker } from "@/components/BotAppearancePicker";
import {
  templates,
  generateSystemPrompt,
} from "@/api/botTemplates";
import type { Bot } from "@/api/bots";
import { fetchBots } from "@/api/bots";
import { WizardStep } from "./WizardStep";

// Wizard defaults: Blank template, Penelope, teal, sparkles icon.
const DEFAULTS = {
  name: "Penelope",
  templateName: "Blank",
  color: "#2A9D8F",
  icon: "sparkles",
};

export default function OnboardingBot() {
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileName?: string;
    studentEmail?: string;
    review?: string;
  }>();
  const isReview = local.review === "true";
  const [botName, setBotName] = useState(DEFAULTS.name);
  const [templateName, setTemplateName] = useState<string>(DEFAULTS.templateName);
  const [color, setColor] = useState(DEFAULTS.color);
  const [icon, setIcon] = useState(DEFAULTS.icon);
  const [story, setStory] = useState("");

  // Review mode: pre-fill with the currently configured tutor so the wizard
  // shows what's set. Prefer the selected bot, fall back to the first bot.
  useEffect(() => {
    if (!isReview) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("selectedBot").catch(
          () => null
        );
        const parsed = stored ? JSON.parse(stored) : null;
        if (parsed && typeof parsed.name === "string" && active) {
          setBotName(parsed.name || DEFAULTS.name);
          if (typeof parsed.template_name === "string" && parsed.template_name) {
            setTemplateName(parsed.template_name);
          }
          if (typeof parsed.color === "string" && parsed.color) {
            setColor(parsed.color);
          }
          if (typeof parsed.icon === "string" && parsed.icon) {
            setIcon(parsed.icon);
          }
          return;
        }
        const bots = await fetchBots().catch(() => null);
        const first = bots?.results?.[0];
        if (first && active) {
          setBotName(first.name || DEFAULTS.name);
          if (first.template_name) setTemplateName(first.template_name);
          if (first.color) setColor(first.color);
          if (first.icon) setIcon(first.icon);
        }
      } catch {
        // Prefill is best-effort; defaults still work.
      }
    })();
    return () => {
      active = false;
    };
  }, [isReview]);

  const canContinue =
    botName.trim().length > 0 &&
    (templateName !== "Character" || story.trim().length > 0);

  // Minimal Bot shape so the shared prompt generator works unchanged.
  const draftBot: Bot = useMemo(
    () => ({
      id: -1,
      bot_id: "",
      name: botName.trim(),
      ai_model: "",
      system_prompt: "",
      simple_editor: true,
      template_name: templateName,
      response_length: 200,
      restrict_language: true,
      restrict_adult_topics: true,
      enable_web_search: false,
      color,
      icon,
      deleted_at: null,
    }),
    [botName, templateName, color, icon]
  );

  const continueToProtect = () => {
    const inputs: Record<string, string> = { Name: botName.trim(), Story: story.trim() };
    router.push({
      pathname: "/onboarding/protect",
      params: {
        profileName: local.profileName ?? "",
        ...(local.studentEmail ? { studentEmail: local.studentEmail } : {}),
        botName: botName.trim(),
        templateName,
        systemPrompt: generateSystemPrompt(draftBot, inputs),
        color,
        icon,
        ...(isReview ? { review: "true" } : {}),
      },
    });
  };

  // X gets out without saving: review mode returns to Settings, first-run
  // drops to chat (which re-gates to the wizard if nothing exists yet).
  const exitWizard = () => {
    const target = isReview ? "/parent/settings" : "/chat";
    const r = router as unknown as { dismissTo?: (href: string) => void };
    if (typeof r.dismissTo === "function") {
      try {
        r.dismissTo(target);
        return;
      } catch {
        // Fall through to replace.
      }
    }
    router.replace(target as never);
  };

  return (
    <WizardStep
      step={3}
      title="Create a bot"
      subtitle="Pick a starting point — you can change everything later."
      onBack={() => router.back()}
      onClose={exitWizard}
      review={isReview}
    >
      <FlatList
        data={templates}
        keyExtractor={(item) => item.name}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <MenuItem
            iconName="cpu"
            title={item.name}
            hideChevron
            testID={`onboarding-bot-template-${item.name}`}
            onPress={() => setTemplateName(item.name)}
            style={
              item.name === templateName
                ? styles.templateSelected
                : undefined
            }
          />
        )}
      />
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Bot name</ThemedText>
        <ThemedTextInput
          testID="onboarding-bot-name-input"
          value={botName}
          onChangeText={setBotName}
          placeholder="Penelope"
          style={styles.input}
        />
      </View>
      {templateName === "Character" ? (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Story</ThemedText>
          <ThemedTextInput
            testID="onboarding-bot-story-input"
            value={story}
            onChangeText={setStory}
            placeholder="The book, show, or movie"
            style={styles.input}
          />
        </View>
      ) : null}
      <BotAppearancePicker
        color={color}
        icon={icon as any}
        onSelect={(patch) => {
          if (patch.color) setColor(patch.color);
          if (patch.icon) setIcon(patch.icon);
        }}
      />
      <ThemedButton
        testID="onboarding-bot-continue"
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={continueToProtect}
      >
        <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
          Continue
        </ThemedText>
      </ThemedButton>
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  templateSelected: {
    opacity: 1,
    borderWidth: 2,
    borderColor: "#0a7ea4",
  },
  formGroup: {
    width: "100%",
    marginTop: 15,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: "auto",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
