import assert from "node:assert/strict";
import { test } from "node:test";
import { ancestorsOf, folderDepth, limitDepth, planFolds, shouldCollapse, stepDepth } from "../src/depth.ts";
import { readSettings } from "../src/settings-data.ts";

void test("counts vault-relative folder depth including Unicode names", () => {
  assert.equal(folderDepth("/"), 0);
  assert.equal(folderDepth("档案"), 1);
  assert.equal(folderDepth("档案/项目/笔记"), 3);
});

void test("folds at or beyond the selected depth", () => {
  const ancestors = ancestorsOf(undefined);
  assert.equal(shouldCollapse("a", 1, ancestors), true);
  assert.equal(shouldCollapse("a", 2, ancestors), false);
  assert.equal(shouldCollapse("a/b", 2, ancestors), true);
});

void test("closes from deepest to shallowest before opening shallowest first", () => {
  const paths = ["a/b/c/d", "a", "b/c/d", "a/b", "b", "a/b/c"];
  assert.deepEqual(planFolds(paths, 3, new Set()).map(({ path, collapsed }) => [path, collapsed]), [
    ["a/b/c/d", true], ["b/c/d", true], ["a/b/c", true],
    ["a", false], ["b", false], ["a/b", false],
  ]);
});

void test("keeps exactly the active file ancestors expanded", () => {
  const ancestors = ancestorsOf("a/b/note.md");
  assert.deepEqual([...ancestors], ["a", "a/b"]);
  assert.deepEqual([...ancestorsOf("note.md")], []);
  assert.equal(shouldCollapse("a/b", 1, ancestors), false);
  assert.equal(shouldCollapse("a/b/child", 1, ancestors), true);
  assert.equal(shouldCollapse("a/b-other", 1, ancestors), true);
});

void test("all mode only opens folders and opens parents first", () => {
  const actions = planFolds(["a/b", "a"], "all", new Set());
  assert.deepEqual(actions.map(({ path, collapsed }) => [path, collapsed]), [["a", false], ["a/b", false]]);
});

void test("changing the maximum clamps numeric depth and preserves all mode", () => {
  assert.equal(limitDepth(6, 2), 2);
  assert.equal(limitDepth(3, 6), 3);
  assert.equal(limitDepth("all", 2), "all");
  assert.equal(readSettings({ depth: 6, maxDepth: 3 }).depth, 3);
});

void test("step commands traverse numbered levels and all mode with stable endpoints", () => {
  assert.equal(stepDepth(1, 4, "shallower"), 1);
  assert.equal(stepDepth(1, 4, "deeper"), 2);
  assert.equal(stepDepth(4, 4, "shallower"), 3);
  assert.equal(stepDepth(4, 4, "deeper"), "all");
  assert.equal(stepDepth("all", 4, "deeper"), "all");
  assert.equal(stepDepth("all", 4, "shallower"), 4);
  assert.equal(stepDepth(6, 6, "deeper"), "all");
  assert.equal(stepDepth("all", 2, "shallower"), 2);
});

void test("reads defaults, legacy depth, and invalid saved settings", () => {
  assert.deepEqual(readSettings(undefined), {
    language: "auto", depth: 3, maxDepth: 4, restoreOnStartup: true, showExpandAllButton: true,
    keepActiveFileVisible: true, showToolbar: true, showNotices: false,
  });
  assert.equal(readSettings({ level: 2, restoreOnStartup: false }).depth, 2);
  assert.equal(readSettings({ level: 2, restoreOnStartup: false }).restoreOnStartup, false);
  assert.equal(readSettings({ depth: "3", maxDepth: 10 }).depth, 3);
  assert.equal(readSettings({ depth: "all", maxDepth: 2, showToolbar: false }).showToolbar, false);
});
