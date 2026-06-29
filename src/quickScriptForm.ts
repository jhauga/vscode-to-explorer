/**
 * Webview form used by the "Add Quick Script" command to configure and save a
 * Quick Script. The form supports both kinds: a raw script (with a language and
 * a script body) and a find/replace preset (with the same toggles VS Code's own
 * find widget exposes). Validation runs in the extension host on save, so a
 * "safe and isolated" check happens before anything is persisted.
 */
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import {
  type FindReplaceQuickScript,
  type QuickScript,
  type RawQuickScript,
  validateFindReplace,
  validateRawScript,
} from "./quickScripts.js";

/** Shape of the payload the webview posts back when the user saves. */
interface SavePayload {
  kind: "raw" | "findReplace";
  name: string;
  language: string;
  content: string;
  find: string;
  replace: string;
  regex: boolean;
  caseSensitive: boolean;
  replaceAll: boolean;
}

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

/**
 * Build a validated Quick Script from a save payload, or report why not. When
 * editing, `id` carries the existing script's id forward so the saved entry
 * replaces the original instead of creating a duplicate.
 */
function buildScript(
  payload: SavePayload,
  id: string,
): { script: QuickScript } | { error: string } {
  const name = payload.name.trim();
  if (name === "") return { error: "A name is required." };

  if (payload.kind === "raw") {
    const language = payload.language.trim().replace(/^\.+/, "").toLowerCase();
    if (language === "") return { error: "Choose a script language." };
    const check = validateRawScript(payload.content);
    if (!check.ok) return { error: check.reason ?? "The script is not valid." };
    const script: RawQuickScript = {
      id,
      kind: "raw",
      name,
      language,
      content: payload.content,
    };
    return { script };
  }

  const check = validateFindReplace({
    find: payload.find,
    replace: payload.replace,
    regex: payload.regex,
    caseSensitive: payload.caseSensitive,
  });
  if (!check.ok) return { error: check.reason ?? "The find/replace preset is not valid." };
  const script: FindReplaceQuickScript = {
    id,
    kind: "findReplace",
    name,
    find: payload.find,
    replace: payload.replace,
    regex: payload.regex,
    caseSensitive: payload.caseSensitive,
    replaceAll: payload.replaceAll,
  };
  return { script };
}

/** Form field values used to seed the webview, whether adding or editing. */
interface FormInitial {
  name: string;
  kind: "raw" | "findReplace";
  language: string;
  content: string;
  find: string;
  replace: string;
  regex: boolean;
  caseSensitive: boolean;
  replaceAll: boolean;
}

/** Seed the form from an existing script when editing, or with add defaults. */
function toInitial(existing: QuickScript | undefined): FormInitial {
  const defaults: FormInitial = {
    name: "",
    kind: "findReplace",
    language: "",
    content: "",
    find: " {1,}$",
    replace: "",
    regex: true,
    caseSensitive: false,
    replaceAll: true,
  };
  if (!existing) return defaults;
  if (existing.kind === "raw") {
    return { ...defaults, name: existing.name, kind: "raw", language: existing.language, content: existing.content };
  }
  return {
    ...defaults,
    name: existing.name,
    kind: "findReplace",
    find: existing.find,
    replace: existing.replace,
    regex: existing.regex,
    caseSensitive: existing.caseSensitive,
    replaceAll: existing.replaceAll,
  };
}

