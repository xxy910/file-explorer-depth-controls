import assert from "node:assert/strict";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import { buildSync } from "esbuild";
import type { App, Plugin } from "obsidian";
import { en } from "../src/locales/en.ts";
import { zh } from "../src/locales/zh.ts";
import { readSettings } from "../src/settings-data.ts";
import type { LanguageMode } from "../src/settings-data.ts";

const obsidian = `
  let modern = false;
  function setModern(value) { modern = value; }
  function requireApiVersion(version) { return version === "1.13.0" && modern; }
  class PluginSettingTab {
    updateCalls = 0;
    containerEl = {
      rows: [],
      empty() {
        for (const row of this.rows) if (row.dropdown) row.dropdown.selectEl.isConnected = false;
        this.rows = [];
      },
    };
    constructor() {
      if (modern) this.update = () => {
        this.updateCalls++;
        this.containerEl.empty();
        for (const definition of this.getSettingDefinitions()) {
          definition.render(new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc));
        }
      };
    }
  }
  class Setting {
    constructor(container) { container.rows.push(this); }
    setName(name) { this.name = name; return this; }
    setDesc(desc) { this.desc = desc; return this; }
    addDropdown(render) {
      this.dropdown = {
        options: {},
        selectEl: { isConnected: true, empty: () => { this.dropdown.options = {}; } },
        addOption(value, label) { this.options[value] = label; return this; },
        setValue(value) { this.value = value; return this; },
        onChange(callback) { this.change = callback; return this; },
      };
      render(this.dropdown);
      return this;
    }
    addToggle(render) {
      render({ setValue() { return this; }, onChange() { return this; } });
      return this;
    }
  }
  return { setModern, requireApiVersion, PluginSettingTab, Setting };
`;
type TestHost = { setModern: (value: boolean) => void };
const host = (compileFunction(obsidian) as () => TestHost)();
const bundle = buildSync({
  entryPoints: ["src/settings.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  write: false,
}).outputFiles[0].text;
const moduleStub = { exports: {} };
const evaluate = compileFunction(bundle, ["require", "module"]) as
  (load: () => TestHost, module: typeof moduleStub) => void;
evaluate(() => host, moduleStub);
const { DepthSettingTab } = moduleStub.exports as typeof import("../src/settings.ts");

type RenderedTab = {
  updateCalls: number;
  update?: () => void;
  containerEl: {
    rows: { name: string; dropdown?: {
      value: string;
      options: Record<string, string>;
      change: (value: LanguageMode) => Promise<void>;
    } }[];
  };
};

for (const modern of [false, true]) {
  void test(`settings switch languages after saving on ${modern ? "1.13+" : "1.8.7"}`, async () => {
    host.setModern(modern);
    let saved = JSON.stringify({ language: "en" });
    let settings = readSettings(JSON.parse(saved));
    const tab = new DepthSettingTab({} as App, {} as Plugin, () => settings.language === "zh" ? zh : en,
      () => settings, patch => {
        saved = JSON.stringify({ ...settings, ...patch });
        settings = readSettings(JSON.parse(saved));
        tab.refreshLanguage();
        return Promise.resolve();
      });
    const rendered = tab as unknown as RenderedTab;
    if (rendered.update) rendered.update();
    else tab.display();

    const language = rendered.containerEl.rows[0]?.dropdown;
    assert.ok(language);
    assert.equal(language.value, "en");
    await language.change("zh");
    assert.equal(rendered.containerEl.rows.length, 8);
    assert.equal(rendered.containerEl.rows[0]?.name, zh.language);
    assert.equal(rendered.containerEl.rows[2]?.dropdown?.options.all, zh.all);
    const refreshed = rendered.containerEl.rows[0]?.dropdown;
    assert.ok(refreshed);
    assert.equal(refreshed.value, "zh");
    await refreshed.change("en");
    assert.equal(readSettings(JSON.parse(saved)).language, "en");
    assert.equal(rendered.containerEl.rows[0]?.name, en.language);
    assert.equal(rendered.containerEl.rows[2]?.dropdown?.options.all, en.all);
    assert.equal(rendered.updateCalls, modern ? 3 : 0);
  });
}
