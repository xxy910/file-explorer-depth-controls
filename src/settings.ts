import { PluginSettingTab, Setting } from "obsidian";
import type { App, DropdownComponent, Plugin, SettingDefinitionRender } from "obsidian";
import { isNumericDepth, LEVELS } from "./depth.ts";
import type { Depth } from "./depth.ts";
import type { Messages } from "./i18n.ts";
import { isLanguageMode } from "./settings-data.ts";
import type { DepthSettings } from "./settings-data.ts";

type ToggleKey = Exclude<keyof DepthSettings, "language" | "depth" | "maxDepth">;
type DepthSettingDefinition = Omit<SettingDefinitionRender, "render"> & { render: (setting: Setting) => void };
export type UpdateSettings = (patch: Partial<DepthSettings>, applyDepth?: Depth) => Promise<void>;

export class DepthSettingTab extends PluginSettingTab {
  private depthDropdown?: DropdownComponent;
  private maxDropdown?: DropdownComponent;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly readMessages: () => Messages,
    private readonly read: () => DepthSettings,
    private readonly onChange: UpdateSettings,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.clearDropdowns();
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const setting = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render(setting);
    }
  }

  getSettingDefinitions(): DepthSettingDefinition[] {
    const text = this.readMessages();
    return [
      {
        name: text.language,
        desc: text.languageHelp,
        render: setting => {
          setting.addDropdown(dropdown => dropdown
            .addOption("auto", text.languageAuto)
            .addOption("zh", text.languageZh)
            .addOption("en", text.languageEn)
            .setValue(this.read().language)
            .onChange(async value => {
              if (isLanguageMode(value)) await this.onChange({ language: value });
            }));
        },
      },
      this.toggle("restoreOnStartup", text.restore, text.restoreHelp),
      { name: text.depth, render: (setting: Setting) => { this.renderDepth(setting); } },
      { name: text.max, desc: text.maxHelp, render: (setting: Setting) => { this.renderMax(setting); } },
      this.toggle("showExpandAllButton", text.allButton),
      this.toggle("keepActiveFileVisible", text.keep, text.keepHelp),
      this.toggle("showToolbar", text.toolbar),
      this.toggle("showNotices", text.notices),
    ];
  }

  hide(): void {
    this.clearDropdowns();
  }

  refreshLanguage(): void {
    const isDisplayed = this.depthDropdown?.selectEl.isConnected ?? false;
    this.clearDropdowns();
    if (typeof this.update === "function") this.update();
    else if (isDisplayed) this.display();
  }

  private clearDropdowns(): void {
    this.depthDropdown = undefined;
    this.maxDropdown = undefined;
  }

  refresh(): void {
    const { depth, maxDepth } = this.read();
    if (this.depthDropdown) {
      this.depthDropdown.selectEl.empty();
      for (const level of LEVELS.slice(0, maxDepth)) this.depthDropdown.addOption(String(level), `L${level}`);
      this.depthDropdown.addOption("all", this.readMessages().all).setValue(String(depth));
    }
    this.maxDropdown?.setValue(String(maxDepth));
  }

  private renderDepth(setting: Setting): void {
    setting.addDropdown(dropdown => {
      this.depthDropdown = dropdown;
      this.refresh();
      dropdown.onChange(async value => {
        const requestedDepth = value === "all" ? value : Number(value);
        if (requestedDepth === "all" || isNumericDepth(requestedDepth)) await this.onChange({}, requestedDepth);
      });
    });
  }

  private renderMax(setting: Setting): void {
    setting.addDropdown(dropdown => {
      this.maxDropdown = dropdown;
      for (const level of LEVELS.slice(1)) dropdown.addOption(String(level), `L${level}`);
      dropdown.setValue(String(this.read().maxDepth)).onChange(async value => {
        const maxDepth = Number(value);
        if (isNumericDepth(maxDepth) && maxDepth !== 1) await this.onChange({ maxDepth });
      });
    });
  }

  private toggle(key: ToggleKey, name: string, desc?: string): DepthSettingDefinition {
    return {
      name,
      desc,
      render: (setting: Setting) => {
        setting.addToggle(toggle => toggle.setValue(this.read()[key]).onChange(value => this.onChange({ [key]: value })));
      },
    };
  }
}