/** Render the form HTML, seeding the language list and field values. */
function renderHtml(
  webview: vscode.Webview,
  nonce: string,
  languages: string[],
  initial: FormInitial,
  heading: string,
  saveLabel: string,
): string {
  // Ensure the seeded language appears and is selectable, even if it is not in
  // the current configured list (for example after the list was edited).
  const langList = initial.language && !languages.includes(initial.language)
    ? [initial.language, ...languages]
    : languages;
  const options = langList
    .map(
      (lang) =>
        `<option value="${escapeHtml(lang)}"${lang === initial.language ? " selected" : ""}>.${escapeHtml(lang)}</option>`,
    )
    .join("");
  const sel = (kind: "raw" | "findReplace"): string => (initial.kind === kind ? " selected" : "");
  const chk = (on: boolean): string => (on ? " checked" : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>Add to-explorer Quick Script</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 16px 18px 24px;
    }
    h1 { font-size: 1.2em; margin: 0 0 4px; }
    p.lead { margin: 0 0 18px; color: var(--vscode-descriptionForeground); }
    label { display: block; font-weight: 600; margin: 14px 0 4px; }
    input[type="text"], textarea, select {
      width: 100%;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea {
      min-height: 160px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    input:focus, textarea:focus, select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    fieldset {
      border: 1px solid var(--vscode-panel-border, var(--vscode-input-border, #8884));
      border-radius: 6px;
      margin: 16px 0 0;
      padding: 8px 14px 14px;
    }
    legend { padding: 0 6px; font-weight: 600; }
    .check { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-weight: 400; }
    .check label { display: inline; margin: 0; font-weight: 400; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin: 4px 0 0; }
    .row { display: flex; gap: 14px; }
    .row > div { flex: 1; }
    .actions { display: flex; gap: 10px; margin-top: 22px; }
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
    #error {
      display: none;
      margin-top: 16px;
      padding: 8px 12px;
      border-radius: 4px;
      color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <p class="lead">Save a reusable action you can run later with <strong>Run Quick Script</strong>.</p>

  <label for="name">Name</label>
  <input type="text" id="name" placeholder="Trim trailing spaces" value="${escapeHtml(initial.name)}" autofocus />

  <label for="kind">Type</label>
  <select id="kind">
    <option value="findReplace"${sel("findReplace")}>Find / Replace (preset)</option>
    <option value="raw"${sel("raw")}>Raw script</option>
  </select>

  <fieldset id="findReplaceSection">
    <legend>Find / Replace</legend>
    <div class="row">
      <div>
        <label for="find">Find <span class="hint">(required)</span></label>
        <input type="text" id="find" value="${escapeHtml(initial.find)}" />
      </div>
      <div>
        <label for="replace">Replace</label>
        <input type="text" id="replace" value="${escapeHtml(initial.replace)}" />
      </div>
    </div>
    <div class="check"><input type="checkbox" id="regex"${chk(initial.regex)} /><label for="regex">Regular Expression</label></div>
    <div class="check"><input type="checkbox" id="caseSensitive"${chk(initial.caseSensitive)} /><label for="caseSensitive">Case sensitive</label></div>
    <div class="check"><input type="checkbox" id="replaceAll"${chk(initial.replaceAll)} /><label for="replaceAll">Replace All</label></div>
    <p class="hint">When Replace All is off, running this script opens VS Code's Find/Replace widget pre-filled so you can replace matches one at a time.</p>
  </fieldset>

  <fieldset id="rawSection" class="hidden">
    <legend>Raw script</legend>
    <label for="language">Language</label>
    <select id="language">${options}</select>
    <label for="content">Script</label>
    <textarea id="content" spellcheck="false" placeholder="echo Hello from a Quick Script">${escapeHtml(initial.content)}</textarea>
    <p class="hint">The script is checked before saving and written to a temporary file when run.</p>
  </fieldset>

  <div id="error" role="alert"></div>

  <div class="actions">
    <button type="button" class="primary" id="save">${escapeHtml(saveLabel)}</button>
    <button type="button" class="secondary" id="cancel">Cancel</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);
    const kind = byId("kind");
    const findReplaceSection = byId("findReplaceSection");
    const rawSection = byId("rawSection");
    const errorBox = byId("error");
    const saveButton = byId("save");

    function syncSections() {
      const isRaw = kind.value === "raw";
      rawSection.classList.toggle("hidden", !isRaw);
      findReplaceSection.classList.toggle("hidden", isRaw);
    }
    kind.addEventListener("change", syncSections);
    syncSections();

    byId("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));

    saveButton.addEventListener("click", () => {
      errorBox.style.display = "none";
      saveButton.disabled = true;
      vscode.postMessage({
        type: "save",
        payload: {
          kind: kind.value,
          name: byId("name").value,
          language: byId("language").value,
          content: byId("content").value,
          find: byId("find").value,
          replace: byId("replace").value,
          regex: byId("regex").checked,
          caseSensitive: byId("caseSensitive").checked,
          replaceAll: byId("replaceAll").checked,
        },
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message && message.type === "invalid") {
        errorBox.textContent = message.reason;
        errorBox.style.display = "block";
        saveButton.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Open the Quick Script form and resolve with the saved script, or `undefined`
 * if the user cancels or closes the panel. Validation failures keep the form
 * open and surface the reason inline. When `existing` is provided the form opens
 * pre-filled for editing and the saved script keeps the original's id.
 */
export function showQuickScriptForm(
  languages: string[],
  existing?: QuickScript,
): Promise<QuickScript | undefined> {
  const editing = existing !== undefined;
  const id = existing?.id ?? crypto.randomUUID();
  const heading = editing ? "Edit a to-explorer Quick Script" : "Add a to-explorer Quick Script";
  const saveLabel = editing ? "Save Changes" : "Save Quick Script";

  const panel = vscode.window.createWebviewPanel(
    "vscodeToExplorerQuickScript",
    editing ? "Edit to-explorer Quick Script" : "Add to-explorer Quick Script",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const nonce = makeNonce();
  panel.webview.html = renderHtml(panel.webview, nonce, languages, toInitial(existing), heading, saveLabel);

  return new Promise<QuickScript | undefined>((resolve) => {
    let settled = false;
    const finish = (value: QuickScript | undefined): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      panel.dispose();
    };

    panel.webview.onDidReceiveMessage((message: { type?: string; payload?: SavePayload }) => {
      if (message?.type === "cancel") {
        finish(undefined);
        return;
      }
      if (message?.type === "save" && message.payload) {
        const built = buildScript(message.payload, id);
        if ("error" in built) {
          void vscode.window.showErrorMessage(`Quick Script not saved: ${built.error}`);
          void panel.webview.postMessage({ type: "invalid", reason: built.error });
          return;
        }
        finish(built.script);
      }
    });

    panel.onDidDispose(() => finish(undefined));
  });
}
