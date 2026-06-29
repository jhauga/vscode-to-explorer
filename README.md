# to-explorer for VS Code

Open files in their operating-system default application straight from the VS
Code Explorer, run scripts from the context menu, and open links in a chosen
browser profile. The extension drives the
[`to-explorer`](https://www.npmjs.com/package/to-explorer) package, which
launches applications detached so nothing blocks the editor.

## Features

- **Open design, media, document, and CAD files externally.** Double-click a
  file such as `mockup.psd`, `promo.mp4`, `report.docx`, or `part.step` in the
  Explorer and it opens in its OS default application instead of showing the
  "binary or unsupported encoding" notice. Code and text files keep opening in
  the editor.
- **Configurable file-type list.** The set of externally opened extensions is a
  setting, so you can add or remove types to fit your workflow.
- **Open everything externally (optional).** A single switch makes every
  double-clicked file open in its default application. It is off by default.
  Files whose OS default application is VS Code itself stay in the editor, so the
  setting never bounces a file between VS Code and the OS. Files without an
  extension also stay in the editor, since they have no reliable default
  application. Scripts are kept in the editor rather than run, and files with no
  default application open in the editor as usual - opt in to a script prompt or
  an "open with" picker through settings.
- **Configuration view and status indicator.** A **to-explorer** view in the
  activity bar provides a simple GUI for the extension's settings, with an
  **Edit File Extensions** button and shortcut buttons to add, run, and edit
  Quick Scripts. While **Open All Files Externally** is on, a status bar item
  appears; click it to turn the setting back off.
- **Edit the external file types in a panel.** Click **Edit File Extensions** in
  the activity bar view (or run **to-explorer: Edit File Extensions**) to open an
  editor where each extension is a removable chip and new ones are added from an
  input. Save writes the list, Cancel discards it, and Restore Defaults reloads
  the built-in set.
- **Execute scripts from the Explorer.** Right-click an executable script
  (`build.bat`, `deploy.sh`, `setup.ps1`, ...) and choose **Execute Script**.
  A confirmation dialog appears before the script runs, and its output is shown
  in the **to-explorer** output channel.
- **Open links in a browser profile.** Configure a browser and profile (for
  example `Default` or `Profile 2`) and open URLs there with the **Open URL in
  Browser Profile** command. Optionally turn on **Open links in browser profile**
  to route clicked `http`/`https` links - in Markdown, HTML, and plain-text files
  (Ctrl+Click) and in the rendered Markdown preview - through that browser and
  profile instead of the OS default browser.
- **Save and run Quick Scripts.** Right-click in the editor and choose **Add
  Quick Script** to save a reusable action, then **Run Quick Script** to run it.
  A Quick Script is either a raw script (run like a script file) or a
  find/replace preset that applies the same toggles as VS Code's find widget
  (regular expression, case sensitive, replace all).

## Getting started

1. Install the extension.
2. Double-click a supported file (for example `diagram.dwg`) in the Explorer to
   open it in its default application.
3. To open every file externally, enable
   `vscode-to-explorer.openAllFilesExternally` or run **Toggle: Open All Files
   Externally** from the Command Palette.

## Commands

| Command | Description |
| --- | --- |
| `Open in Default Application` | Open the selected file in its OS default application. |
| `Execute Script` | Run the selected script after confirmation. |
| `Open URL in Browser Profile` | Open a URL in the configured browser and profile. |
| `Toggle: Open All Files Externally` | Switch the open-everything setting on or off. |
| `Edit File Extensions` | Open a panel to add or remove the file types that open externally. |
| `Run Quick Script` | Pick a saved Quick Script and run it. |
| `Add Quick Script` | Open a form to configure and save a new Quick Script. |
| `Edit Quick Scripts` | Pick a saved Quick Script and reopen its form pre-filled to change it. |

## Quick Scripts

Quick Scripts are small, named actions you save once and run again from the
editor. Right-click in the editor and choose **Add a to-explorer Quick Script**
(or run **to-explorer: Add Quick Script** from the Command Palette) to open the
configuration form, then use **Run a to-explorer Quick Script** to run one. To
change a saved script, run **to-explorer: Edit Quick Scripts**, pick it from the
list, and the form reopens pre-filled with its values. The Quick Script commands
are also available as buttons in the to-explorer activity bar view.

A Quick Script is one of two kinds:

- **Raw script.** Arbitrary script content with a chosen language (for example
  `bat` or `py`). The content is statically checked before it is saved and is
  written to a temporary file when run. Running a raw Quick Script asks for
  confirmation first, the same as **Execute Script**.
- **Find / Replace preset.** A find/replace operation applied to the active
  editor, with the same toggles as the VS Code find widget:
  - **Regular Expression** treats the Find value as a regex.
  - **Case sensitive** matches case when searching.
  - **Replace All** (on by default) replaces every match in one pass. When it is
    off, running the script opens the Find/Replace widget pre-filled with the
    Find and Replace values so you can replace matches one at a time.

For example, a preset with **Regular Expression** on, Find `` {1,}$``, and an
empty Replace trims trailing spaces from every line.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `vscode-to-explorer.openAllFilesExternally` | `false` | Open every double-clicked file in its OS default application. |
| `vscode-to-explorer.fileExtensions` | media/design/CAD/office list | Extensions (without a dot) opened externally when not opening all files. |
| `vscode-to-explorer.openExternally.promptForScripts` | `false` | When a script is double-clicked, ask to **Execute**, **Open in VS Code**, or **Cancel** instead of opening it in the editor. |
| `vscode-to-explorer.openExternally.pickApplicationWhenNoDefault` | `false` | When a file has no OS default application, show an "open with" picker instead of opening it in the editor. |
| `vscode-to-explorer.executeScript.enabled` | `true` | Show the **Execute Script** entry for script files. |
| `vscode-to-explorer.executeScript.confirmBeforeExecute` | `true` | Confirm before running a script. |
| `vscode-to-explorer.scriptExtensions` | common script types | Extensions accepted by **Execute Script**. |
| `vscode-to-explorer.browser.command` | `chrome` | Browser command used for opening URLs. |
| `vscode-to-explorer.browser.openLinksInProfile` | `false` | Route clicked http(s) links (in files and the Markdown preview) through the configured browser and profile. |
| `vscode-to-explorer.browser.useLastProfile` | `false` | Open URLs in the browser's last-used profile, ignoring the profile setting below. |
| `vscode-to-explorer.browser.profile` | `""` | Browser profile, such as `Default`, `Profile 1`, or `2`. Empty opens without a profile. |

### Customizing the file types

`vscode-to-explorer.fileExtensions` lists extensions without a leading dot. The
quickest way to change it is the **Edit File Extensions** panel in the activity
bar view; you can also edit it directly in settings. To also open SVG files in
an external editor, for example, add `svg` to the list:

```json
{
  "vscode-to-explorer.fileExtensions": ["psd", "ai", "svg"]
}
```

Plain SVG and common web image formats (`png`, `jpg`, `gif`, `webp`) are left
out of the defaults so VS Code keeps previewing and editing them inline.

## How it works

The extension listens for newly opened editor tabs. When a tab points at a file
that should open externally, it asks `to-explorer` to launch the file with the
platform default handler (`explorer.exe`, `open`, or `xdg-open`) and then closes
the tab. Scripts are launched through `to-explorer`'s command runner so their
output can be captured and displayed.

## Requirements

- VS Code `1.74.0` or newer.
- The bundled `to-explorer` dependency (installed automatically).

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host with the extension
loaded.

## Manual Installation

```bash
npm install
npm run pre:deploy
```

Press `Ctrl + Shift + X`, then click the top right "Views and More Actions"
icon and select "Install from VSIX..." at the bottom to manually install the
extension in VS Code.

## License

[MIT](LICENSE)
