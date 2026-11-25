import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import { buildSync } from "esbuild";
import type { Command } from "obsidian";
import type { UpdateSettings } from "../src/settings.ts";

const hostClass = "file-explorer-depth-controls-host";
const bundle = buildSync({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  write: false,
}).outputFiles[0].text;

class Element {
  readonly isConnected = true;
  readonly children = new Set<Element>();
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    has: (name: string) => this.classes.has(name),
    toggle() {},
  };
  parentElement?: Element;

  createDiv() {
    const child = new Element();
    child.parentElement = this;
    this.children.add(child);
    return child;
  }

  createEl() { return this.createDiv(); }
  addEventListener() {}
  setAttribute() {}
  remove() {
    this.parentElement?.children.delete(this);
    this.parentElement = undefined;
  }
}

function fixture() {
  const timers = new Map<number, () => void>();
  const events = new Map<string, () => void>();
  const commands = new Map<string, Command>();
  let changeSettings: UpdateSettings | undefined;
  let visible: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  let timerId = 0;
  let view: { headerDom: { navButtonsEl: Element }; fileItems?: object } | undefined;
  class TFolder {
    readonly path = "example";
  }
  const host = {
    workspace: {
      on: (name: string, listener: () => void) => events.set(name, listener),
      onLayoutReady: (callback: () => void) => callback(),
      getLeavesOfType: () => view ? [{ view }] : [],
      getActiveFile: () => undefined,
    },
    vault: { getRoot: () => ({ children: [] }) },
  };
  class Plugin {
    readonly app = host;
    loadData() { return { depth: 1 }; }
    addSettingTab(tab: { onChange: UpdateSettings }) { changeSettings = tab.onChange; }
    addCommand(command: Command) { commands.set(command.id, command); }
    registerEvent() {}
    saveData() {}
  }
  class IntersectionObserver {
    constructor(callback: typeof visible) { visible = callback; }
    observe() {}
    unobserve() {}
    disconnect() { visible = undefined; }
  }
  const exports = {} as { default: new () => { onload(): Promise<void>; onunload(): void } };
  const module = { exports };
  const clock = {
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const loadBundle = compileFunction(bundle, ["require", "module", "window", "IntersectionObserver"]) as (
    requireModule: () => object,
    result: typeof module,
    window: typeof clock,
    observer: typeof IntersectionObserver,
  ) => void;
  loadBundle(
    () => ({
      getLanguage: () => "en",
      Platform: { isMobile: true },
      Notice: class {},
      Plugin,
      PluginSettingTab: class {},
      TFolder,
    }),
    module,
    clock,
    IntersectionObserver,
  );
  return {
    plugin: new module.exports.default(),
    mount(element: Element, fileItems?: object) {
      view = { headerDom: { navButtonsEl: element }, fileItems };
      events.get("layout-change")?.();
    },
    showDrawer() {
      assert(view);
      const folder = {
        file: new TFolder(),
        collapsed: false,
        setCollapsed(collapsed: boolean) { this.collapsed = collapsed; },
      };
      view.fileItems = { example: folder };
      visible?.([{ isIntersecting: true }]);
      return folder;
    },
    set: (patch: Parameters<UpdateSettings>[0]) => {
      assert(changeSettings);
      return changeSettings(patch);
    },
    runCommand() { commands.get("show-depth-2")?.callback?.(); },
    timers,
    async tick() {
      const next = timers.entries().next();
      assert(!next.done);
      const [id, callback] = next.value;
      timers.delete(id);
      callback();
      await setImmediate();
    },
  };
}

void test("a late explorer mount wakes dormant restore once and cleans up both toolbar hosts", async () => {
  const setup = fixture();
  await setup.plugin.onload();
  for (let attempt = 0; attempt < 5; attempt++) await setup.tick();
  assert.equal(setup.timers.size, 0);

  const original = new Element();
  setup.mount(original, {});
  assert(original.classList.has(hostClass));
  assert.equal(setup.timers.size, 1);
  const replacement = new Element();
  setup.mount(replacement, {});
  assert(!original.classList.has(hostClass));
  assert.equal(original.children.size, 0);
  assert(replacement.classList.has(hostClass));
  assert.equal(setup.timers.size, 1);
  await setup.tick();
  assert.equal(setup.timers.size, 0);
  setup.plugin.onunload();
  assert(!replacement.classList.has(hostClass));
  assert.equal(replacement.children.size, 0);
});

void test("showing an existing mobile drawer can wake restore after the timed attempts", async () => {
  const setup = fixture();
  await setup.plugin.onload();
  setup.mount(new Element());
  for (let attempt = 0; attempt < 5; attempt++) await setup.tick();
  assert.equal(setup.timers.size, 0);
  setup.showDrawer();
  const folder = setup.showDrawer();
  assert.equal(setup.timers.size, 1);
  await setup.tick();
  assert.equal(setup.timers.size, 0);
  assert.equal(folder.collapsed, true);
  setup.plugin.onunload();
});

void test("settings changes and manual commands cancel restore and toolbar hiding clears the class", async () => {
  for (const cancel of ["toolbar", "startup", "command"]) {
    const setup = fixture();
    const host = new Element();
    await setup.plugin.onload();
    setup.mount(host, {});
    if (cancel === "toolbar") await setup.set({ showToolbar: false });
    else if (cancel === "startup") await setup.set({ restoreOnStartup: false });
    else {
      setup.runCommand();
      await setImmediate();
    }
    assert.equal(setup.timers.size, 0);
    const replacement = new Element();
    setup.mount(replacement, {});
    setup.showDrawer();
    assert.equal(setup.timers.size, 0);
    if (cancel === "toolbar") {
      assert(!host.classList.has(hostClass));
      assert(!replacement.classList.has(hostClass));
      assert.equal(host.children.size, 0);
    }
    setup.plugin.onunload();
  }
});
