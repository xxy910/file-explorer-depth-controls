export const LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type NumericDepth = (typeof LEVELS)[number];
export type Depth = NumericDepth | "all";
export type MaxDepth = Exclude<NumericDepth, 1>;

export function isNumericDepth(value: unknown): value is NumericDepth {
  return LEVELS.some(level => level === value);
}

export function limitDepth(depth: Depth, maxDepth: MaxDepth): Depth {
  return depth !== "all" && depth > maxDepth ? maxDepth : depth;
}

export function stepDepth(depth: Depth, maxDepth: MaxDepth, direction: "deeper" | "shallower"): Depth {
  if (depth === "all") return direction === "deeper" ? "all" : maxDepth;
  if (direction === "deeper" && depth >= maxDepth) return "all";
  const next = LEVELS[depth - 1 + (direction === "deeper" ? 1 : -1)];
  return next ?? 1;
}

export function folderDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

export function ancestorsOf(filePath: string | undefined): Set<string> {
  const segments = filePath?.split("/").filter(Boolean) ?? [];
  segments.pop();
  const ancestors = new Set<string>();
  let path = "";
  for (const segment of segments) {
    path = path ? `${path}/${segment}` : segment;
    ancestors.add(path);
  }
  return ancestors;
}

export function shouldCollapse(path: string, depth: Depth, ancestors: ReadonlySet<string>): boolean {
  return depth !== "all" && folderDepth(path) >= depth && !ancestors.has(path);
}

export function planFolds(paths: readonly string[], depth: Depth, ancestors: ReadonlySet<string>) {
  return paths.map(path => ({
    path,
    depth: folderDepth(path),
    collapsed: shouldCollapse(path, depth, ancestors),
  })).sort((first, second) => {
    if (first.collapsed !== second.collapsed) return first.collapsed ? -1 : 1;
    return first.collapsed ? second.depth - first.depth : first.depth - second.depth;
  });
}
