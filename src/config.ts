/**
 * Reads and normalizes the extension's configuration from the VS Code settings
 * store and exposes small predicates used by the rest of the extension.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { DEFAULT_FILE_EXTENSIONS, DEFAULT_SCRIPT_EXTENSIONS } from "./defaults.js";

/** Configuration section root used by every setting this extension owns. */
export const CONFIG_SECTION = "vscode-to-explorer";

/** Resolved, normalized view of the extension settings. */
export interface ExtensionConfig {
  /** Open every double-clicked file in its OS default application. */
  openAllFilesExternally: boolean;
  /** Extensions (no dot, lowercase) opened externally when not opening all. */
  fileExtensions: Set<string>;
  /** Whether the "Execute Script" command is offered and enabled. */
  executeScriptEnabled: boolean;
  /** Show a confirmation dialog before running a script. */
  confirmBeforeExecute: boolean;
  /** Script extensions (no dot, lowercase) the execute command accepts. */
  scriptExtensions: Set<string>;
  /**
   * When opening files externally, prompt to Execute / Open in VS Code / Cancel
   * for a double-clicked script instead of letting the OS run it. When off,
   * scripts stay in the editor.
   */
  promptForScripts: boolean;
  /**
   * When opening a file externally whose extension has no OS default
   * application, show an "open with" picker. When off, the file stays in the
   * editor as usual.
   */
  pickApplicationWhenNoDefault: boolean;
  /** Logical browser command used when opening URLs (e.g. "chrome"). */
  browserCommand: string;
  /** Open URLs in the browser's last-used profile, ignoring browserProfile. */
  browserUseLastProfile: boolean;
  /** Route clicked http(s) links through the configured browser/profile. */
  browserOpenLinksInProfile: boolean;
  /** Browser profile selector ("", "Default", "Profile 2", "2", ...). */
  browserProfile: string;
}

/** Strip a leading dot and lowercase an extension token. */
function normalizeExt(value: string): string {
  return value.trim().replace(/^\.+/, "").toLowerCase();
}

/** A normalized extension is alphanumeric-led and free of spaces or separators. */
const VALID_EXT = /^[a-z0-9][a-z0-9._+-]*$/;

/**
 * Normalize a list of extension tokens for storage: each entry may itself be a
 * comma/whitespace-separated group, so the input "stl, obj fbx" yields three
 * extensions. Dots are stripped, values lowercased, blanks and malformed tokens
 * dropped, and duplicates removed while preserving first-seen order.
 */
export function normalizeExtensionList(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const token of String(value).split(/[\s,]+/)) {
      const ext = normalizeExt(token);
      if (ext && VALID_EXT.test(ext) && !seen.has(ext)) {
        seen.add(ext);
        out.push(ext);
      }
    }
  }
  return out;
}

function toExtSet(values: readonly string[] | undefined, fallback: string[]): Set<string> {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  const set = new Set<string>();
  for (const entry of source) {
    const ext = normalizeExt(entry);
    if (ext) set.add(ext);
  }
  return set;
}

/** Read the current configuration for an optional resource scope. */
export function getConfig(scope?: vscode.Uri): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  return {
    openAllFilesExternally: cfg.get<boolean>("openAllFilesExternally", false),
    fileExtensions: toExtSet(cfg.get<string[]>("fileExtensions"), DEFAULT_FILE_EXTENSIONS),
    executeScriptEnabled: cfg.get<boolean>("executeScript.enabled", true),
    confirmBeforeExecute: cfg.get<boolean>("executeScript.confirmBeforeExecute", true),
    scriptExtensions: toExtSet(cfg.get<string[]>("scriptExtensions"), DEFAULT_SCRIPT_EXTENSIONS),
    promptForScripts: cfg.get<boolean>("openExternally.promptForScripts", false),
    pickApplicationWhenNoDefault: cfg.get<boolean>(
      "openExternally.pickApplicationWhenNoDefault",
      false,
    ),
    browserCommand: (cfg.get<string>("browser.command", "chrome") || "chrome").trim(),
    browserUseLastProfile: cfg.get<boolean>("browser.useLastProfile", false),
    browserOpenLinksInProfile: cfg.get<boolean>("browser.openLinksInProfile", false),
    browserProfile: cfg.get<string>("browser.profile", "").trim(),
  };
}

/** Lowercase extension of a path without the leading dot ("" when none). */
export function extensionOf(fsPath: string): string {
  return path.extname(fsPath).replace(/^\./, "").toLowerCase();
}

/** Whether a file URI should be opened in its OS default application. */
export function shouldOpenExternally(uri: vscode.Uri, config: ExtensionConfig): boolean {
  if (uri.scheme !== "file") return false;
  if (config.openAllFilesExternally) return true;
  const ext = extensionOf(uri.fsPath);
  return ext !== "" && config.fileExtensions.has(ext);
}

/** Whether a file URI is a runnable script the execute command accepts. */
export function isScriptFile(uri: vscode.Uri, config: ExtensionConfig): boolean {
  if (uri.scheme !== "file") return false;
  const ext = extensionOf(uri.fsPath);
  return ext !== "" && config.scriptExtensions.has(ext);
}
