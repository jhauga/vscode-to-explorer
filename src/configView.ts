/**
 * Webview views shown in the to-explorer activity bar container. The container
 * holds four collapsible sections, each registered as its own view so VS Code
 * remembers whether it is expanded:
 *
 *   - Main Configuration: the headline "Open All Files Externally" switch and
 *     the script-handling settings, with a link to the extension's settings,
 *   - Browser Configuration: the browser command and profile settings,
 *   - Terminal Configuration: Ctrl+Click handling for links in the terminal,
 *   - Configuration Editor Nav: buttons for the file-extension editor and the
 *     Quick Script commands.
 *
 * One provider class renders every section from the `VIEWS` table. Changes are
 * written straight to the user's global settings, and every view refreshes
 * whenever the configuration changes elsewhere (the toggle command, the status
 * bar item, the Settings UI, or another section) so it never drifts. Some fields
 * are only relevant in certain states, so they are shown or hidden based on the
 * value of a controlling toggle in the same section.
 */
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { CONFIG_SECTION } from "./config.js";

/** Visibility rule: show a field only while a controlling toggle has a value. */
interface ShowWhen {
  /** Key of a toggle in the same section. */
  key: string;
  value: boolean;
}

/** Fields shared by every setting rendered in a view. */
interface BaseSetting {
  /** Configuration key, relative to the `vscode-to-explorer` section. */
  key: string;
  label: string;
  /** Plain text; `**text**` renders bold. */
  description: string;
  showWhen?: ShowWhen;
  /** Draw a divider above the field to start a visual sub-group. */
  dividerBefore?: boolean;
}

/** A boolean setting rendered as a labelled checkbox. */
interface ToggleSetting extends BaseSetting {
  kind: "toggle";
}

/** A free-text setting rendered as a single-line input with Save and Cancel. */
interface TextSetting extends BaseSetting {
  kind: "text";
  placeholder: string;
}

type Setting = ToggleSetting | TextSetting;

/** A button that runs one of the extension's commands. */
interface CommandButton {
  command: string;
  label: string;
}

/** A titled group of command buttons. */
interface ButtonGroup {
  title: string;
  hint?: string;
  buttons: CommandButton[];
}

/** Optional heading at the top of a section. */
interface SectionHeading {
  title: string;
  lead: string;
  /** Show a link above the title that opens the Settings UI for this extension. */
  settingsLink?: boolean;
}

/** Everything one view renders. `id` must match a view id in package.json. */
interface ViewSection {
  id: string;
  heading?: SectionHeading;
  settings: Setting[];
  groups?: ButtonGroup[];
}

/** The four sections of the activity bar container, in display order. */
const VIEWS: readonly ViewSection[] = [
  {
    id: "vscode-to-explorer.mainConfigView",
    heading: {
      title: "to-explorer",
      lead: "Configure how files open and scripts run.",
      settingsLink: true,
    },
    settings: [
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
    ],
  },
  {
    id: "vscode-to-explorer.browserConfigView",
    settings: [
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
    ],
  },
  {
    id: "vscode-to-explorer.terminalConfigView",
    settings: [
      {
        kind: "toggle",
        key: "terminal.enabled",
        label: "Enable terminal files / links",
        description: "Opening files and links from terminal stdout.",
      },
      {
        kind: "toggle",
        key: "terminal.openWebLinksInBrowser",
        label: "Open web links in browser",
        description: "Open web links in browser using configured **To-Explorer** browser settings instead of opening previews in VS Code.",
        showWhen: { key: "terminal.enabled", value: true },
        dividerBefore: true,
      },
      {
        kind: "toggle",
        key: "terminal.openFilesInDefaultApp",
        label: "Open file extensions with default app",
        description: "Open file extension in default app as configured with **To-Explorer** instead of VS Code.",
        showWhen: { key: "terminal.enabled", value: true },
      },
    ],
  },
  {
    id: "vscode-to-explorer.editorNavView",
    settings: [],
    groups: [
      {
        title: "File Extensions",
        hint: "Choose which file types open in their OS default application when double-clicked.",
        buttons: [{ command: "vscode-to-explorer.editFileExtensions", label: "Edit File Extensions" }],
      },
      {
        title: "Quick Scripts",
        buttons: [
          { command: "vscode-to-explorer.addQuickScript", label: "Add Quick Script" },
          { command: "vscode-to-explorer.runQuickScript", label: "Run Quick Script" },
          { command: "vscode-to-explorer.editQuickScript", label: "Edit Quick Scripts" },
        ],
      },
    ],
  },
];

