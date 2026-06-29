/**
 * Webview view shown in the to-explorer activity bar container. It is a simple,
 * always-available GUI for configuring the extension: the headline
 * "Open All Files Externally" switch plus the script-handling and browser
 * settings, and shortcut buttons for the Quick Script commands.
 *
 * Changes are written straight to the user's global settings, and the view
 * refreshes whenever the configuration changes elsewhere (the toggle command,
 * the status bar item, or the Settings UI) so it never drifts. Some fields are
 * only relevant in certain states, so they are shown or hidden based on the
 * value of a controlling toggle.
 */
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { CONFIG_SECTION } from "./config.js";

/** Visibility rule: show a field only while a controlling toggle has a value. */
interface ShowWhen {
  key: string;
  value: boolean;
}

/** A boolean setting rendered as a labelled switch in the view. */
interface ToggleSetting {
  kind: "toggle";
  /** Configuration key, relative to the `vscode-to-explorer` section. */
  key: string;
  label: string;
  description: string;
  showWhen?: ShowWhen;
}

/** A free-text setting rendered as a single-line input in the view. */
interface TextSetting {
  kind: "text";
  key: string;
  label: string;
  description: string;
  placeholder: string;
  showWhen?: ShowWhen;
}

type Setting = ToggleSetting | TextSetting;

/** Quick Script commands that the view's buttons are allowed to run. */
const ALLOWED_COMMANDS = new Set([
  "vscode-to-explorer.editFileExtensions",
  "vscode-to-explorer.addQuickScript",
  "vscode-to-explorer.runQuickScript",
  "vscode-to-explorer.editQuickScript",
]);

/** The settings exposed by the configuration view, in display order. */
const SETTINGS: Setting[] = [
  {
    kind: "toggle",
    key: "openAllFilesExternally",
    label: "Open all files externally",
    description: "Open every file double-clicked in the Explorer in its OS default application.",
  },
  {
    kind: "toggle",
    key: "openExternally.promptForScripts",
    label: "Prompt for scripts",
    description: "Ask to Execute, Open in VS Code, or Cancel when a double-clicked file is a script.",
    showWhen: { key: "openAllFilesExternally", value: true },
  },
  {
    kind: "toggle",
    key: "openExternally.pickApplicationWhenNoDefault",
    label: "Pick application when no default",
    description: "Show an \"open with\" picker for externally opened files that have no OS default application.",
    showWhen: { key: "openAllFilesExternally", value: true },
  },
  {
    kind: "toggle",
    key: "executeScript.enabled",
    label: "Enable Execute Script",
    description: "Show the \"Execute Script\" entry in the Explorer context menu for script files.",
  },
  {
    kind: "toggle",
    key: "executeScript.confirmBeforeExecute",
    label: "Confirm before executing",
    description: "Show a confirmation dialog before running a script.",
  },
  {
    kind: "text",
    key: "browser.command",
    label: "Browser command",
    description: "Browser command used when opening URLs in a profile.",
    placeholder: "chrome",
  },
  {
    kind: "toggle",
    key: "browser.openLinksInProfile",
    label: "Open links in browser profile",
    description: "Route clicked http(s) links (in files and the Markdown preview) through the configured browser and profile.",
  },
  {
    kind: "toggle",
    key: "browser.useLastProfile",
    label: "Use last browser profile",
    description: "Open URLs in the browser's last-used profile instead of a specific one.",
  },
  {
    kind: "text",
    key: "browser.profile",
    label: "Browser profile",
    description: "Browser profile used when opening URLs. Leave empty for none.",
    placeholder: "Default",
    showWhen: { key: "browser.useLastProfile", value: false },
  },
];

/** Shape of a setting change posted back from the webview. */
interface UpdatePayload {
  key: string;
  value: boolean | string;
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

/** Read every exposed setting's current value into a key/value snapshot. */
function readValues(): Record<string, boolean | string> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const values: Record<string, boolean | string> = {};
  for (const setting of SETTINGS) {
    if (setting.kind === "toggle") {
      values[setting.key] = cfg.get<boolean>(setting.key, false);
    } else {
      values[setting.key] = cfg.get<string>(setting.key, "");
    }
  }
  return values;
}

