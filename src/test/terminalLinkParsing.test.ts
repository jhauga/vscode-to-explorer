/**
 * Unit tests for the terminal link parsing helpers: URL detection, file path
 * candidates, and path resolution. These run in plain Node; the module under
 * test has no `vscode` dependency.
 */
import "./vscodeMock.js"; // Kept first for consistency with the other suites.

import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, test } from "node:test";
import {
  type LineSpan,
  findPathCandidates,
  findUrls,
  resolveCandidate,
} from "../terminalLinkParsing.js";

/** Expected span for `text` at its first occurrence in `line`. */
function spanOf(line: string, text: string): LineSpan {
  const start = line.indexOf(text);
  assert.notEqual(start, -1, `"${text}" not found in "${line}"`);
  return { start, length: text.length, text };
}

describe("findUrls", () => {
  test("finds a dev-server URL with its offset and length", () => {
    const line = "  Local:   http://localhost:3000/";
    assert.deepEqual(findUrls(line), [spanOf(line, "http://localhost:3000/")]);
  });

  test("finds a URL in the middle of a line", () => {
    const line = "Docs are at https://example.com/guide for details";
    assert.deepEqual(findUrls(line), [spanOf(line, "https://example.com/guide")]);
  });

  test("finds two URLs on one line", () => {
    const line = "https://example.com and http://example.org/a";
    assert.deepEqual(findUrls(line), [
      spanOf(line, "https://example.com"),
      spanOf(line, "http://example.org/a"),
    ]);
  });

  test("trims a closing parenthesis and trailing punctuation", () => {
    const paren = "(see https://example.com/docs).";
    assert.deepEqual(findUrls(paren), [spanOf(paren, "https://example.com/docs")]);
    const sentence = "Visit https://example.com.";
    assert.deepEqual(findUrls(sentence), [spanOf(sentence, "https://example.com")]);
  });

  test("returns an empty list when there is no URL", () => {
    assert.deepEqual(findUrls("Compiled successfully in 572ms"), []);
  });

  test("is safe to call repeatedly (no shared regex state)", () => {
    const line = "open https://example.com now";
    assert.deepEqual(findUrls(line), findUrls(line));
  });
});

describe("findPathCandidates", () => {
  test("finds a Windows absolute path", () => {
    const line = "Saved C:\\Users\\demo-user\\Documents\\report.docx";
    assert.deepEqual(findPathCandidates(line), [
      spanOf(line, "C:\\Users\\demo-user\\Documents\\report.docx"),
    ]);
  });

  test("finds a quoted path that contains spaces", () => {
    const line = 'Wrote "C:\\Users\\demo-user\\My Documents\\report.docx" (12 KB)';
    assert.deepEqual(findPathCandidates(line), [
      spanOf(line, "C:\\Users\\demo-user\\My Documents\\report.docx"),
    ]);
  });

  test("an apostrophe earlier in the line does not hide a quoted path", () => {
    const line = "it's in 'My Docs/report.docx' now";
    assert.deepEqual(findPathCandidates(line), [spanOf(line, "My Docs/report.docx")]);
  });

  test("finds relative paths", () => {
    const line = "copied ./out/report.docx and ../assets/mockup.psd";
    assert.deepEqual(findPathCandidates(line), [
      spanOf(line, "./out/report.docx"),
      spanOf(line, "../assets/mockup.psd"),
    ]);
  });

  test("finds bare file names and POSIX absolute paths", () => {
    const line = "report.docx /home/demo-user/clip.mp4";
    assert.deepEqual(findPathCandidates(line), [
      spanOf(line, "report.docx"),
      spanOf(line, "/home/demo-user/clip.mp4"),
    ]);
  });

  test("strips :line:col and (line,col) location suffixes", () => {
    const colon = "error in src/app.ts:12:3";
    assert.deepEqual(findPathCandidates(colon), [spanOf(colon, "src/app.ts")]);
    const paren = "src\\app.ts(12,3): error TS2304";
    assert.deepEqual(findPathCandidates(paren), [spanOf(paren, "src\\app.ts")]);
  });

  test("strips trailing punctuation and wrapping brackets", () => {
    const line = "Open (report.docx).";
    assert.deepEqual(findPathCandidates(line), [spanOf(line, "report.docx")]);
  });

  test("drops a span that overlaps an excluded URL", () => {
    const line = "Local: http://localhost:3000/index.html";
    assert.deepEqual(findPathCandidates(line, findUrls(line)), []);
  });

  test("ignores URI schemes even without an exclude list", () => {
    assert.deepEqual(findPathCandidates("http://localhost:3000/index.html"), []);
    assert.deepEqual(findPathCandidates("file:///C:/demo/report.docx"), []);
  });

  test("ignores words without an extension and bare dotfiles", () => {
    assert.deepEqual(findPathCandidates("Makefile README done"), []);
    assert.deepEqual(findPathCandidates(".gitignore and config/.env"), []);
  });
});

describe("resolveCandidate", () => {
  test("returns absolute paths unchanged", () => {
    const win = "C:\\Users\\demo-user\\report.docx";
    assert.equal(resolveCandidate(win, "D:\\work", "C:\\Users\\demo-user", path.win32), win);
    const winSlash = "C:/Users/demo-user/report.docx";
    assert.equal(
      resolveCandidate(winSlash, "D:\\work", "C:\\Users\\demo-user", path.win32),
      winSlash,
    );
    const posix = "/home/demo-user/report.docx";
    assert.equal(resolveCandidate(posix, "/tmp", "/home/demo-user", path.posix), posix);
  });

  test("joins relative paths to the working directory", () => {
    assert.equal(
      resolveCandidate("./out/report.docx", "/home/demo-user/demo-app", "/home/demo-user", path.posix),
      "/home/demo-user/demo-app/out/report.docx",
    );
    assert.equal(
      resolveCandidate("out/report.docx", "C:\\work\\demo-app", "C:\\Users\\demo-user", path.win32),
      "C:\\work\\demo-app\\out\\report.docx",
    );
    assert.equal(
      resolveCandidate("../assets/mockup.psd", "/home/demo-user/demo-app", "/home/demo-user", path.posix),
      "/home/demo-user/assets/mockup.psd",
    );
  });

  test("returns undefined for a relative path when the working directory is unknown", () => {
    assert.equal(resolveCandidate("report.docx", undefined, "/home/demo-user", path.posix), undefined);
  });

  test("resolves ~/ against the home directory", () => {
    assert.equal(
      resolveCandidate("~/clip.mp4", undefined, "/home/demo-user", path.posix),
      "/home/demo-user/clip.mp4",
    );
  });

  test("returns undefined for empty text", () => {
    assert.equal(resolveCandidate("", "/tmp", "/home/demo-user", path.posix), undefined);
  });
});
