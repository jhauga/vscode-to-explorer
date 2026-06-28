/**
 * Opens URLs in the configured browser and profile. Useful when a link is
 * clicked while previewing Markdown, HTML, or other files and it should open in
 * a specific browser profile (for example "Default" or "Profile 2").
 */
import * as vscode from "vscode";
import { getConfig } from "./config.js";
import { firstError, openUrl } from "./toExplorer.js";

const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Pick a sensible default URL from the active selection, if it is one. */
function selectionUrl(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const text = editor.document.getText(editor.selection).trim();
  return URL_PATTERN.test(text) ? text : undefined;
}

async function openUrlWithProfile(arg?: unknown): Promise<void> {
  const config = getConfig();

  let url = typeof arg === "string" ? arg : undefined;
  if (!url) {
    url = await vscode.window.showInputBox({
      title: "Open URL in browser profile",
      prompt: config.browserProfile
        ? `Opens in ${config.browserCommand} (${config.browserProfile})`
        : `Opens in ${config.browserCommand}`,
      value: selectionUrl() ?? "https://example.com",
      validateInput: (value) =>
        URL_PATTERN.test(value.trim()) ? undefined : "Enter an http or https URL.",
    });
  }

  const target = url?.trim();
  if (!target) return;

  try {
    const result = await openUrl(target, config.browserCommand, config.browserProfile);
    if (!result.ok) {
      const detail = firstError(result) ?? "the browser could not be launched";
      void vscode.window.showErrorMessage(`Could not open URL: ${detail}`);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Failed to open URL: ${(err as Error).message}`);
  }
}

/** Register the open-URL command. */
export function registerLinkOpener(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-to-explorer.openUrlWithProfile",
      openUrlWithProfile,
    ),
  );
}