/** Render the wrapper attributes that drive a field's conditional visibility. */
function showWhenAttrs(setting: Setting): string {
  if (!setting.showWhen) return "";
  return ` data-when-key="${escapeHtml(setting.showWhen.key)}" data-when-value="${setting.showWhen.value}"`;
}

/** Provides the configuration webview shown in the activity bar container. */
class ConfigViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const nonce = makeNonce();
    webviewView.webview.html = this.render(nonce);

    webviewView.webview.onDidReceiveMessage(
      (message: { type?: string; payload?: UpdatePayload; command?: string }) => {
        if (message?.type === "update" && message.payload) {
          void this.applyUpdate(message.payload);
        } else if (message?.type === "command" && typeof message.command === "string") {
          void this.runCommand(message.command);
        }
      },
    );

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined;
    });
  }

  /** Push the latest configuration values into the live webview, if shown. */
  refresh(): void {
    void this.view?.webview.postMessage({ type: "values", values: readValues() });
  }

  /** Write a single setting change to the user's global settings. */
  private async applyUpdate(payload: UpdatePayload): Promise<void> {
    const known = SETTINGS.some((setting) => setting.key === payload.key);
    if (!known) return;
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(payload.key, payload.value, vscode.ConfigurationTarget.Global);
  }

  /** Run a whitelisted command requested by one of the view's buttons. */
  private async runCommand(command: string): Promise<void> {
    if (!ALLOWED_COMMANDS.has(command)) return;
    await vscode.commands.executeCommand(command);
  }

  /** Render the view HTML, seeding each control with its current value. */
  private render(nonce: string): string {
    const values = readValues();
    const controls = SETTINGS.map((setting) => {
      const label = escapeHtml(setting.label);
      const description = escapeHtml(setting.description);
      const attrs = showWhenAttrs(setting);
      if (setting.kind === "toggle") {
        const checked = values[setting.key] ? " checked" : "";
        return `<div class="field"${attrs}>
  <label class="switch">
    <input type="checkbox" data-key="${escapeHtml(setting.key)}"${checked} />
    <span class="switch-label">${label}</span>
  </label>
  <p class="hint">${description}</p>
</div>`;
      }
      const value = escapeHtml(String(values[setting.key] ?? ""));
      const key = escapeHtml(setting.key);
      return `<div class="field"${attrs}>
  <label class="text-label" for="f-${key}">${label}</label>
  <input type="text" id="f-${key}" data-key="${key}" value="${value}" placeholder="${escapeHtml(setting.placeholder)}" />
  <div class="edit-actions hidden" data-actions-for="${key}">
    <button type="button" class="primary" data-save="${key}">Save</button>
    <button type="button" class="secondary" data-cancel="${key}">Cancel</button>
  </div>
  <p class="hint">${description}</p>
</div>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>to-explorer</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 10px 12px 18px;
    }
    h1 { font-size: 1.05em; margin: 0 0 2px; }
    h2 { font-size: 0.95em; margin: 20px 0 8px; padding-top: 14px; border-top: 1px solid var(--vscode-panel-border, #8884); }
    p.lead { margin: 0 0 14px; color: var(--vscode-descriptionForeground); }
    .field { margin: 0 0 16px; }
    .field.hidden { display: none; }
    .switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .switch-label { font-weight: 600; }
    .text-label { display: block; font-weight: 600; margin: 0 0 4px; }
    input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 5px 8px;
      font-family: inherit;
      font-size: inherit;
    }
    input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .hint { margin: 4px 0 0; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .edit-actions { display: flex; gap: 8px; margin-top: 8px; }
    .edit-actions.hidden { display: none; }
    .buttons { display: flex; flex-direction: column; gap: 8px; }
    button {
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-button-foreground);
      background-color: var(--vscode-button-background);
      border: none;
      border-radius: 4px;
      padding: 7px 12px;
      cursor: pointer;
      text-align: center;
    }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background-color: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
  <h1>to-explorer</h1>
  <p class="lead">Configure how files open and scripts run.</p>
  ${controls}

  <h2>File Extensions</h2>
  <p class="hint">Choose which file types open in their OS default application when double-clicked.</p>
  <div class="buttons">
    <button data-command="vscode-to-explorer.editFileExtensions">Edit File Extensions</button>
  </div>

  <h2>Quick Scripts</h2>
  <div class="buttons">
    <button data-command="vscode-to-explorer.addQuickScript">Add Quick Script</button>
    <button data-command="vscode-to-explorer.runQuickScript">Run Quick Script</button>
    <button data-command="vscode-to-explorer.editQuickScript">Edit Quick Scripts</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function post(key, value) {
      vscode.postMessage({ type: "update", payload: { key, value } });
    }

    /** True/false state of the toggle that controls a field's visibility. */
    function controllingValue(key) {
      const input = document.querySelector('input[type=checkbox][data-key="' + key + '"]');
      return input ? input.checked : false;
    }

    /** Show or hide each conditional field based on its controlling toggle. */
    function applyVisibility() {
      for (const field of document.querySelectorAll('.field[data-when-key]')) {
        const key = field.getAttribute('data-when-key');
        const want = field.getAttribute('data-when-value') === 'true';
        field.classList.toggle('hidden', controllingValue(key) !== want);
      }
    }

    for (const input of document.querySelectorAll("input[type=checkbox][data-key]")) {
      input.addEventListener("change", () => {
        post(input.dataset.key, input.checked);
        applyVisibility();
      });
    }

    // Text fields use an explicit Save/Cancel flow. The last-saved value is the
    // baseline; while the field differs from it, a Save and Cancel pair appears
    // beneath the field. Saving writes the value once and resets the baseline;
    // cancelling restores the baseline. Nothing is written until Save (or Enter).
    const baselines = {};
    const textInputs = document.querySelectorAll("input[type=text][data-key]");
    for (const input of textInputs) baselines[input.dataset.key] = input.value;

    function actionsFor(key) {
      return document.querySelector('[data-actions-for="' + key + '"]');
    }
    function isDirty(key) {
      const actions = actionsFor(key);
      return actions ? !actions.classList.contains("hidden") : false;
    }
    function setDirty(key, dirty) {
      const actions = actionsFor(key);
      if (actions) actions.classList.toggle("hidden", !dirty);
    }
    function commit(input) {
      const key = input.dataset.key;
      const value = input.value.trim();
      input.value = value;
      baselines[key] = value;
      setDirty(key, false);
      post(key, value);
    }
    function revert(input) {
      const key = input.dataset.key;
      input.value = baselines[key] == null ? "" : baselines[key];
      setDirty(key, false);
    }

    for (const input of textInputs) {
      input.addEventListener("input", () => {
        const key = input.dataset.key;
        const baseline = (baselines[key] == null ? "" : baselines[key]).trim();
        setDirty(key, input.value.trim() !== baseline);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(input);
        } else if (event.key === "Escape" && isDirty(input.dataset.key)) {
          event.preventDefault();
          revert(input);
        }
      });
    }
    for (const button of document.querySelectorAll("button[data-save]")) {
      button.addEventListener("click", () => {
        const input = document.querySelector('input[data-key="' + button.dataset.save + '"]');
        if (input) commit(input);
      });
    }
    for (const button of document.querySelectorAll("button[data-cancel]")) {
      button.addEventListener("click", () => {
        const input = document.querySelector('input[data-key="' + button.dataset.cancel + '"]');
        if (input) revert(input);
      });
    }

    for (const button of document.querySelectorAll("button[data-command]")) {
      button.addEventListener("click", () =>
        vscode.postMessage({ type: "command", command: button.dataset.command }));
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.type !== "values") return;
      for (const [key, value] of Object.entries(message.values)) {
        const el = document.querySelector('input[data-key="' + key + '"]');
        if (!el) continue;
        if (el.type === "checkbox") {
          el.checked = Boolean(value);
        } else if (!isDirty(key) && el !== document.activeElement) {
          // Never overwrite a field with an unsaved edit or one being typed in.
          const incoming = value == null ? "" : String(value);
          el.value = incoming;
          baselines[key] = incoming;
        }
      }
      applyVisibility();
    });

    applyVisibility();
  </script>
</body>
</html>`;
  }
}

/** Register the configuration webview view and keep it in sync with settings. */
export function registerConfigView(context: vscode.ExtensionContext): void {
  const provider = new ConfigViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("vscode-to-explorer.configView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) provider.refresh();
    }),
  );
}
