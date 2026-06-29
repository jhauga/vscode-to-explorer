/**
 * Unit tests for the pure configuration predicates. These cover the routing
 * logic that decides whether a file opens externally or counts as a runnable
 * script, without needing the VS Code extension host.
 */
import "./vscodeMock.js"; // Must come first: stubs "vscode" before config loads.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Uri } from "vscode";
import {
  type ExtensionConfig,
  extensionOf,
  isScriptFile,
  normalizeExtensionList,
  shouldOpenExternally,
} from "../config.js";
import { DEFAULT_FILE_EXTENSIONS, DEFAULT_SCRIPT_EXTENSIONS } from "../defaults.js";

/** Build a config, defaulting every field and applying any overrides. */
function makeConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    openAllFilesExternally: false,
    fileExtensions: new Set(DEFAULT_FILE_EXTENSIONS),
    executeScriptEnabled: true,
    confirmBeforeExecute: true,
    scriptExtensions: new Set(DEFAULT_SCRIPT_EXTENSIONS),
    promptForScripts: false,
    pickApplicationWhenNoDefault: false,
    browserCommand: "chrome",
    browserUseLastProfile: false,
    browserOpenLinksInProfile: false,
    browserProfile: "",
    ...overrides,
  };
}

/** Minimal Uri-shaped object; the predicates only read scheme and fsPath. */
function fakeUri(fsPath: string, scheme = "file"): Uri {
  return { scheme, fsPath } as Uri;
}

describe("extensionOf", () => {
  test("lowercases and strips the leading dot", () => {
    assert.equal(extensionOf("C:\\art\\poster.PSD"), "psd");
    assert.equal(extensionOf("/home/me/clip.MP4"), "mp4");
  });

  test("returns an empty string when there is no extension", () => {
    assert.equal(extensionOf("C:\\bin\\Makefile"), "");
    assert.equal(extensionOf("README"), "");
  });
});

describe("shouldOpenExternally", () => {
  const config = makeConfig();

  test("is true for a default external extension", () => {
    assert.equal(shouldOpenExternally(fakeUri("C:\\art\\poster.psd"), config), true);
  });

  test("is false for a source file kept in the editor", () => {
    assert.equal(shouldOpenExternally(fakeUri("C:\\src\\extension.ts"), config), false);
  });

  test("is false for non-file schemes", () => {
    assert.equal(shouldOpenExternally(fakeUri("/x/poster.psd", "untitled"), config), false);
  });

  test("openAllFilesExternally opens any file, but not non-file schemes", () => {
    const all = makeConfig({ openAllFilesExternally: true });
    assert.equal(shouldOpenExternally(fakeUri("C:\\src\\extension.ts"), all), true);
    assert.equal(shouldOpenExternally(fakeUri("C:\\src\\extension.ts", "git"), all), false);
  });
});

describe("normalizeExtensionList", () => {
  test("strips dots, lowercases, and trims", () => {
    assert.deepEqual(normalizeExtensionList([".PSD", " Stl ", "OBJ"]), ["psd", "stl", "obj"]);
  });

  test("splits comma/space-separated groups into separate extensions", () => {
    assert.deepEqual(normalizeExtensionList(["stl, obj fbx"]), ["stl", "obj", "fbx"]);
  });

  test("drops blanks and removes duplicates, preserving first-seen order", () => {
    assert.deepEqual(normalizeExtensionList(["stl", "", "STL", "obj", ".stl"]), ["stl", "obj"]);
  });

  test("keeps valid multi-part tokens but rejects ones with separators", () => {
    assert.deepEqual(normalizeExtensionList(["x_t", "3ds", "blend1", "a/b", "c\\d"]), [
      "x_t",
      "3ds",
      "blend1",
    ]);
  });
});

describe("isScriptFile", () => {
  const config = makeConfig();

  test("recognizes a default script extension", () => {
    assert.equal(isScriptFile(fakeUri("C:\\tools\\deploy.ps1"), config), true);
    assert.equal(isScriptFile(fakeUri("/usr/local/run.sh"), config), true);
  });

  test("rejects non-script files and non-file schemes", () => {
    assert.equal(isScriptFile(fakeUri("C:\\notes\\todo.txt"), config), false);
    assert.equal(isScriptFile(fakeUri("C:\\tools\\deploy.ps1", "untitled"), config), false);
  });
});
