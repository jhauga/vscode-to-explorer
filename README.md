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
- **Execute scripts from the Explorer.** Right-click an executable script
  (`build.bat`, `deploy.sh`, `setup.ps1`, ...) and choose **Execute Script**.
  A confirmation dialog appears before the script runs, and its output is shown
  in the **to-explorer** output channel.
- **Open links in a browser profile.** Configure a browser and profile (for
  example `Default` or `Profile 2`) and open URLs there with the **Open URL in
  Browser Profile** command.
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
| `Run Quick Script` | Pick a saved Quick Script and run it. |
| `Add Quick Script` | Open a form to configure and save a new Quick Script. |

## Quick Scripts

Quick Scripts are small, named actions you save once and run again from the
editor. Right-click in the editor and choose **Add a to-explorer Quick Script**
(or run **to-explorer: Add Quick Script** from the Command Palette) to open the
configuration form, then use **Run a to-explorer Quick Script** to run one.

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
| `vscode-to-explorer.executeScript.enabled` | `true` | Show the **Execute Script** entry for script files. |
| `vscode-to-explorer.executeScript.confirmBeforeExecute` | `true` | Confirm before running a script. |
| `vscode-to-explorer.scriptExtensions` | common script types | Extensions accepted by **Execute Script**. |
| `vscode-to-explorer.browser.command` | `chrome` | Browser command used for opening URLs. |
| `vscode-to-explorer.browser.profile` | `""` | Browser profile, such as `Default`, `Profile 1`, or `2`. Empty opens without a profile. |

### Customizing the file types

`vscode-to-explorer.fileExtensions` lists extensions without a leading dot. To
also open SVG files in an external editor, for example, add `svg` to the list:

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
npm run compile
npm run pre:deploy
```

Press `Ctrl + Shift + X`, then click the top right "Views and More Actions"
icon and select "Install from VSIX..." at the bottom to manually install the
extension in VS Code.

## License

[MIT](LICENSE)
