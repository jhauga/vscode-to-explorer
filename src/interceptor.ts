/**
 * Watches for newly opened editor tabs and, when a tab points at a file that
 * should open in its OS default application, launches it externally and closes
 * the tab. This is what makes a double-click in the Explorer open design,
 * media, document, and CAD files outside of VS Code while leaving code in the
 * editor.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { getConfig, shouldOpenExternally } from "./config.js";
import { firstError, openExternally } from "./toExplorer.js";

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

  const handleTab = async (tab: vscode.Tab): Promise<void> => {
    const uri = tabUri(tab);
    if (!uri || uri.scheme !== "file") return;

    const config = getConfig(uri);
    if (!shouldOpenExternally(uri, config)) return;

    const key = uri.toString();
    if (inFlight.has(key)) return;
    inFlight.add(key);
    try {
      const result = await openExternally(uri.fsPath);
      if (result.ok) {
        await vscode.window.tabGroups.close(tab);
        vscode.window.setStatusBarMessage(
          `Opened ${path.basename(uri.fsPath)} in its default application`,
          3000,
        );
      } else {
        const detail = firstError(result) ?? "the file has no default application";
        void vscode.window.showWarningMessage(
          `Could not open ${path.basename(uri.fsPath)} externally: ${detail}`,
        );
      }
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
