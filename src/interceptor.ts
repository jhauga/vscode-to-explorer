/**
 * Watches for newly opened editor tabs and, when a tab points at a file that
 * should open in its OS default application, launches it externally and closes
 * the tab. This is what makes a double-click in the Explorer open design,
 * media, document, and CAD files outside of VS Code while leaving code in the
 * editor.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { extensionOf, getConfig, isScriptFile, shouldOpenExternally } from "./config.js";
import { defaultAppIsVSCode } from "./defaultApp.js";
import { runScriptAndReport } from "./execute.js";
import {
  firstError,
  hasDefaultApp,
  openExternally,
  openExternallyWithPicker,
  type ToExplorerResult,
  wasSkipped,
} from "./toExplorer.js";

/**
 * Window during which a freshly externalized file is ignored if its tab reopens.
 * If the OS default handler is VS Code, opening externally bounces the file back
 * into a new tab; this cooldown breaks that loop even when default-app detection
 * cannot tell (e.g. on macOS).
 */
const REOPEN_COOLDOWN_MS = 2500;

/** Extract the underlying resource URI from a tab, if it has one. */
function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) return input.uri;
  if (input instanceof vscode.TabInputCustom) return input.uri;
  if (input instanceof vscode.TabInputNotebook) return input.uri;
  return undefined;
}

/** Register the tab interception listener. */
export function registerInterceptor(context: vscode.ExtensionContext): void {
  const inFlight = new Set<string>();
  const recentlyExternalized = new Map<string, number>();

  /** Record that a file was just sent out, pruning expired loop-guard entries. */
  const markExternalized = (key: string): void => {
    const now = Date.now();
    for (const [k, t] of recentlyExternalized) {
      if (now - t >= REOPEN_COOLDOWN_MS) recentlyExternalized.delete(k);
    }
    recentlyExternalized.set(key, now);
  };

  /** Run an open routine and, on a real open, close the tab; otherwise leave it. */
  const openAndClose = async (
    tab: vscode.Tab,
    uri: vscode.Uri,
    open: () => Promise<ToExplorerResult>,
  ): Promise<void> => {
    const result = await open();
    if (result.ok && !wasSkipped(result)) {
      markExternalized(uri.toString());
      await vscode.window.tabGroups.close(tab);
      vscode.window.setStatusBarMessage(
        `Opened ${path.basename(uri.fsPath)} in its default application`,
        3000,
      );
    } else if (!result.ok) {
      const detail = firstError(result) ?? "the file has no default application";
      void vscode.window.showWarningMessage(
        `Could not open ${path.basename(uri.fsPath)} externally: ${detail}`,
      );
    }
    // A skipped run (e.g. the picker was cancelled) leaves the tab untouched.
  };

  /** Decide what to do with a double-clicked script under "open externally". */
  const handleScript = async (tab: vscode.Tab, uri: vscode.Uri): Promise<void> => {
    const config = getConfig(uri);
    // Default: never let the OS run the script - keep it in the editor.
    if (!config.promptForScripts || !config.executeScriptEnabled) return;

    const name = path.basename(uri.fsPath);
    const choice = await vscode.window.showWarningMessage(
      `${name} is a script. Run it on your machine, or open it in the editor?`,
      { modal: true },
      "Execute",
      "Open in VS Code",
    );
    if (choice === "Execute") {
      await runScriptAndReport(uri);
      await vscode.window.tabGroups.close(tab);
    }
    // "Open in VS Code" or Cancel/dismiss: leave the tab open.
  };

  const handleTab = async (tab: vscode.Tab): Promise<void> => {
    const uri = tabUri(tab);
    if (!uri || uri.scheme !== "file") return;

    const config = getConfig(uri);
    if (!shouldOpenExternally(uri, config)) return;

    const key = uri.toString();
    if (inFlight.has(key)) return;

    // Loop guard: if this file was just sent to its default app and the tab is
    // reopening, the default handler is VS Code itself. Leave it in the editor.
    const openedAt = recentlyExternalized.get(key);
    if (openedAt !== undefined && Date.now() - openedAt < REOPEN_COOLDOWN_MS) {
      recentlyExternalized.delete(key);
      return;
    }

    inFlight.add(key);
    try {
      // Scripts are handled first so they are never silently executed by the OS.
      if (isScriptFile(uri, config)) {
        await handleScript(tab, uri);
        return;
      }

      // Files without an extension have no reliable OS default application. On
      // Windows, handing one to the shell pops the "open with" picker, which
      // reopens the tab and loops the picker without ever opening the file.
      // Always leave extension-less files in the editor (open in VS Code as
      // normal), even when "Open All Files Externally" is on.
      const ext = extensionOf(uri.fsPath);
      if (ext === "") return;

      // If the OS would open this file in VS Code anyway, opening it externally
      // would just bounce it back into a new tab. Leave it in the editor.
      if (await defaultAppIsVSCode(uri.fsPath)) return;

      // Files whose extension has no default application: leave them in the
      // editor by default, or show an "open with" picker when opted in.
      if (!(await hasDefaultApp(uri.fsPath))) {
        if (!config.pickApplicationWhenNoDefault) return;
        await openAndClose(tab, uri, () => openExternallyWithPicker(uri.fsPath));
        return;
      }

      await openAndClose(tab, uri, () => openExternally(uri.fsPath));
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Failed to open ${path.basename(uri.fsPath)} externally: ${(err as Error).message}`,
      );
    } finally {
      inFlight.delete(key);
    }
  };

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of event.opened) {
        void handleTab(tab);
      }
    }),
  );
}
