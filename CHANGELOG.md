# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha] - 2026-06-29

### Fixed

- Stop the "open with" picker loop that occurred when **Open All Files
  Externally** was on and a file without an extension was double-clicked. Such
  files have no reliable OS default application; they now stay in the editor and
  open in VS Code as normal.
- Stop the open/close loop that occurred when **Open All Files Externally** was
  on and a file's OS default application was VS Code itself. Such files are now
  detected and left in the editor instead of being handed back to a new tab. A
  short reopen cooldown breaks the loop on platforms where the default handler
  cannot be resolved.
- Stop double-clicked scripts from being run by the OS when opening files
  externally. Scripts now open in the editor by default. A new
  `vscode-to-explorer.openExternally.promptForScripts` setting instead offers a
  dialog to **Execute**, **Open in VS Code**, or **Cancel**.
- Stop showing a warning when a file opened externally has no OS default
  application; such files now open in the editor as usual. A new
  `vscode-to-explorer.openExternally.pickApplicationWhenNoDefault` setting
  instead shows an "open with" picker.
- Give the activity bar view's text fields (browser command and profile) an
  explicit **Save** / **Cancel** pair that appears beneath a field once its
  value changes, so a value is written deliberately (Save or Enter) and a change
  can be discarded (Cancel or Escape). This replaces the previous save-on-every-
  keystroke behavior, which made it unclear whether a value had taken effect.
- Honor the selected browser profile when opening URLs. Configuration discovery
  is no longer skipped for this path, so the browser command and Chrome profiles
  directory resolve the same way as the `to-explorer` command line. Previously a
  custom browser or profiles location was missed, the profile flag was dropped,
  and the browser fell back to its last-used profile.

### Added

- **Edit File Extensions** panel, opened from a button in the activity bar view
  or the **to-explorer: Edit File Extensions** command. Each external file type
  is shown as a removable chip and new ones are added from an input that accepts
  comma- or space-separated groups. Nothing is written until **Save**; **Cancel**
  discards every change and **Restore Defaults** reloads the built-in list.
- **to-explorer activity bar view** with a simple GUI for configuring the
  extension: the **Open All Files Externally** switch plus the script-handling
  and browser settings, and shortcut buttons for the Quick Script commands.
  Changes are written to settings immediately, and the view stays in sync when
  settings change elsewhere. Fields that only apply in certain states are hidden
  until they are relevant.
- **Edit Quick Scripts** command that lists the saved Quick Scripts and reopens
  the configuration form pre-filled, so a script can be changed and saved back
  in place.
- `vscode-to-explorer.browser.useLastProfile` setting to open URLs in the
  browser's last-used profile instead of a configured one. When on, the browser
  profile setting is ignored and hidden in the activity bar view.
- `vscode-to-explorer.browser.openLinksInProfile` setting (off by default) that
  routes clicked `http`/`https` links through the configured browser and
  profile: links in Markdown, HTML, and plain-text files open on Ctrl+Click, and
  links in the rendered Markdown preview are rewritten to the same handler.
- **Status bar indicator** shown only while **Open All Files Externally** is on.
  It reads "Files opened with OS default app." on hover and turns the setting
  back off when clicked.
- **Add Quick Script** command and editor context-menu entry that opens a form
  to configure and save a reusable Quick Script (a raw script or a find/replace
  preset). Raw scripts are statically checked before they are saved.
- **Run Quick Script** command and editor context-menu entry that lists saved
  Quick Scripts and runs the chosen one. Raw scripts run after confirmation;
  find/replace presets apply to the active editor, opening the Find/Replace
  widget pre-filled when **Replace All** is off.

## [0.0.0-alpha] - 2026-06-28

### Added

- Open files in their OS default application when double-clicked in the
  Explorer, driven by the `to-explorer` package.
- Configurable list of file extensions opened externally, with a media, design,
  document, and CAD/3D default set.
- Optional setting to open every double-clicked file in its default
  application, with a Command Palette toggle.
- **Execute Script** Explorer context-menu command with a confirmation dialog
  and a dedicated output channel.
- **Open URL in Browser Profile** command and browser/profile settings.
- **Open in Default Application** context-menu command.
