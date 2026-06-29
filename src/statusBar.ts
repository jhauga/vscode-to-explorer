/**
 * Status bar item that surfaces the "Open All Files Externally" state.
 *
 * It is conditional: visible only while the setting is on, hidden otherwise.
 * Clicking it runs the toggle command (turning the setting off), which in turn
 * hides the item. The item reacts to configuration changes so it stays in sync
 * whether the setting is flipped from the command, the settings UI, or the
 * configuration view.
 *
 * Note: the status bar can only render built-in codicons, not custom SVG files,
 * so a codicon that reads as "open externally" stands in for the bundled
 * `resources/vscode-to-explorer_on.svg` artwork.
 */
import * as vscode from "vscode";
import { CONFIG_SECTION, getConfig } from "./config.js";

/** Register the conditional "open all externally" status bar item. */
export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = "$(link-external) Open Externally";
  item.tooltip = "Files opened with OS default app.";
  item.command = "vscode-to-explorer.toggleOpenAllFilesExternally";

  /** Show the item only while the setting is on; hide it otherwise. */
  const sync = (): void => {
    if (getConfig().openAllFilesExternally) {
      item.show();
    } else {
      item.hide();
    }
  };

  sync();

  context.subscriptions.push(
    item,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.openAllFilesExternally`)) {
        sync();
      }
    }),
  );
}
