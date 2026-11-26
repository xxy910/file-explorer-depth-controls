import { planFolds, shouldCollapse } from "./depth.ts";
import type { Depth } from "./depth.ts";

interface FileExplorerView {
  containerEl?: HTMLElement;
  fileItems?: unknown;
  tree?: { infinityScroll?: { compute?: () => void }; requestSaveFolds?: () => void };
}

interface NativeItem {
  file?: unknown;
  collapsed?: unknown;
  setCollapsed?: unknown;
}

interface FolderItem {
  collapsed: boolean;
  setCollapsed(collapsed: boolean, recursive: boolean): unknown;
}

type FolderPath = (file: unknown) => string | undefined;
type Problem = "not-ready" | "unsupported" | "mismatch";

export class ExplorerError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem);
    this.problem = problem;
  }
}

export function toolbarAnchor(view: FileExplorerView): HTMLElement | null {
  const container = view.containerEl;
  return container?.querySelector<HTMLElement>(".nav-files-container")
    ?? container?.querySelector<HTMLElement>(".nav-header")
    ?? null;
}

export function folderItems(view: FileExplorerView, folderPath: FolderPath, hasFolders: boolean) {
  const source = view.fileItems;
  if (source == null) throw new ExplorerError("not-ready");
  if (typeof source !== "object" || Array.isArray(source)) throw new ExplorerError("unsupported");
  const items: unknown[] = source instanceof Map ? Array.from(source.values()) : Object.values(source);
  const folders = new Map<string, FolderItem>();
  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as NativeItem;
    const path = folderPath(item.file);
    if (!path || path === "/") continue;
    if (typeof item.collapsed !== "boolean" || typeof item.setCollapsed !== "function") {
      throw new ExplorerError("unsupported");
    }
    const folder = item as FolderItem;
    folders.set(path, folder);
  }
  if (hasFolders && folders.size === 0) throw new ExplorerError("not-ready");
  return folders;
}

export async function applyFolds(
  view: FileExplorerView,
  readFolders: () => Map<string, FolderItem>,
  folders: ReadonlyMap<string, FolderItem>,
  depth: Depth,
  ancestors: ReadonlySet<string>,
  isCurrent: () => boolean,
): Promise<void> {
  for (const action of planFolds([...folders.keys()], depth, ancestors)) {
    if (!isCurrent()) return;
    const item = folders.get(action.path);
    if (item && item.collapsed !== action.collapsed) await item.setCollapsed(action.collapsed, false);
  }
  if (!isCurrent()) return;
  view.tree?.infinityScroll?.compute?.();
  view.tree?.requestSaveFolds?.();
  for (const [path, item] of readFolders()) {
    if (item.collapsed !== shouldCollapse(path, depth, ancestors)) throw new ExplorerError("mismatch");
  }
}
