import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import { buildSync } from "esbuild";
import type { Command } from "obsidian";
import type { UpdateSettings } from "../src/settings.ts";

const toolbarClass = "file-explorer-depth-controls";
const layoutClass = "file-explorer-depth-controls-layout";
const bundle = buildSync({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  write: false,
}).outputFiles[0].text;

class Element {
  isConnected = true;
  readonly children: Element[] = [];
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
    toggle() {},
  };
  parentElement?: Element;
  listenerSignal?: AbortSignal;

  constructor(name?: string) {
    if (name) this.classList.add(name);
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children;
    return siblings?.[siblings.indexOf(this) + 1];
  }

  append(child: Element) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }

  before(element: Element) {
    const parent = this.parentElement;
    assert(parent);
    element.remove();
    element.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this), 0, element);
  }

  querySelector(selector: string): Element | undefined {
    const name = selector.slice(1);
    for (const child of this.children) {
      if (child.classList.contains(name)) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
  }

  createEl(_tag: string, options: { cls: string }) {
    const child = new Element(options.cls);
    this.append(child);
    return child;
  }

  addEventListener(_type: string, _callback: () => void, options: { signal: AbortSignal }) {
    this.listenerSignal = options.signal;
  }

  setAttribute() {}
  remove() {
    const siblings = this.parentElement?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = undefined;
  }
}

function explorer(hasFileList = true) {
  const container = new Element();
  const header = new Element("nav-header");
  const nativeButtons = new Element("nav-buttons-container");
  const list = new Element("nav-files-container");
  for (let index = 0; index < 5; index++) nativeButtons.append(new Element("nav-action-button"));
  header.append(nativeButtons);
  container.append(header);
  if (hasFileList) container.append(list);
  return { container, header, nativeButtons, list };
}

