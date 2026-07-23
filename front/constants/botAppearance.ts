import type { Bot } from "@/api/bots";
import type { IconSymbolName } from "@/components/ui/IconSymbol";

// Kid-friendly palette, dark enough for white text on light and dark themes.
export const BOT_COLORS = [
  "#E63946",
  "#F3722C",
  "#43AA8B",
  "#2A9D8F",
  "#3A86FF",
  "#8338EC",
  "#FF5D8F",
];

export const BOT_ICONS: IconSymbolName[] = [
  "cpu",
  "wand.and.sparkles",
  "sparkles",
  "star",
  "mountain.2",
  "text.bubble",
];

// Stable identity per bot: hash the name so each bot keeps its color and icon.
function hashBotName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 37 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Parent-configured color wins; otherwise derive a stable one from the name.
export function botColor(bot: Pick<Bot, "name" | "color">): string {
  return bot.color || BOT_COLORS[hashBotName(bot.name) % BOT_COLORS.length];
}

// Parent-configured icon wins; otherwise derive a stable one from the name.
export function botIcon(bot: Pick<Bot, "name" | "icon">): IconSymbolName {
  if (bot.icon && (BOT_ICONS as string[]).includes(bot.icon)) {
    return bot.icon as IconSymbolName;
  }
  return BOT_ICONS[(hashBotName(bot.name) >>> 3) % BOT_ICONS.length];
}
