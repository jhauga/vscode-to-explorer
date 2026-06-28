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
  /** Logical browser command used when opening URLs (e.g. "chrome"). */
  browserCommand: string;
  /** Browser profile selector ("", "Default", "Profile 2", "2", ...). */
  browserProfile: string;
}

/** Strip a leading dot and lowercase an extension token. */
function normalizeExt(value: string): string {
  return value.trim().replace(/^\.+/, "").toLowerCase();
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
    browserCommand: (cfg.get<string>("browser.command", "chrome") || "chrome").trim(),
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