function fixture(settings = {}) {
  const timers = new Map<number, () => void>();
  const events = new Map<string, () => void>();
  const commands = new Map<string, Command>();
  const observed = new Set<Element>();
  let changeSettings: UpdateSettings | undefined;
  let visible: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  let timerId = 0;
  let view: { containerEl: Element; fileItems?: object } | undefined;
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
    loadData() { return { depth: 1, ...settings }; }
    addSettingTab(tab: { onChange: UpdateSettings }) { changeSettings = tab.onChange; }
    addCommand(command: Command) { commands.set(command.id, command); }
    registerEvent() {}
    saveData() {}
  }
  class IntersectionObserver {
    constructor(callback: typeof visible) { visible = callback; }
    observe(element: Element) { observed.add(element); }
    unobserve(element: Element) { observed.delete(element); }
    disconnect() {
      observed.clear();
      visible = undefined;
    }
  }
  const exports = {} as { default: new () => { onload(): Promise<void>; onunload(): void } };
  const module = { exports };
  const clock = {
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const loadBundle = compileFunction(bundle, ["require", "module", "window", "IntersectionObserver", "createDiv"]) as (
    requireModule: () => object,
    result: typeof module,
    window: typeof clock,
    observer: typeof IntersectionObserver,
    createDiv: (options: { cls: string }) => Element,
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
    options => new Element(options.cls),
  );
  const sync = () => events.get("layout-change")?.();
  return {
    plugin: new module.exports.default(),
    observed,
    sync,
    mount(element: Element, fileItems?: object) {
      view = { containerEl: element, fileItems };
      sync();
    },
    close() {
      view = undefined;
      sync();
    },
    showDrawer() {
      assert(view);
      const folder = {
        file: new TFolder(),
        collapsed: false,
        setCollapsed(collapsed: boolean) { this.collapsed = collapsed; },
      };
      view.fileItems = { example: folder };
      if (observed.size) visible?.([{ isIntersecting: true }]);
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

void test("a late explorer mount wakes restore once and observes the file list across view changes", async () => {
  const setup = fixture();
  await setup.plugin.onload();
  for (let attempt = 0; attempt < 5; attempt++) await setup.tick();
  assert.equal(setup.timers.size, 0);

  const original = explorer();
  setup.mount(original.container, {});
  assert(original.container.classList.contains(layoutClass));
  assert.deepEqual([...setup.observed], [original.list]);
  assert.equal(setup.timers.size, 1);
  const replacement = explorer();
  setup.mount(replacement.container, {});
  assert(!original.container.classList.contains(layoutClass));
  assert.deepEqual(original.container.children, [original.header, original.list]);
  assert(replacement.container.classList.contains(layoutClass));
  assert.deepEqual([...setup.observed], [replacement.list]);
  assert.equal(setup.timers.size, 1);
  await setup.tick();
  assert.equal(setup.timers.size, 0);
  setup.plugin.onunload();
  assert(!replacement.container.classList.contains(layoutClass));
  assert.deepEqual(replacement.container.children, [replacement.header, replacement.list]);
  assert.equal(setup.observed.size, 0);
});

void test("showing an existing mobile drawer can wake restore after the timed attempts", async () => {
  for (const showToolbar of [true, false]) {
    const setup = fixture({ showToolbar });
    const view = explorer();
    await setup.plugin.onload();
    setup.mount(view.container);
    assert.deepEqual([...setup.observed], [view.list]);
    assert.equal(Boolean(view.container.querySelector(`.${toolbarClass}`)), showToolbar);
    for (let attempt = 0; attempt < 5; attempt++) await setup.tick();
    assert.equal(setup.timers.size, 0);
    setup.showDrawer();
    const folder = setup.showDrawer();
    assert.equal(setup.timers.size, 1);
    await setup.tick();
    assert.equal(setup.timers.size, 0);
    assert.equal(folder.collapsed, true);
    setup.plugin.onunload();
  }
});

void test("settings changes and manual commands cancel restore and toolbar hiding clears the class", async () => {
  for (const cancel of ["toolbar", "startup", "command"]) {
    const setup = fixture();
    const view = explorer();
    await setup.plugin.onload();
    setup.mount(view.container, {});
    if (cancel === "toolbar") await setup.set({ showToolbar: false });
    else if (cancel === "startup") await setup.set({ restoreOnStartup: false });
    else {
      setup.runCommand();
      await setImmediate();
    }
    assert.equal(setup.timers.size, 0);
    const replacement = explorer();
    setup.mount(replacement.container, {});
    setup.showDrawer();
    assert.equal(setup.timers.size, 0);
    if (cancel === "toolbar") {
      assert(!view.container.classList.contains(layoutClass));
      assert(!replacement.container.classList.contains(layoutClass));
      assert.deepEqual(view.container.children, [view.header, view.list]);
      assert.deepEqual(replacement.container.children, [replacement.header, replacement.list]);
    }
    setup.plugin.onunload();
  }
});

void test("mounts a single toolbar immediately before the list and cleans up on rebuild and close", async () => {
  const setup = fixture();
  const { container, header, nativeButtons, list } = explorer();
  const originalButtons = [...nativeButtons.children];
  await setup.plugin.onload();
  setup.mount(container);
  const toolbar = container.querySelector(`.${toolbarClass}`);
  assert(toolbar);
  assert.deepEqual(container.children, [header, toolbar, list]);
  assert.deepEqual(nativeButtons.children, originalButtons);
  assert.equal(list.children.length, 0);
  setup.sync();
  assert.deepEqual(container.children, [header, toolbar, list]);

  const signal = toolbar.children[0].listenerSignal;
  assert(signal);
  const replacement = new Element("nav-files-container");
  list.remove();
  container.append(replacement);
  setup.sync();
  const rebuilt = container.querySelector(`.${toolbarClass}`);
  assert(rebuilt && rebuilt !== toolbar);
  assert.deepEqual(container.children, [header, rebuilt, replacement]);
  assert.equal(signal.aborted, true);
  assert.deepEqual([...setup.observed], [replacement]);

  setup.close();
  assert.equal(rebuilt.children[0].listenerSignal?.aborted, true);
  assert(!container.classList.contains(layoutClass));
  assert.deepEqual(container.children, [header, replacement]);
  assert.deepEqual(nativeButtons.children, originalButtons);
  assert.equal(setup.observed.size, 0);
  setup.plugin.onunload();
});

void test("uses the header as a sibling fallback and moves to the file list when it appears", async () => {
  const setup = fixture();
  const { container, header, nativeButtons, list } = explorer(false);
  await setup.plugin.onload();
  setup.mount(new Element());
  assert.equal(setup.observed.size, 0);
  setup.mount(container);
  const fallback = container.querySelector(`.${toolbarClass}`);
  assert(fallback);
  assert.deepEqual(container.children, [fallback, header]);
  assert(!container.classList.contains(layoutClass));
  assert.deepEqual([...setup.observed], [header]);

  container.append(list);
  setup.sync();
  const toolbar = container.querySelector(`.${toolbarClass}`);
  assert(toolbar && toolbar !== fallback);
  assert.deepEqual(container.children, [header, toolbar, list]);
  assert(container.classList.contains(layoutClass));
  assert.equal(nativeButtons.children.length, 5);
  assert.deepEqual([...setup.observed], [list]);
  setup.plugin.onunload();
});

void test("phone styles keep the controls and list in DOM order above the native header", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.nav-buttons-container|file-explorer-depth-controls-host/);
  assert.match(css, /\.file-explorer-depth-controls\s*\{[^}]*flex-shrink:\s*0;/);
  assert.match(css, /\.file-explorer-depth-controls\s*\{[^}]*border-bottom:[^}]*var\(--background-modifier-border\)/);
  assert.match(css, /\.is-phone \.file-explorer-depth-controls-layout\s*\{[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.is-phone \.file-explorer-depth-controls-layout > \.file-explorer-depth-controls,\s*\.is-phone \.file-explorer-depth-controls-layout > \.file-explorer-depth-controls \+ \.nav-files-container\s*\{[^}]*order:\s*0;/);
  assert.match(css, /\.is-phone \.file-explorer-depth-controls-layout > \.nav-header\s*\{[^}]*order:\s*1;/);
  assert.match(css, /\.is-phone \.file-explorer-depth-controls button\.file-explorer-depth-controls-button\s*\{[^}]*min-width:\s*36px;[^}]*min-height:\s*36px;/);
});
