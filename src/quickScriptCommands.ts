/**
 * Implements the two Quick Script commands:
 *   - "Run Quick Script" lists saved scripts and runs the chosen one, and
 *   - "Add Quick Script" opens the configuration form and persists the result.
 *
 * Running a raw Quick Script is a trust boundary, so the same confirmation and
 * output-channel handling used by "Execute Script" applies here. Find/replace
 * scripts act on the active editor: replace-all is applied in one edit, while a
 * non-replace-all preset opens VS Code's own Find/Replace widget pre-filled.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { getConfig } from "./config.js";
import { showQuickScriptForm } from "./quickScriptForm.js";
import {
  applyFindReplace,
  describeQuickScript,
  type FindReplaceQuickScript,
  loadQuickScripts,
  type QuickScript,
  type RawQuickScript,
  saveQuickScript,
  updateQuickScript,
} from "./quickScripts.js";
import { firstError, runScript } from "./toExplorer.js";

let output: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel("to-explorer");
  }
  return output;
}

/** Run a raw Quick Script by writing it to a temp file and executing it. */
async function runRawQuickScript(script: RawQuickScript): Promise<void> {
  const config = getConfig();
  if (config.confirmBeforeExecute) {
    const choice = await vscode.window.showWarningMessage(
      `Run Quick Script "${script.name}"? This will run the script on your machine.`,
      { modal: true },
      "Run Quick Script",
    );
    if (choice !== "Run Quick Script") return;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "to-explorer-quick-"));
  const file = path.join(dir, `quick-script.${script.language}`);
  const log = channel();
  log.show(true);
  log.appendLine(`> Running Quick Script "${script.name}"`);

  try {
    await fs.writeFile(file, script.content, "utf8");
    const result = await runScript(file);
    for (const action of result.actions) {
      if (action.detail) log.appendLine(action.detail);
    }
    if (result.ok) {
      log.appendLine(`> "${script.name}" finished.`);
    } else {
      const detail = firstError(result) ?? "the script reported a failure";
      log.appendLine(`> "${script.name}" failed: ${detail}`);
      void vscode.window.showErrorMessage(`Quick Script "${script.name}" failed: ${detail}`);
    }
  } catch (err) {
    const message = (err as Error).message;
    log.appendLine(`> "${script.name}" failed: ${message}`);
    void vscode.window.showErrorMessage(`Failed to run Quick Script "${script.name}": ${message}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Apply a find/replace Quick Script to the active editor. */
async function runFindReplaceQuickScript(script: FindReplaceQuickScript): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Open a file in the editor to run this Quick Script.");
    return;
  }

  if (!script.replaceAll) {
    // Reproduce a Ctrl+H flow: open the Find/Replace widget pre-filled with the
    // search and replacement so the user replaces matches one at a time. Extra
    // property aliases are passed so the values seed across VS Code versions.
    await vscode.commands.executeCommand("editor.action.startFindReplaceAction");
    await vscode.commands.executeCommand("editor.actions.findWithArgs", {
      searchString: script.find,
      replaceString: script.replace,
      isRegex: script.regex,
      matchCase: script.caseSensitive,
      isCaseSensitive: script.caseSensitive,
      matchCaseOverride: script.caseSensitive ? 1 : 2,
    });
    return;
  }

  const document = editor.document;
  const original = document.getText();
  const { text, count } = applyFindReplace(original, script);
  if (count === 0) {
    vscode.window.setStatusBarMessage(`Quick Script "${script.name}": no matches found`, 3000);
    return;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(original.length),
  );
  const applied = await editor.edit((builder) => builder.replace(fullRange, text));
  if (applied) {
    vscode.window.setStatusBarMessage(
      `Quick Script "${script.name}": ${count} replacement${count === 1 ? "" : "s"}`,
      3000,
    );
  } else {
    void vscode.window.showErrorMessage(`Quick Script "${script.name}" could not modify the document.`);
  }
}

/** Dispatch a Quick Script to the runner for its kind. */
async function runQuickScriptEntry(script: QuickScript): Promise<void> {
  if (script.kind === "raw") {
    await runRawQuickScript(script);
  } else {
    await runFindReplaceQuickScript(script);
  }
}

/** Prompt the user to choose one of the saved Quick Scripts. */
async function pickQuickScript(
  context: vscode.ExtensionContext,
  title: string,
  placeHolder: string,
): Promise<QuickScript | undefined> {
  const scripts = loadQuickScripts(context);
  if (scripts.length === 0) {
    void vscode.window.showInformationMessage("No Quick Scripts have been saved yet.");
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    scripts.map((script) => ({
      label: script.name,
      description: describeQuickScript(script),
      script,
    })),
    { title, placeHolder },
  );
  return picked?.script;
}

/** Register the run, add, and edit Quick Script commands. */
export function registerQuickScripts(context: vscode.ExtensionContext): void {
  const addQuickScript = async (): Promise<void> => {
    const config = getConfig();
    const languages = [...config.scriptExtensions];
    const script = await showQuickScriptForm(languages);
    if (!script) return;
    await saveQuickScript(context, script);
    void vscode.window.showInformationMessage(`Saved Quick Script "${script.name}".`);
  };

  const editQuickScript = async (): Promise<void> => {
    const existing = await pickQuickScript(
      context,
      "Edit to-explorer Quick Script",
      "Select a Quick Script to edit",
    );
    if (!existing) return;
    const config = getConfig();
    const languages = [...config.scriptExtensions];
    const script = await showQuickScriptForm(languages, existing);
    if (!script) return;
    await updateQuickScript(context, script);
    void vscode.window.showInformationMessage(`Updated Quick Script "${script.name}".`);
  };

  const runQuickScript = async (): Promise<void> => {
    const scripts = loadQuickScripts(context);
    if (scripts.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        "No Quick Scripts have been saved. Add one?",
        "Add Quick Script",
      );
      if (choice === "Add Quick Script") {
        await addQuickScript();
      }
      return;
    }

    const picked = await vscode.window.showQuickPick(
      scripts.map((script) => ({
        label: script.name,
        description: describeQuickScript(script),
        script,
      })),
      { title: "Run to-explorer Quick Script", placeHolder: "Select a Quick Script to run" },
    );
    if (!picked) return;
    await runQuickScriptEntry(picked.script);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-to-explorer.runQuickScript", runQuickScript),
    vscode.commands.registerCommand("vscode-to-explorer.addQuickScript", addQuickScript),
    vscode.commands.registerCommand("vscode-to-explorer.editQuickScript", editQuickScript),
    { dispose: () => output?.dispose() },
  );
}
