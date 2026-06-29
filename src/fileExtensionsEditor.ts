/**
 * Webview panel for editing the `vscode-to-explorer.fileExtensions` list - the
 * set of extensions that open in their OS default application when
 * double-clicked in the Explorer.
 *
 * The activity-bar configuration view exposes a button that opens this panel.
 * Each configured extension is shown as a removable chip; new ones are added
 * through an input that accepts a single token or a comma/space-separated group.
 * Nothing is written to settings until Save: Save normalizes the working list
 * and persists it to the user's global settings; Cancel discards every change
 * and closes the panel; Restore Defaults reloads the built-in list into the
 * editor (still requiring Save to persist).
 */
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { CONFIG_SECTION, normalizeExtensionList } from "./config.js";
import { DEFAULT_FILE_EXTENSIONS } from "./defaults.js";

/** Generate a 32-character hex nonce for the webview content-security-policy. */
function makeNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Escape a value for safe interpolation into HTML attribute/text contexts. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Read the currently configured extension list, falling back to the defaults. */
function readExtensions(): string[] {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const stored = cfg.get<string[]>("fileExtensions");
  const source = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_FILE_EXTENSIONS;
  return normalizeExtensionList(source);
}

/** Render the panel HTML, seeding the chip list with the current extensions. */
function renderHtml(
  webview: vscode.Webview,
  nonce: string,
  extensions: string[],
): string {
  const initialJson = JSON.stringify(extensions);
  const defaultsJson = JSON.stringify(normalizeExtensionList(DEFAULT_FILE_EXTENSIONS));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>Edit File Extensions</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 16px 18px 96px;
    }
    h1 { font-size: 1.2em; margin: 0 0 4px; }
    p.lead { margin: 0 0 18px; color: var(--vscode-descriptionForeground); }
    label { display: block; font-weight: 600; margin: 14px 0 4px; }
    .add-row { display: flex; gap: 8px; align-items: stretch; }
    .add-row input[type="text"] {
      flex: 1;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
    }
    input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin: 6px 0 0; }
    .count { margin: 18px 0 8px; font-weight: 600; }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--vscode-panel-border, var(--vscode-input-border, #8884));
      border-radius: 6px;
      min-height: 48px;
      align-content: flex-start;
    }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px 3px 10px;
      border-radius: 12px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .chip button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      padding: 0;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      color: inherit;
      background: transparent;
    }
    .chip button:hover {
      background-color: var(--vscode-toolbar-hoverBackground, #ffffff33);
    }
    .actions {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 18px;
      background-color: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-panel-border, #8884);
    }
    .actions .spacer { flex: 1; }
    button {
      font-family: inherit;
      font-size: inherit;
      border: none;
      border-radius: 4px;
      padding: 7px 16px;
      cursor: pointer;
    }
    button.primary { color: var(--vscode-button-foreground); background-color: var(--vscode-button-background); }
    button.primary:hover { background-color: var(--vscode-button-hoverBackground); }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background-color: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <h1>File Extensions</h1>
  <p class="lead">
    These extensions open in their OS default application when double-clicked in
    the Explorer. Add or remove entries, then <strong>Save</strong>. This list has
    no effect while <strong>Open All Files Externally</strong> is on.
  </p>

  <label for="add">Add extensions</label>
  <div class="add-row">
    <input type="text" id="add" placeholder="stl, obj, fbx" autofocus spellcheck="false" />
    <button type="button" class="secondary" id="addButton">Add</button>
  </div>
  <p class="hint">Type one or more extensions (the leading dot is optional) and press Enter or Add.</p>

  <p class="count" id="count"></p>
  <div class="chips" id="chips" aria-label="Configured file extensions"></div>

  <div class="actions">
    <button type="button" class="secondary" id="restore">Restore Defaults</button>
    <span class="spacer"></span>
    <button type="button" class="primary" id="save">Save</button>
    <button type="button" class="secondary" id="cancel">Cancel</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);
    const DEFAULTS = ${defaultsJson};
    let extensions = ${initialJson};

    const chips = byId("chips");
    const count = byId("count");
    const addInput = byId("add");

    /** Normalize a raw input group into a clean, deduped list of new tokens. */
    function parseTokens(raw) {
      const out = [];
      for (const piece of String(raw).split(/[\\s,]+/)) {
        const ext = piece.trim().replace(/^\\.+/, "").toLowerCase();
        if (ext && /^[a-z0-9][a-z0-9._+-]*$/.test(ext)) out.push(ext);
      }
      return out;
    }

    function render() {
      chips.textContent = "";
      if (extensions.length === 0) {
        const empty = document.createElement("span");
        empty.className = "empty";
        empty.textContent = "No extensions - files open in the editor as usual.";
        chips.appendChild(empty);
      } else {
        for (const ext of extensions) {
          const chip = document.createElement("span");
          chip.className = "chip";
          const text = document.createElement("span");
          text.textContent = "." + ext;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.title = "Remove ." + ext;
          remove.setAttribute("aria-label", "Remove ." + ext);
          remove.textContent = "×";
          remove.addEventListener("click", () => {
            extensions = extensions.filter((e) => e !== ext);
            render();
          });
          chip.appendChild(text);
          chip.appendChild(remove);
          chips.appendChild(chip);
        }
      }
      count.textContent = extensions.length + " extension" + (extensions.length === 1 ? "" : "s");
    }

    function addFromInput() {
      const tokens = parseTokens(addInput.value);
      let added = 0;
      for (const ext of tokens) {
        if (!extensions.includes(ext)) {
          extensions.push(ext);
          added += 1;
        }
      }
      addInput.value = "";
      addInput.focus();
      if (added > 0) render();
    }

    byId("addButton").addEventListener("click", addFromInput);
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addFromInput();
      }
    });

    byId("restore").addEventListener("click", () => {
      extensions = DEFAULTS.slice();
      render();
    });
    byId("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
    byId("save").addEventListener("click", () => {
      vscode.postMessage({ type: "save", extensions });
    });

    render();
  </script>
</body>
</html>`;
}

/** Open the file-extensions editor panel, reusing one instance if already open. */
let openPanel: vscode.WebviewPanel | undefined;

/** Show (or focus) the file-extensions editor panel. */
export function showFileExtensionsEditor(): void {
  if (openPanel) {
    openPanel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "vscodeToExplorerFileExtensions",
    "to-explorer: File Extensions",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  openPanel = panel;

  const nonce = makeNonce();
  panel.webview.html = renderHtml(panel.webview, nonce, readExtensions());

  panel.webview.onDidReceiveMessage(async (message: { type?: string; extensions?: unknown }) => {
    if (message?.type === "cancel") {
      panel.dispose();
      return;
    }
    if (message?.type === "save") {
      const raw = Array.isArray(message.extensions) ? (message.extensions as string[]) : [];
      const cleaned = normalizeExtensionList(raw);
      await vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .update("fileExtensions", cleaned, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        `Saved ${cleaned.length} file extension${cleaned.length === 1 ? "" : "s"}`,
        3000,
      );
      panel.dispose();
    }
  });

  panel.onDidDispose(() => {
    if (openPanel === panel) openPanel = undefined;
  });
}

/** Register the "Edit File Extensions" command. */
export function registerFileExtensionsEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-to-explorer.editFileExtensions",
      showFileExtensionsEditor,
    ),
  );
}
