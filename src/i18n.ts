import { getLanguage } from "obsidian";
import { en } from "./locales/en.ts";
import { zh } from "./locales/zh.ts";
import type { LanguageMode } from "./settings-data.ts";

export type Messages = typeof en;

export function getMessages(language: LanguageMode = "auto", obsidianLang?: string): Messages {
  if (language === "zh") return zh;
  if (language === "en") return en;
  return /^zh(?:[-_]|$)/i.test(obsidianLang ?? getLanguage()) ? zh : en;
}
