import { Notice, Platform, Plugin, TFolder } from "obsidian";
import type { Command, View } from "obsidian";
import { ancestorsOf, LEVELS, limitDepth, stepDepth } from "./depth.ts";
import type { Depth } from "./depth.ts";
import { applyFolds, ExplorerError, folderItems, toolbarAnchor } from "./explorer.ts";
import { getMessages } from "./i18n.ts";
import { readSettings } from "./settings-data.ts";
import type { DepthSettings } from "./settings-data.ts";
import { DepthSettingTab } from "./settings.ts";

const EXPLORER_TYPE = "file-explorer";
const LAYOUT_CLASS = "file-explorer-depth-controls-layout";
const RESTORE_DELAYS = [0, 100, 250, 500, 1000];

interface Toolbar {
  element: HTMLElement;
  parent: HTMLElement;
  anchor: HTMLElement;
  buttons: Map<Depth, HTMLButtonElement>;
  remove: () => void;
}

export default class FileExplorerDepthControls extends Plugin {
  private preferences = readSettings(undefined);
  private messages = getMessages(this.preferences.language);
  private settingTab?: DepthSettingTab;
  private toolbars = new Map<View, Toolbar>();
  private explorerHosts = new Map<View, HTMLElement>();
  private ready = false;
  private unloaded = false;
  private busy = false;
  private pending = 0;
  private queue = Promise.resolve();
  private startupPending = false;
  private restoreTimer?: number;
  private restoreInProgress = false;
  private restoreWakeRequested = false;
  private restoreObserver?: IntersectionObserver;

