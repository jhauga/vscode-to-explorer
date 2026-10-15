/**
 * Routes Ctrl+Click on links in the integrated terminal through to-explorer.
 *
 * VS Code already turns URLs and file paths printed in the terminal into links,
 * opening URLs in the OS default browser and files in the editor. This module
 * registers a {@link vscode.TerminalLinkProvider} that claims two kinds of link
 * instead, each behind its own setting under the `terminal.enabled` switch:
 *
 *   - http(s) URLs open through the `openUrlWithProfile` command, so the
 *     configured browser command and profile apply, and
 *   - file paths open in their OS default application when the file would also
 *     open externally from the Explorer (a configured extension, not a script).
 *
 * Text the provider does not claim keeps VS Code's built-in link behavior.
 * Where both cover the same text, VS Code gives extension-provided links
 * precedence over its own detectors; there is no stable API to suppress a
 * built-in link, so this module relies on that ordering.
 *
 * The text matching lives in `terminalLinkParsing.ts`, which has no `vscode`
 * dependency and is unit-tested on its own. This file adds the VS Code parts:
 * the working directory lookup, the settings and on-disk checks, and the click
 * handlers.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { extensionOf, getConfig, isScriptFile, shouldOpenExternally } from "./config.js";
import { defaultAppIsVSCode } from "./defaultApp.js";
import {
  type LineSpan,
  findPathCandidates,
  findUrls,
  resolveCandidate,
} from "./terminalLinkParsing.js";
import { firstError, hasDefaultApp, openExternallyWithPicker } from "./toExplorer.js";

/** What a terminal link opens when it is clicked. */
type TerminalTarget = { kind: "url"; url: string } | { kind: "file"; fsPath: string };

/** A terminal link that remembers its target for the click handler. */
interface ToExplorerTerminalLink extends vscode.TerminalLink {
  target: TerminalTarget;
}

const URL_TOOLTIP = "Open in configured browser profile";
const FILE_TOOLTIP = "Open in default application";

/** Build a terminal link for a matched span. */
function makeLink(span: LineSpan, tooltip: string, target: TerminalTarget): ToExplorerTerminalLink {
  return Object.assign(new vscode.TerminalLink(span.start, span.length, tooltip), { target });
}

/**
 * Best-known working directory of a terminal, used to resolve relative paths.
 * Shell integration (VS Code 1.93+) tracks the live directory after `cd`;
 * otherwise the directory the terminal started in, then the first workspace
 * folder, which is where a default terminal starts.
 */
function terminalCwd(terminal: vscode.Terminal): string | undefined {
  const live = terminal.shellIntegration?.cwd;
  if (live?.scheme === "file") return live.fsPath;

  // Extension-owned (pseudo)terminals have no `cwd` option; reading it is safe.
  const initial = (terminal.creationOptions as vscode.TerminalOptions).cwd;
  if (initial instanceof vscode.Uri) return initial.fsPath;
  if (typeof initial === "string" && initial !== "") return initial;

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** True when the path exists and is a regular file. */
async function isExistingFile(fsPath: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(fsPath)).isFile();
  } catch {
    return false;
  }
}

/**
 * Build a file link for a path candidate when the file would open externally
 * from the Explorer: it has an extension, matches the configured types (or
 * "open all" is on), is not a script, and exists on disk.
 */
async function fileLink(
  span: LineSpan,
  cwd: string | undefined,
  homeDir: string,
): Promise<ToExplorerTerminalLink | undefined> {
  const fsPath = resolveCandidate(span.text, cwd, homeDir);
  if (!fsPath || extensionOf(fsPath) === "") return undefined;

  const uri = vscode.Uri.file(fsPath);
  const config = getConfig(uri);
  if (!shouldOpenExternally(uri, config) || isScriptFile(uri, config)) return undefined;
  if (!(await isExistingFile(fsPath))) return undefined;

  return makeLink(span, FILE_TOOLTIP, { kind: "file", fsPath });
}

/** Open a file in the editor, as VS Code's own terminal file link would. */
async function openInEditor(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand("vscode.open", uri);
}

/**
 * Open a clicked file the way an Explorer double-click would. A file whose OS
 * default application is VS Code, or that has no default application, opens in
 * the editor; the "open with" picker is shown instead when that setting is on.
 * Everything else goes through the `openExternally` command, which reports any
 * failure.
 */
async function openFileTarget(fsPath: string): Promise<void> {
  const uri = vscode.Uri.file(fsPath);
  const config = getConfig(uri);
  try {
    if (await defaultAppIsVSCode(fsPath)) {
      await openInEditor(uri);
      return;
    }
    if (!(await hasDefaultApp(fsPath))) {
      if (!config.pickApplicationWhenNoDefault) {
        await openInEditor(uri);
        return;
      }
      const result = await openExternallyWithPicker(fsPath);
      if (!result.ok) {
        const detail = firstError(result) ?? "the file has no default application";
        void vscode.window.showWarningMessage(
          `Could not open ${path.basename(fsPath)} externally: ${detail}`,
        );
      }
      return;
    }
  } catch {
    // Association lookup failed; fall through to a plain external open.
  }
  await vscode.commands.executeCommand("vscode-to-explorer.openExternally", uri);
}

/** Supplies and handles to-explorer links in terminal output. */
class ToExplorerTerminalLinkProvider
  implements vscode.TerminalLinkProvider<ToExplorerTerminalLink>
{
  async provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    token: vscode.CancellationToken,
  ): Promise<ToExplorerTerminalLink[]> {
    // Settings are read on every call, so toggling them needs no re-registration.
    const config = getConfig();
    if (!config.terminalEnabled) return [];
    if (!config.terminalOpenWebLinks && !config.terminalOpenFiles) return [];

    // URLs are always found so their text is never also treated as a file path,
    // even when web links are left to VS Code.
    const urlSpans = findUrls(context.line);
    const links: ToExplorerTerminalLink[] = [];

    if (config.terminalOpenWebLinks) {
      for (const span of urlSpans) {
        links.push(makeLink(span, URL_TOOLTIP, { kind: "url", url: span.text }));
      }
    }

    if (config.terminalOpenFiles) {
      const candidates = findPathCandidates(context.line, urlSpans);
      if (candidates.length > 0) {
        const cwd = terminalCwd(context.terminal);
        const homeDir = os.homedir();
        const results = await Promise.all(
          candidates.map((span) => fileLink(span, cwd, homeDir)),
        );
        if (token.isCancellationRequested) return [];
        for (const link of results) {
          if (link) links.push(link);
        }
      }
    }

    return links;
  }

  async handleTerminalLink(link: ToExplorerTerminalLink): Promise<void> {
    if (link.target.kind === "url") {
      await vscode.commands.executeCommand(
        "vscode-to-explorer.openUrlWithProfile",
        link.target.url,
      );
    } else {
      await openFileTarget(link.target.fsPath);
    }
  }
}

/** Register the terminal link provider. */
export function registerTerminalLinks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(new ToExplorerTerminalLinkProvider()),
  );
}
