/**
 * Unit tests for the VS Code default-application detector. Only the pure pattern
 * matcher is exercised here; the platform probes spawn OS processes and are out
 * of scope for the host-free test runner.
 */
import "./vscodeMock.js"; // Must come first: stubs "vscode" before imports load.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { commandLooksLikeVSCode } from "../defaultApp.js";

describe("commandLooksLikeVSCode", () => {
  test("matches stable VS Code install commands and ProgIds", () => {
    assert.equal(
      commandLooksLikeVSCode(
        '"C:\\Program Files\\Microsoft VS Code\\Code.exe" "%1"',
      ),
      true,
    );
    assert.equal(commandLooksLikeVSCode("Applications\\Code.exe"), true);
    assert.equal(commandLooksLikeVSCode("/usr/bin/code"), true);
    assert.equal(commandLooksLikeVSCode("code.desktop"), true);
  });

  test("matches Insiders and VSCodium builds", () => {
    assert.equal(
      commandLooksLikeVSCode(
        '"C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe" "%1"',
      ),
      true,
    );
    assert.equal(commandLooksLikeVSCode("/opt/vscodium/bin/vscodium"), true);
    assert.equal(commandLooksLikeVSCode("vscodium.desktop"), true);
  });

  test("does not match unrelated default applications", () => {
    assert.equal(
      commandLooksLikeVSCode('"C:\\Program Files\\Adobe\\Acrobat\\Acrobat.exe" "%1"'),
      false,
    );
    assert.equal(commandLooksLikeVSCode("/usr/bin/xdg-open"), false);
    assert.equal(commandLooksLikeVSCode("org.gnome.gedit.desktop"), false);
    assert.equal(commandLooksLikeVSCode("notepad"), false);
  });

  test("does not match a path that merely contains the word code", () => {
    assert.equal(commandLooksLikeVSCode("C:\\projects\\barcode\\reader.exe"), false);
    assert.equal(commandLooksLikeVSCode("/home/me/encoder/run"), false);
  });

  test("handles empty and missing input", () => {
    assert.equal(commandLooksLikeVSCode(""), false);
    assert.equal(commandLooksLikeVSCode(undefined), false);
    assert.equal(commandLooksLikeVSCode(null), false);
  });
});