  async onload(): Promise<void> {
    this.preferences = readSettings(await this.loadData());
    if (this.unloaded) return;
    this.messages = getMessages(this.preferences.language);
    this.startupPending = this.preferences.restoreOnStartup;
    this.settingTab = new DepthSettingTab(this.app, this, () => this.messages, () => this.preferences,
      (patch, depth) => this.changeSettings(patch, depth));
    this.addSettingTab(this.settingTab);
    this.registerCommands();
    const workspace = this.app.workspace;
    this.registerEvent(workspace.on("layout-change", () => this.syncToolbars()));
    this.registerEvent(workspace.on("active-leaf-change", () => this.syncToolbars()));
    workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.ready = true;
      this.syncToolbars();
      this.scheduleRestore(0);
    });
  }

  onunload(): void {
    this.unloaded = true;
    this.cancelRestore();
    this.removeToolbars();
    this.explorerHosts.clear();
  }

  private registerCommands(refresh = false): void {
    const commands: Command[] = [
      ...LEVELS.map(level => ({
        id: `show-depth-${level}`,
        name: this.messages.showDepth(level),
        callback: () => this.requestDepth(level),
      })),
      { id: "expand-all", name: this.messages.expand, callback: () => this.requestDepth("all") },
      { id: "depth-deeper", name: this.messages.deeper, callback: () => this.requestStep("deeper") },
      { id: "depth-shallower", name: this.messages.shallower, callback: () => this.requestStep("shallower") },
    ];
    if (refresh) {
      if (typeof this.removeCommand !== "function") return;
      for (const command of commands) this.removeCommand(command.id);
    }
    for (const command of commands) this.addCommand(command);
  }

  private requestStep(direction: "deeper" | "shallower"): void {
    this.requestDepth(stepDepth(this.preferences.depth, this.preferences.maxDepth, direction));
  }

  private requestDepth(depth: Depth): void {
    this.cancelRestore();
    if (this.pending) return;
    void this.enqueue(async () => {
      if (!await this.applyDepth(depth, this.preferences.keepActiveFileVisible, () => !this.unloaded, true)) return;
      const currentMax = this.preferences.maxDepth;
      const maxDepth = depth !== "all" && depth !== 1 && depth > currentMax ? depth : currentMax;
      await this.commitSettings({ ...this.preferences, depth, maxDepth });
      if (this.preferences.showNotices) this.noticeSuccess(depth);
    });
  }

  private changeSettings(patch: Partial<DepthSettings>, depth?: Depth): Promise<void> {
    this.cancelRestore();
    return this.enqueue(async () => {
      const previousDepth = this.preferences.depth;
      const nextSettings = { ...this.preferences, ...patch };
      nextSettings.depth = limitDepth(depth ?? previousDepth, nextSettings.maxDepth);
      await this.commitSettings(nextSettings);
      if (this.unloaded) return;
      const depthChanged = depth !== undefined || previousDepth !== nextSettings.depth;
      if (!depthChanged && patch.keepActiveFileVisible === undefined) return;
      const applied = await this.applyDepth(nextSettings.depth, nextSettings.keepActiveFileVisible,
        () => !this.unloaded, depthChanged);
      if (applied && depthChanged && nextSettings.showNotices) this.noticeSuccess(nextSettings.depth);
    });
  }

  private enqueue(operation: () => Promise<void>, interactive = true): Promise<void> {
    if (interactive) this.pending++;
    this.updateButtons();
    this.queue = this.queue.then(async () => {
      this.busy = true;
      this.updateButtons();
      try {
        if (!this.unloaded) await operation();
      } catch {
        if (!this.unloaded) new Notice(this.messages.applyFailed);
      } finally {
        this.busy = false;
        if (interactive) this.pending--;
        this.updateButtons();
      }
    });
    return this.queue;
  }

  private async commitSettings(next: DepthSettings): Promise<void> {
    if (this.unloaded) return;
    const previous = this.preferences;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    this.preferences = next;
    const languageChanged = previous.language !== next.language;
    if (languageChanged) this.messages = getMessages(next.language);
    if (languageChanged || previous.maxDepth !== next.maxDepth || previous.showExpandAllButton !== next.showExpandAllButton) {
      this.removeToolbars();
    }
    this.syncToolbars();
    if (languageChanged) {
      this.settingTab?.refreshLanguage();
      this.registerCommands(true);
    } else if (previous.depth !== next.depth || previous.maxDepth !== next.maxDepth) {
      this.settingTab?.refresh();
    }
    try {
      await this.saveData(next);
    } catch {
      if (!this.unloaded) new Notice(this.messages.saveFailed);
    }
  }

  private scheduleRestore(attempt: number): void {
    if (!this.startupPending || this.unloaded || this.restoreTimer !== undefined || this.restoreInProgress) return;
    this.restoreTimer = window.setTimeout(() => {
      this.restoreTimer = undefined;
      this.restoreInProgress = true;
      void this.enqueue(async () => {
        const finalAttempt = attempt === RESTORE_DELAYS.length - 1;
        try {
          if (!this.startupPending) return;
          const { depth, keepActiveFileVisible } = this.preferences;
          const applied = await this.applyDepth(depth, keepActiveFileVisible,
            () => !this.unloaded && this.startupPending, false, finalAttempt);
          this.syncToolbars();
          if (applied) this.cancelRestore();
        } finally {
          this.restoreInProgress = false;
        }
        const wakeRequested = this.restoreWakeRequested;
        this.restoreWakeRequested = false;
        if (!finalAttempt) this.scheduleRestore(attempt + 1);
        else if (wakeRequested) this.scheduleRestore(0);
      }, false);
    }, RESTORE_DELAYS[attempt]);
  }

  private wakeRestore(): void {
    if (!this.startupPending) return;
    if (this.restoreInProgress) this.restoreWakeRequested = true;
    else this.scheduleRestore(0);
  }

  private cancelRestore(): void {
    this.startupPending = false;
    this.restoreWakeRequested = false;
    if (this.restoreTimer !== undefined) window.clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
    this.restoreObserver?.disconnect();
    this.restoreObserver = undefined;
  }

  private async applyDepth(
    depth: Depth,
    keepActiveFileVisible: boolean,
    isCurrent: () => boolean,
    warnIfClosed: boolean,
    warnIfFailed = true,
  ): Promise<boolean> {
    const leaves = this.app.workspace.getLeavesOfType(EXPLORER_TYPE);
    if (!leaves.length) {
      if (warnIfClosed) new Notice(this.messages.noExplorer);
      return false;
    }
    try {
      await Promise.all(leaves.filter(leaf => leaf.isDeferred).map(leaf => leaf.loadIfDeferred()));
      if (!isCurrent()) return false;
      const views = this.app.workspace.getLeavesOfType(EXPLORER_TYPE).filter(leaf => !leaf.isDeferred);
      if (views.length !== leaves.length) throw new ExplorerError("not-ready");
      const hasFolders = this.app.vault.getRoot().children.some(file => file instanceof TFolder);
      const getPath = (file: unknown) => file instanceof TFolder ? file.path : undefined;
      const targets = views.map(({ view }) => {
        const readFolders = () => folderItems(view, getPath, hasFolders);
        return { view, readFolders, folders: readFolders() };
      });
      const ancestors = ancestorsOf(keepActiveFileVisible && depth !== "all" ? this.app.workspace.getActiveFile()?.path : undefined);
      for (const { view, readFolders, folders } of targets) {
        await applyFolds(view, readFolders, folders, depth, ancestors, isCurrent);
      }
      return isCurrent();
    } catch (error) {
      if (isCurrent() && warnIfFailed) {
        const text = this.messages;
        const problems = { "not-ready": text.notReady, unsupported: text.unsupported, mismatch: text.mismatch };
        new Notice(error instanceof ExplorerError ? problems[error.problem] : text.applyFailed);
      }
      return false;
    }
  }

  private noticeSuccess(depth: Depth): void {
    if (!this.unloaded) new Notice(depth === "all" ? this.messages.expanded : this.messages.applied(depth));
  }

  private syncToolbars(): void {
    if (!this.ready || this.unloaded) return;
    const views = this.app.workspace.getLeavesOfType(EXPLORER_TYPE).filter(leaf => !leaf.isDeferred).map(leaf => leaf.view);
    const hosts = new Map<View, HTMLElement>();
    for (const view of views) {
      const anchor = toolbarAnchor(view);
      if (anchor?.isConnected && anchor.parentElement) hosts.set(view, anchor);
    }
    let mounted = this.syncExplorerHosts(hosts);
    if (!this.preferences.showToolbar) {
      this.removeToolbars();
      if (mounted) this.wakeRestore();
      return;
    }
    for (const [view, toolbar] of this.toolbars) {
      const anchor = hosts.get(view);
      if (anchor && toolbar.anchor === anchor && toolbar.parent === anchor.parentElement
        && toolbar.element.nextElementSibling === anchor) continue;
      toolbar.remove();
      this.toolbars.delete(view);
    }
    for (const [view, anchor] of hosts) {
      const parent = anchor.parentElement;
      if (this.toolbars.has(view) || !parent) continue;
      this.toolbars.set(view, this.createToolbar(parent, anchor));
      mounted = true;
    }
    if (mounted) this.wakeRestore();
    this.updateButtons();
  }

  private syncExplorerHosts(hosts: Map<View, HTMLElement>): boolean {
    if (this.startupPending && Platform.isMobile && typeof IntersectionObserver === "function") {
      this.restoreObserver ??= new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) this.wakeRestore();
      });
    }
    for (const [view, host] of this.explorerHosts) {
      if (hosts.get(view) !== host) this.restoreObserver?.unobserve(host);
    }
    let mounted = false;
    for (const [view, host] of hosts) {
      if (this.explorerHosts.get(view) === host) continue;
      this.restoreObserver?.observe(host);
      mounted = true;
    }
    this.explorerHosts = hosts;
    return mounted;
  }

  private createToolbar(parent: HTMLElement, anchor: HTMLElement): Toolbar {
    const element = createDiv({
      cls: "file-explorer-depth-controls",
      attr: { role: "group", "aria-label": this.messages.group },
    });
    anchor.before(element);
    const buttons = new Map<Depth, HTMLButtonElement>();
    const listeners = new AbortController();
    const levels: Depth[] = LEVELS.slice(0, this.preferences.maxDepth);
    if (this.preferences.showExpandAllButton) levels.push("all");
    for (const depth of levels) {
      const label = depth === "all" ? this.messages.expand : this.messages.showDepth(depth);
      const button = element.createEl("button", {
        cls: "file-explorer-depth-controls-button",
        text: depth === "all" ? this.messages.all : `L${depth}`,
        attr: { type: "button", "aria-label": label, title: label },
      });
      button.addEventListener("click", () => this.requestDepth(depth), { signal: listeners.signal });
      buttons.set(depth, button);
    }
    const hasFileList = anchor.classList.contains("nav-files-container");
    if (hasFileList) parent.classList.add(LAYOUT_CLASS);
    return {
      element,
      parent,
      anchor,
      buttons,
      remove: () => {
        listeners.abort();
        element.remove();
        if (hasFileList) parent.classList.remove(LAYOUT_CLASS);
      },
    };
  }

  private updateButtons(): void {
    for (const { buttons } of this.toolbars.values()) {
      for (const [depth, button] of buttons) {
        const active = depth === this.preferences.depth;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = this.busy || this.pending > 0;
      }
    }
  }

  private removeToolbars(): void {
    for (const toolbar of this.toolbars.values()) toolbar.remove();
    this.toolbars.clear();
  }
}
