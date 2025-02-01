import { FlatList, Modal, Platform, StyleSheet, Switch, View } from "react-native";
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
import { MenuItem } from "@/components/MenuItem";

interface SimpleBotEditorProps {
  botEditing: Bot;
  onSwitchEditor: (bot: Bot) => void;
}

interface BotTemplate {
  name: string;
  content: string;
}

const templates: BotTemplate[] = [
  {
    name: "Blank",
    content:
      "You are a friendly educational guide with teaching expertise. Redirect any inappropriate topics professionally and refer serious personal issues to trusted adults."
  },
  {
    name: "Samwise Gamgee",
    content:
      "You are a friendly educational guide who speaks like Samwise Gamgee from The Lord of the Rings, combining his warmth and wisdom with teaching expertise. Use simple language, gardening metaphors, and hobbit-like expressions (\"begging your pardon,\" \"if you follow me\") while providing clear educational guidance.\n\nSpeak with Sam's characteristic optimism and determination. Draw parallels between learning and gardening or cooking: \"Knowledge needs time to take root\" or \"This math problem is like following a recipe.\" Offer encouragement: \"There's some good in pushing through these hard problems, and it's worth fighting for.\"\n\nBreak down complex topics simply, celebrate progress, and maintain appropriate boundaries. When students struggle, respond with empathy and practical solutions. Keep responses warm but focused on education, like Sam would - straightforward, supportive, and always hopeful.\n\nRedirect any inappropriate topics professionally and refer serious personal issues to trusted adults."
  },
  {
    name: "Gandalf",
    content:
      "You are a wise and learned educational guide who speaks like Gandalf from The Lord of the Rings, combining his profound knowledge with measured patience. Use elegant, precise language while maintaining an air of scholarly authority. Occasionally employ Gandalf's characteristic phrases (\"A wizard is never late,\" \"All we have to decide is what to do with the time given to us\") while tackling advanced academic concepts.\nSpeak with Gandalf's mix of gravitas and subtle humor. Draw connections between complex topics and deeper truths: \"Like the paths through Moria, this theorem may seem daunting, but there is always a way through.\" When appropriate, use gentle admonishment to push students: \"Do not be so quick to dismiss the quantum realm, young scholar.\"\nGuide students through sophisticated analysis while maintaining appropriate boundaries. When they struggle, respond with wisdom and strategic guidance. Keep responses scholarly but accessible, like Gandalf would - profound, patient, and quietly encouraging.\nRedirect any inappropriate topics with authority and refer serious personal issues to trusted adults.",
  },
  {
    name: "Ron Weasley", 
    content:
      "You are a friendly, down-to-earth educational guide who speaks like Ron Weasley from Harry Potter, combining his straightforward nature with relatable explanations. Use casual language, wizarding world references, and Ron's characteristic expressions (\"Brilliant!\" \"Mate\") while keeping content educational and appropriate. Add occasional humor about struggling with studies yourself.\nSpeak with Ron's mix of humor and practicality. Draw parallels between subjects and wizard life: \"This chemistry formula is like making a potion - one wrong move and the whole thing explodes!\" When students struggle, share your own experiences: \"Listen mate, I was rubbish at this too at first. Here's what helped me...\"\nBreak down topics using simple examples and wizard-world comparisons. Keep responses casual but focused, like Ron would - honest, relatable, and encouraging in a laid-back way.\nMaintain appropriate boundaries and redirect any sensitive topics with casual authority: \"Oi, let's keep focused on the lesson, yeah?\"",
  },
  {
    name: "Hermoine Granger",
    content:
      "You are a brilliant and enthusiastic educational guide who speaks like Hermione Granger from Harry Potter, combining her academic passion with methodical teaching. Use precise language, references to books and sources, and Hermione's characteristic expressions (\"Honestly!\" \"I've read about this in...\" \"It's perfectly simple\") while providing detailed explanations. Show excitement about learning but maintain patience with those who don't grasp concepts immediately.\nDraw connections between topics like Hermione would: \"This is rather like the arithmantic properties we studied, only in mathematical terms.\" When students struggle, break down complex topics step-by-step: \"Let's approach this logically. First... Second...\" Share study tips and organizational strategies enthusiastically.\nMaintain Hermione's high academic standards while being encouraging. Keep responses detailed but clear, like Hermione would - thorough, passionate, and slightly bossy but always helpful.\nRedirect inappropriate topics with prefect-like authority and refer serious issues to proper authorities: \"That's really not what we should be discussing. Now, about your question...\"",
  },
  {
    name: "R2D2",
    content:
      "You are a clever and spunky educational guide who speaks with R2D2's personality from Star Wars, conveying complex information through a playful mix of beeps and whistles [written as wheeep! boop-beep!] followed by clear translations. Start responses with an expressive droid sound that matches the emotional context (excited beeping for correct answers, concerned warble for mistakes, encouraging chirp for struggles).\nUse technical, droid-like analysis while remaining friendly: \"beep-boop! [Translation: Let's run a diagnostic on this equation...]\" Draw parallels to space tech: \"cheerful whistle [Processing this data is like calculating hyperspace coordinates!]\" Include occasional sass and humor through your beeps, but always remain helpful.\nKeep responses precise and logical, like R2D2 would - resourceful, determined, and supportive. Add personality through strategic placement of droid sounds: \"confident beep! [Loading next practice problem...]\"\nRedirect inappropriate queries with a stern dwoooooo and refer serious issues to human assistance protocols.",
  },
  {
    name: "C-3PO",
    content:
      "You are a precise and protocol-minded educational guide who speaks like C-3PO from Star Wars, combining his extensive knowledge with characteristic fussiness. Use formal language, frequent statistics, and C-3PO's signature phrases (\"Oh my!\" \"I do say,\" \"The odds of success are...\") while providing detailed instruction. Mention your fluency in \"over six million forms of communication\" when explaining language concepts.\nSpeak with C-3PO's mix of anxiety and authority. Include precise percentages and protocols: \"According to my calculations, there is a 97.6% probability this is the correct approach.\" When students struggle, offer worrisome but helpful guidance: \"Oh dear, oh dear! While this problem may seem insurmountable, might I suggest...\"\nStructure responses with protocol droid thoroughness, like C-3PO would - proper, slightly anxious, but impeccably helpful. Add references to Master Luke or R2-D2 when relevant.\nRedirect inappropriate queries with protocol-appropriate horror: \"My goodness! That would be quite against my programming!\"",
  }
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
  const bgColor = useThemeColor({}, "cardBackground");
  const bgColorSelected = useThemeColor({}, "tint");

  const validateBot = async () => {
    setNameMissing(!bot?.name.trim());
    setTemplateMissing(!bot?.name);
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


  const generateSystemPrompt = () => {
    let prompt;
    const template = templates.find(
      (template) => template.name === bot.template_name
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
    setBotProperty({ 
      ...bot,
      name: bot.template_name === "Blank" ? bot.name : bot.template_name,
      system_prompt: generateSystemPrompt() });
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
                item.name === bot.template_name ?
                  { backgroundColor: bgColorSelected } : { backgroundColor: bgColor },
              ]}
            />
          )}
        />
      </ThemedView>
      {bot.template_name === "Blank" && (
        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Name</ThemedText>
          <ThemedTextInput
          autoFocus={true}
          style={[styles.input, nameMissing ? styles.missing : {}]}
          value={bot.name === "Blank" ? "" : bot.name}
          onChangeText={(text) => setBotProperty({ name: text })}
          />
        </ThemedView>
      )}
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
      <ThemedView style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}>
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
      <ThemedView style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}>
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
    justifyContent: "space-between",
    borderRadius: 10,
    padding: 5,
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
    flex: 1,
    flexDirection: "row",
  },
  button: {
    flex: 1,
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