/** Shape of a setting change posted back from the webview. */
interface UpdatePayload {
  key: string;
  value: boolean | string;
}

/** Messages a view's webview may post to the extension. */
interface ViewMessage {
  type?: string;
  payload?: UpdatePayload;
  command?: string;
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

/** Escape a description, then render `**text**` as bold. */
function renderDescription(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Read the current value of each given setting into a key/value snapshot. */
function readValues(settings: readonly Setting[]): Record<string, boolean | string> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const values: Record<string, boolean | string> = {};
  for (const setting of settings) {
    if (setting.kind === "toggle") {
      values[setting.key] = cfg.get<boolean>(setting.key, false);
    } else {
      values[setting.key] = cfg.get<string>(setting.key, "");
    }
  }
  return values;
}

/**
 * Class and data attributes for a field's wrapper. Conditional fields start
 * hidden when their rule does not hold, so nothing flashes before the script
 * runs.
 */
function fieldAttrs(setting: Setting, values: Record<string, boolean | string>): string {
  const classes = ["field"];
  if (setting.dividerBefore) classes.push("divider");
  let data = "";
  if (setting.showWhen) {
    const { key, value } = setting.showWhen;
    if (Boolean(values[key]) !== value) classes.push("hidden");
    data = ` data-when-key="${escapeHtml(key)}" data-when-value="${value}"`;
  }
  return ` class="${classes.join(" ")}"${data}`;
}

/** Render one setting as a checkbox or a text field. */
function renderSetting(setting: Setting, values: Record<string, boolean | string>): string {
  const label = escapeHtml(setting.label);
  const description = renderDescription(setting.description);
  const key = escapeHtml(setting.key);
  const attrs = fieldAttrs(setting, values);
  if (setting.kind === "toggle") {
    const checked = values[setting.key] ? " checked" : "";
    return `<div${attrs}>
  <label class="switch">
    <input type="checkbox" data-key="${key}"${checked} />
    <span class="switch-label">${label}</span>
  </label>
  <p class="hint">${description}</p>
</div>`;
  }
  const value = escapeHtml(String(values[setting.key] ?? ""));
  return `<div${attrs}>
  <label class="text-label" for="f-${key}">${label}</label>
  <input type="text" id="f-${key}" data-key="${key}" value="${value}" placeholder="${escapeHtml(setting.placeholder)}" />
  <div class="edit-actions hidden" data-actions-for="${key}">
    <button type="button" class="primary" data-save="${key}">Save</button>
    <button type="button" class="secondary" data-cancel="${key}">Cancel</button>
  </div>
  <p class="hint">${description}</p>
</div>`;
}

/** Render a section heading, with the optional settings link above it. */
function renderHeading(heading: SectionHeading): string {
  const link = heading.settingsLink
    ? `<button type="button" class="link" data-open-settings>To-Explorer: Configuration</button>\n`
    : "";
  return `${link}<h1>${escapeHtml(heading.title)}</h1>
<p class="lead">${escapeHtml(heading.lead)}</p>`;
}

/** Render a titled group of command buttons. */
function renderGroup(group: ButtonGroup): string {
  const hint = group.hint ? `\n  <p class="hint">${escapeHtml(group.hint)}</p>` : "";
  const buttons = group.buttons
    .map(
      (button) =>
        `    <button type="button" data-command="${escapeHtml(button.command)}">${escapeHtml(button.label)}</button>`,
    )
    .join("\n");
  return `<section class="group">
  <h2>${escapeHtml(group.title)}</h2>${hint}
  <div class="buttons">
${buttons}
  </div>
</section>`;
}

/** Styles shared by every section. Colors come from the VS Code theme. */
const VIEW_STYLE = `
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 8px 12px 12px;
    }
    h1 { font-size: 1.05em; margin: 0 0 2px; }
    h2 { font-size: 0.95em; margin: 0 0 6px; }
    p.lead { margin: 0 0 14px; color: var(--vscode-descriptionForeground); }
    .field { margin: 0 0 16px; }
    .field.divider { border-top: 1px solid var(--vscode-panel-border, #8884); padding-top: 14px; }
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
    .group + .group {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--vscode-panel-border, #8884);
    }
    .group .hint { margin: 0 0 8px; }
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
    button.link {
      display: block;
      margin: 0 0 6px;
      padding: 0;
      font-size: 0.9em;
      text-align: left;
      color: var(--vscode-textLink-foreground);
      background: none;
    }
    button.link:hover {
      background: none;
      color: var(--vscode-textLink-activeForeground);
      text-decoration: underline;
    }
    button.link:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
`;

/**
 * Behavior shared by every section: checkboxes write on change, text fields use
 * an explicit Save/Cancel flow, buttons run whitelisted commands, and incoming
 * value snapshots resync the controls. Plain string concatenation only, since
 * this script is embedded in a template literal.
 */
const VIEW_SCRIPT = `
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

    const settingsLink = document.querySelector("[data-open-settings]");
    if (settingsLink) {
      settingsLink.addEventListener("click", () => vscode.postMessage({ type: "openSettings" }));
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
`;

/** Provides one section of the activity bar container as a webview view. */
class ConfigViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  /** Commands this section's buttons may run; anything else is ignored. */
  private readonly allowedCommands: ReadonlySet<string>;

