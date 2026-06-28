/**
 * Extension entry point. Wires together the tab interceptor and the commands
 * for opening files externally, executing scripts, opening URLs in a browser
 * profile, and toggling the open-everything-externally setting.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { CONFIG_SECTION, getConfig } from "./config.js";
import { registerInterceptor } from "./interceptor.js";
import { registerExecuteScript } from "./execute.js";
import { registerLinkOpener } from "./links.js";
import { firstError, openExternally } from "./toExplorer.js";

async function openExternallyCommand(arg?: unknown): Promise<void> {
  const uri =
    arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file") {
    void vscode.window.showWarningMessage("Select a file to open in its default application.");
    return;
  }

  try {
    const result = await openExternally(uri.fsPath);
    if (!result.ok) {
      const detail = firstError(result) ?? "the file has no default application";
      void vscode.window.showWarningMessage(
        `Could not open ${path.basename(uri.fsPath)} externally: ${detail}`,
      );
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to open ${path.basename(uri.fsPath)} externally: ${(err as Error).message}`,
    );
  }
}

async function toggleOpenAllFilesExternally(): Promise<void> {
  const config = getConfig();
  const next = !config.openAllFilesExternally;
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update("openAllFilesExternally", next, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(
    next
      ? "Opening all files in their default application"
      : "Opening only configured file types externally",
    3000,
  );
}

export function activate(context: vscode.ExtensionContext): void {
  registerInterceptor(context);
  registerExecuteScript(context);
  registerLinkOpener(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-to-explorer.openExternally",
      openExternallyCommand,
    ),
    vscode.commands.registerCommand(
      "vscode-to-explorer.toggleOpenAllFilesExternally",
      toggleOpenAllFilesExternally,
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond the disposables registered in activate().
}
