import { isNumericDepth, limitDepth } from "./depth.ts";
import type { Depth, MaxDepth } from "./depth.ts";

export type LanguageMode = "auto" | "zh" | "en";

export function isLanguageMode(value: unknown): value is LanguageMode {
  return value === "auto" || value === "zh" || value === "en";
}

export interface DepthSettings {
  language: LanguageMode;
  depth: Depth;
  maxDepth: MaxDepth;
  restoreOnStartup: boolean;
  showExpandAllButton: boolean;
  keepActiveFileVisible: boolean;
  showToolbar: boolean;
  showNotices: boolean;
}

const DEFAULTS: DepthSettings = {
  language: "auto",
  depth: 3,
  maxDepth: 4,
  restoreOnStartup: true,
  showExpandAllButton: true,
  keepActiveFileVisible: true,
  showToolbar: true,
  showNotices: false,
};

export function readSettings(saved: unknown): DepthSettings {
  const data = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  const maxDepth = isNumericDepth(data.maxDepth) && data.maxDepth !== 1 ? data.maxDepth : DEFAULTS.maxDepth;
  const savedDepth = data.depth ?? data.level;
  const depth = savedDepth === "all" || isNumericDepth(savedDepth) ? savedDepth : DEFAULTS.depth;
  return {
    language: isLanguageMode(data.language) ? data.language : DEFAULTS.language,
    depth: limitDepth(depth, maxDepth),
    maxDepth,
    restoreOnStartup: typeof data.restoreOnStartup === "boolean" ? data.restoreOnStartup : DEFAULTS.restoreOnStartup,
    showExpandAllButton: typeof data.showExpandAllButton === "boolean" ? data.showExpandAllButton : DEFAULTS.showExpandAllButton,
    keepActiveFileVisible: typeof data.keepActiveFileVisible === "boolean" ? data.keepActiveFileVisible : DEFAULTS.keepActiveFileVisible,
    showToolbar: typeof data.showToolbar === "boolean" ? data.showToolbar : DEFAULTS.showToolbar,
    showNotices: typeof data.showNotices === "boolean" ? data.showNotices : DEFAULTS.showNotices,
  };
}