  constructor(
    private readonly section: ViewSection,
    private readonly extensionId: string,
  ) {
    this.allowedCommands = new Set(
      (section.groups ?? []).flatMap((group) => group.buttons.map((button) => button.command)),
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render(makeNonce());

    webviewView.webview.onDidReceiveMessage((message: ViewMessage) => {
      if (message?.type === "update" && message.payload) {
        void this.applyUpdate(message.payload);
      } else if (message?.type === "command" && typeof message.command === "string") {
        void this.runCommand(message.command);
      } else if (message?.type === "openSettings") {
        void this.openSettings();
      }
    });

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined;
    });
  }

  /** Push the latest configuration values into the live webview, if shown. */
  refresh(): void {
    if (this.section.settings.length === 0) return;
    void this.view?.webview.postMessage({
      type: "values",
      values: readValues(this.section.settings),
    });
  }

  /** Write one setting change, accepting only this section's keys and value types. */
  private async applyUpdate(payload: UpdatePayload): Promise<void> {
    const setting = this.section.settings.find((s) => s.key === payload.key);
    if (!setting) return;
    const expected = setting.kind === "toggle" ? "boolean" : "string";
    if (typeof payload.value !== expected) return;
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(setting.key, payload.value, vscode.ConfigurationTarget.Global);
  }

  /** Run a command requested by one of this section's buttons. */
  private async runCommand(command: string): Promise<void> {
    if (!this.allowedCommands.has(command)) return;
    await vscode.commands.executeCommand(command);
  }

  /** Open the Settings UI filtered to this extension (sections with the link only). */
  private async openSettings(): Promise<void> {
    if (!this.section.heading?.settingsLink) return;
    await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${this.extensionId}`);
  }

  /** Render the section HTML, seeding each control with its current value. */
  private render(nonce: string): string {
    const values = readValues(this.section.settings);
    const parts: string[] = [];
    if (this.section.heading) parts.push(renderHeading(this.section.heading));
    for (const setting of this.section.settings) parts.push(renderSetting(setting, values));
    for (const group of this.section.groups ?? []) parts.push(renderGroup(group));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>to-explorer</title>
  <style nonce="${nonce}">${VIEW_STYLE}</style>
</head>
<body>
${parts.join("\n")}
  <script nonce="${nonce}">${VIEW_SCRIPT}</script>
</body>
</html>`;
  }
}

/** Register the four configuration views and keep them in sync with settings. */
export function registerConfigView(context: vscode.ExtensionContext): void {
  const providers: ConfigViewProvider[] = [];
  for (const section of VIEWS) {
    const provider = new ConfigViewProvider(section, context.extension.id);
    providers.push(provider);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(section.id, provider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    );
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) return;
      for (const provider of providers) provider.refresh();
    }),
  );
}
