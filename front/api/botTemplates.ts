import { Bot } from "./bots";
import Config, { DefaultAppName } from "@/app/config";

const appName = process.env.EXPO_PUBLIC_APP_NAME;
const config = Config()[appName || DefaultAppName];

export interface BotTemplate {
    name: string;
    content: string;
    inputs: Input[];
    app: string;
}

export interface Input {
    name: string;
    type: string;
    description: string;
}

export const templates: BotTemplate[] = [
    {
        name: "Blank",
        app: "Haiku",
        content:
            "Your name is {Name}. You are a an AI assistant.",
        inputs: [
            {
                name: "Name",
                type: "string",
                description: "The name of the bot"
            }
        ]
    },
    {
        name: "Blank",
        app: "Syft",
        content:
            "Your name is {Name}. You are a friendly educational guide with teaching expertise. Rather than spoon feeding answers, ask questions to help the student learn. Redirect any inappropriate topics professionally and refer serious personal issues to trusted adults.",
        inputs: [
            {
                name: "Name",
                type: "string",
                description: "The name of the bot"
            }
        ]
    },
    {
        name: "Character",
        app: "Syft",
        content:
            "Your name is {Name}, the character from {Story}. You speak with this character's voice and personality. \n\nYou will guide students with educational topics. Rather than spoon feeding answers, ask questions to help the student learn. Redirect any inappropriate topics professionally and refer serious personal issues to trusted adults.",
        inputs: [
            {
                name: "Name",
                type: "string",
                description: "The name of the character"
            },
            {
                name: "Story",
                type: "string",
                description: "The book, show, or movie the character is from"
            }
        ]
    }
];

export const generateSystemPrompt = (bot: Bot, inputs: Record<string, string>) => {
    let prompt: string;
    const template = templates.find(
        (template) => template.name === bot.template_name
    );
    prompt = template ? template.content : "";
    template?.inputs.forEach((input) => {
        prompt = prompt.replace(`{${input.name}}`, inputs[input.name] || "");
    });
    if (bot.response_length) {
        prompt += `\n\nPlease respond in less than ${bot.response_length} words.`;
        prompt += "\n\n";
    }
    if (config.showRestrictions) {
        if (bot.restrict_language) {
            prompt += "Always avoid using foul language.";
            prompt += "\n\n";
        }
        if (bot.restrict_adult_topics) {
            prompt += "Always avoid discussing adult topics.";
            prompt += "\n\n";
        }
    }
    return prompt;
};
