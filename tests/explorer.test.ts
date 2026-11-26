import assert from "node:assert/strict";
import { test } from "node:test";
import { ancestorsOf } from "../src/depth.ts";
import { applyFolds, ExplorerError, folderItems, toolbarAnchor } from "../src/explorer.ts";

const getPath = (file: unknown) => typeof file === "string" ? file : undefined;
const isCurrent = () => true;

function makeFolder(path: string, collapsed: boolean, operations: string[]) {
  return {
    file: path,
    collapsed,
    setCollapsed(next: boolean, recursive: boolean) {
      assert.equal(recursive, false);
      operations.push(`${next ? "close" : "open"} ${path}`);
      this.collapsed = next;
    },
  };
}

void test("applies native folds in order, verifies the active path, and updates the tree", async () => {
  const operations: string[] = [];
  const view = {
    fileItems: new Map([
      ["a/b", makeFolder("a/b", true, operations)],
      ["other", makeFolder("other", false, operations)],
      ["other/sub", makeFolder("other/sub", false, operations)],
      ["a", makeFolder("a", true, operations)],
    ]),
    tree: {
      infinityScroll: { compute: () => { operations.push("compute"); } },
      requestSaveFolds: () => { operations.push("save folds"); },
    },
  };
  const read = () => folderItems(view, getPath, true);
  await applyFolds(view, read, read(), 1, ancestorsOf("a/b/file.md"), isCurrent);
  assert.deepEqual(operations, ["close other/sub", "close other", "open a", "open a/b", "compute", "save folds"]);
});

void test("reads object items, skips root and files, and works without optional tree hooks", async () => {
  const operations: string[] = [];
  const view = { fileItems: { root: { file: "/" }, file: { file: 123 }, folder: makeFolder("a", true, operations) } };
  const read = () => folderItems(view, getPath, true);
  await applyFolds(view, read, read(), "all", new Set(), isCurrent);
  assert.deepEqual(operations, ["open a"]);
});

void test("reports missing and incompatible interfaces while permitting an empty vault", () => {
  const hasProblem = (problem: ExplorerError["problem"]) =>
    (error: unknown) => error instanceof ExplorerError && error.problem === problem;
  assert.throws(() => folderItems({}, getPath, true), hasProblem("not-ready"));
  assert.throws(() => folderItems({ fileItems: {} }, getPath, true), hasProblem("not-ready"));
  assert.throws(() => folderItems({ fileItems: [] }, getPath, false), hasProblem("unsupported"));
  assert.throws(() => folderItems({ fileItems: { a: { file: "a", collapsed: true } } }, getPath, true),
    hasProblem("unsupported"));
  assert.equal(folderItems({ fileItems: {} }, getPath, false).size, 0);
  assert.equal(toolbarAnchor({}), null);
});

void test("reports a mismatched native state after applying a fold", async () => {
  const view = { fileItems: { a: { file: "a", collapsed: true, setCollapsed: () => undefined } } };
  const read = () => folderItems(view, getPath, true);
  await assert.rejects(applyFolds(view, read, read(), "all", new Set(), isCurrent),
    (error: unknown) => error instanceof ExplorerError && error.problem === "mismatch");
});

void test("stops an in-flight restore after the current native fold settles", async () => {
  let current = true;
  const operations: string[] = [];
  const first = makeFolder("a", true, operations);
  const view = {
    fileItems: {
      first: {
        ...first,
        async setCollapsed(next: boolean, recursive: boolean) {
          await Promise.resolve();
          first.setCollapsed(next, recursive);
          current = false;
        },
      },
      second: makeFolder("a/b", true, operations),
    },
    tree: { requestSaveFolds: () => { operations.push("save folds"); } },
  };
  const read = () => folderItems(view, getPath, true);
  await applyFolds(view, read, read(), "all", new Set(), () => current);
  assert.deepEqual(operations, ["open a"]);
});
