/**
 * Implements the "Execute Script" Explorer context-menu command. Running a
 * script is a trust boundary, so a modal confirmation is shown before anything
 * is launched and the captured output is written to a dedicated channel.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { getConfig, isScriptFile } from "./config.js";
import { firstError, runScript } from "./toExplorer.js";

let output: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel("to-explorer");
  }
  return output;
}

/** Resolve the URI the command should act on (menu arg or active editor). */
function resolveTarget(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  return vscode.window.activeTextEditor?.document.uri;
}

async function executeScript(arg: unknown): Promise<void> {
  const uri = resolveTarget(arg);
  if (!uri || uri.scheme !== "file") {
    void vscode.window.showWarningMessage("Select a script file to execute.");
    return;
  }

  const config = getConfig(uri);
  if (!config.executeScriptEnabled) {
    void vscode.window.showWarningMessage("Script execution is disabled in settings.");
    return;
  }
  if (!isScriptFile(uri, config)) {
    void vscode.window.showWarningMessage(
      `${path.basename(uri.fsPath)} is not a recognized script type.`,
    );
    return;
  }

  const name = path.basename(uri.fsPath);
  if (config.confirmBeforeExecute) {
    const choice = await vscode.window.showWarningMessage(
      `Execute ${name}? This will run the script on your machine.`,
      { modal: true },
      "Execute Script",
    );
    if (choice !== "Execute Script") return;
  }

  const log = channel();
  log.show(true);
  log.appendLine(`> Executing ${uri.fsPath}`);

  try {
    const result = await runScript(uri.fsPath);
    for (const action of result.actions) {
      if (action.detail) log.appendLine(action.detail);
    }
    if (result.ok) {
      log.appendLine(`> ${name} finished.`);
    } else {
      const detail = firstError(result) ?? "the script reported a failure";
      log.appendLine(`> ${name} failed: ${detail}`);
      void vscode.window.showErrorMessage(`${name} failed: ${detail}`);
    }
  } catch (err) {
    const message = (err as Error).message;
    log.appendLine(`> ${name} failed: ${message}`);
    void vscode.window.showErrorMessage(`Failed to execute ${name}: ${message}`);
  }
}

/** Register the execute-script command. */
export function registerExecuteScript(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-to-explorer.executeScript", executeScript),
    { dispose: () => output?.dispose() },
  );
}
