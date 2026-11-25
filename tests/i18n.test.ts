import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { en } from "../src/locales/en.ts";
import { zh } from "../src/locales/zh.ts";
import { readSettings } from "../src/settings-data.ts";

const loader = `
  export function resolve(specifier, context, nextResolve) {
    if (specifier !== "obsidian") return nextResolve(specifier, context);
    return { url: "data:text/javascript,export const getLanguage = () => 'zh-CN';", shortCircuit: true };
  }
`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);
const { getMessages } = await import("../src/i18n.ts");

void test("auto recognizes Chinese locale tags and falls back to English", () => {
  for (const locale of ["zh", "zh-CN", "ZH_tw", "zh-Hans-CN"]) {
    assert.equal(getMessages("auto", locale), zh);
  }
  for (const locale of ["en", "en-US", "fr", "zho", ""]) {
    assert.equal(getMessages("auto", locale), en);
  }
  assert.equal(getMessages(), zh);
});

void test("explicit language overrides the Obsidian locale", () => {
  assert.equal(getMessages("zh", "en"), zh);
  assert.equal(getMessages("en", "zh-CN"), en);
  assert.equal(getMessages("en"), en);
});

void test("saved language accepts supported modes and defaults older or invalid settings to auto", () => {
  for (const language of ["auto", "zh", "en"]) {
    assert.equal(readSettings({ language }).language, language);
  }
  for (const language of [undefined, null, "", "zh-CN", "fr", "EN", true, 1, {}]) {
    assert.equal(readSettings({ language }).language, "auto");
  }
  assert.equal(readSettings({ level: 2 }).language, "auto");
});
