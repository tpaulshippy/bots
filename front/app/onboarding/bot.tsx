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
import { fetchBots, tryFetchBot } from "@/api/bots";
import { handleUnauthorized } from "@/hooks/useSelectedProfile";
import { WizardStep } from "./WizardStep";

// Wizard defaults: Blank template, Penelope, teal, sparkles icon.
const DEFAULTS = {
  name: "Penelope",
  templateName: "Blank",
  color: "#2A9D8F",
  icon: "sparkles",
};

const storyFromSystemPrompt = (prompt: string) => {
  const match = prompt.match(/the character from (.+?)\. You speak with this character's voice and personality\./s);
  return match?.[1]?.trim() ?? "";
};

export default function OnboardingBot() {
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileName?: string;
    studentEmail?: string;
    profileId?: string;
    review?: string;
  }>();
  const isReview = local.review === "true";
  const [botName, setBotName] = useState(DEFAULTS.name);
  const [templateName, setTemplateName] = useState<string>(DEFAULTS.templateName);
  const [color, setColor] = useState(DEFAULTS.color);
  const [icon, setIcon] = useState(DEFAULTS.icon);
  const [story, setStory] = useState("");
  // Review mode targets the pre-filled bot on save (see bootstrap botId).
  const [botId, setBotId] = useState<string | null>(null);
  const [reviewBot, setReviewBot] = useState<Bot | null>(null);
  const [reviewPrefillLoaded, setReviewPrefillLoaded] = useState(!isReview);
  const [reviewCanCreateBot, setReviewCanCreateBot] = useState(false);
  const [reviewPromptSeed, setReviewPromptSeed] = useState<{
    name: string;
    templateName: string;
    story: string;
    systemPrompt: string;
  } | null>(null);
  // True when the selected id missed page one and the confirming lookup
  // failed transiently: the cached snapshot may be stale, so Continue
  // stays gated instead of submitting possibly-outdated fields.
  const [reviewTargetUnverified, setReviewTargetUnverified] = useState(false);

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
        // Parse the cache independently: malformed JSON reads as "no
        // selection" and must never skip the live fetch below (a throw
        // here used to leave the step gated with live bots available).
        let parsed: any = null;
        try {
          parsed = stored ? JSON.parse(stored) : null;
        } catch {
          parsed = null;
        }
        const bots = await fetchBots().catch((error: unknown) => {
          // Auth errors propagate to the login redirect below; anything
          // else reads as an unavailable list (offline still works).
          if ((error as { name?: string })?.name === "UnauthorizedError") {
            throw error;
          }
          return null;
        });
        const selectedId =
          parsed && typeof parsed.bot_id === "string" && parsed.bot_id
            ? parsed.bot_id
            : null;
        // Resolve the selected id against live data first: the cached
        // snapshot goes stale (the bot editor never refreshes it), so
        // submitting it for a correct botId would overwrite newer server
        // state and break rerun idempotency. The cache remains only as a
        // confirmed-missing/offline fallback, and soft-deleted rows never
        // prefill. Auth errors propagate to the login redirect below.
        const liveMatch =
          (selectedId &&
            bots?.results?.find((bot) => bot.bot_id === selectedId)) ||
          null;
        let serverMatch = null;
        if (selectedId && !liveMatch) {
          // tryFetchBot throws auth errors (boundary redirects) and maps
          // everything else: a bot object, 'missing', or null.
          const lookup = await tryFetchBot(selectedId);
          if (lookup && lookup !== "missing" && !lookup.deleted_at) {
            serverMatch = lookup;
          } else if (lookup === null) {
            // Unverifiable target (failed list and/or failed lookup):
            // prefill stays but Continue gates below instead of
            // submitting possibly-stale fields.
            if (active) {
              setReviewTargetUnverified(true);
            }
          }
        }
        // Row one prefills only when no prior selection exists: with a
        // selectedId, falling back to it would target (and save) the
        // wrong bot.
        const current =
          liveMatch ||
          serverMatch ||
          (selectedId && typeof parsed?.name === "string" ? parsed : null) ||
          (!selectedId ? bots?.results?.[0] : null) ||
          null;
        if (current && active) {
          const currentName = current.name || DEFAULTS.name;
          const currentTemplateName = current.template_name || DEFAULTS.templateName;
          const currentStory =
            currentTemplateName === "Character"
              ? storyFromSystemPrompt(current.system_prompt || "")
              : "";
          setBotName(currentName);
          if (typeof current.bot_id === "string" && current.bot_id) {
            setBotId(current.bot_id);
          }
          setTemplateName(currentTemplateName);
          setColor(current.color || DEFAULTS.color);
          setIcon(current.icon || DEFAULTS.icon);
          setStory(currentStory);
          setReviewBot(current);
          setReviewPromptSeed({
            name: currentName,
            templateName: currentTemplateName,
            story: currentStory,
            systemPrompt: current.system_prompt || "",
          });
          setReviewCanCreateBot(false);
        } else if (active) {
          if (selectedId) {
            // Unresolvable prior selection with an unusable snapshot:
            // keep targeting the id (a save recreates rather than
            // renaming the oldest row) but blank the form so Continue
            // stays gated until the user names the replacement.
            setBotId(selectedId);
            setBotName("");
            setStory("");
            setReviewCanCreateBot(false);
          } else {
            setReviewCanCreateBot(Array.isArray(bots?.results));
          }
        }
      } catch (error) {
        // An expired session leaves the wizard for login; every other
        // prefill failure is best-effort and the defaults still work.
        if (await handleUnauthorized(error, router)) {
          return;
        }
      } finally {
        if (active) {
          setReviewPrefillLoaded(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isReview, router]);

  const trimmedBotName = botName.trim();
  const trimmedStory = story.trim();
  const canReuseReviewPrompt =
    isReview &&
    reviewPromptSeed !== null &&
    trimmedBotName === reviewPromptSeed.name &&
    templateName === reviewPromptSeed.templateName &&
    (templateName !== "Character" || trimmedStory === reviewPromptSeed.story);
  const canContinue =
    (!isReview || reviewPrefillLoaded) &&
    (!isReview || botId !== null || reviewCanCreateBot) &&
    (!isReview || !reviewTargetUnverified) &&
    trimmedBotName.length > 0 &&
    (templateName !== "Character" ||
      trimmedStory.length > 0 ||
      canReuseReviewPrompt);

  // Minimal Bot shape so the shared prompt generator works unchanged.
  const draftBot: Bot = useMemo(
    () => ({
      id: -1,
      bot_id: "",
      name: trimmedBotName,
      ai_model: "",
      system_prompt: "",
      simple_editor: true,
      template_name: templateName,
      response_length: 200,
      restrict_language: true,
      restrict_adult_topics: true,
      enable_web_search: false,
      enable_html_pages: false,
      color,
      icon,
      deleted_at: null,
    }),
    [trimmedBotName, templateName, color, icon]
  );
  const promptBot: Bot = reviewBot
    ? {
        ...reviewBot,
        name: trimmedBotName,
        template_name: templateName,
        color,
        icon,
      }
    : draftBot;
  const reviewPromptWasGenerated =
    reviewPromptSeed !== null &&
    reviewBot !== null &&
    reviewPromptSeed.systemPrompt ===
      generateSystemPrompt(
        {
          ...reviewBot,
          name: reviewPromptSeed.name,
          template_name: reviewPromptSeed.templateName,
        },
        { Name: reviewPromptSeed.name, Story: reviewPromptSeed.story }
      );

  const continueToProtect = () => {
    const inputs: Record<string, string> = { Name: trimmedBotName, Story: trimmedStory };
    router.push({
      pathname: "/onboarding/protect",
      params: {
        profileName: local.profileName ?? "",
        ...(local.studentEmail !== undefined
          ? { studentEmail: local.studentEmail }
          : {}),
        ...(local.profileId ? { profileId: local.profileId } : {}),
        botName: trimmedBotName,
        ...(botId ? { botId } : {}),
        templateName,
        systemPrompt:
          canReuseReviewPrompt ||
          (isReview && reviewPromptSeed !== null && !reviewPromptWasGenerated)
            ? reviewPromptSeed.systemPrompt
            : generateSystemPrompt(promptBot, inputs),
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
