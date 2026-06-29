/**
 * Thin wrapper around the `to-explorer` package.
 *
 * `to-explorer` ships as an ES module while this extension is compiled to
 * CommonJS for the VS Code extension host. A native dynamic `import()` bridges
 * the two; it is wrapped in a `Function` constructor so the call survives any
 * CommonJS downleveling and stays a real ESM import at runtime.
 */
import * as path from "node:path";

/** Minimal shape of a reported action from `to-explorer`. */
interface ActionResult {
  type: string;
  target: string;
  ok: boolean;
  error?: string;
  detail?: string;
  profile?: string | null;
}

/** Minimal shape of the aggregate result returned by `to-explorer`. */
export interface ToExplorerResult {
  os: string;
  ok: boolean;
  actions: ActionResult[];
}

/** Subset of `to-explorer` run options used by this extension. */
interface RunOptions {
  cwd?: string;
  skipConfigDiscovery?: boolean;
  interactive?: boolean;
  config?: {
    sourceExtensions?: string[];
    binaryExtensions?: string[];
    allowExec?: boolean;
    browser?: { command?: string };
  };
}

interface ToExplorerApi {
  toExplorer: (argv: string[], options?: RunOptions) => Promise<ToExplorerResult>;
  hasDefaultAssociation: (ext: string, osName: string) => boolean;
  detectOs: () => string;
}

const importEsm = new Function("specifier", "return import(specifier);") as <T>(
  specifier: string,
) => Promise<T>;

let apiPromise: Promise<ToExplorerApi> | undefined;

function getApi(): Promise<ToExplorerApi> {
  if (!apiPromise) {
    apiPromise = importEsm<ToExplorerApi>("to-explorer");
  }
  return apiPromise;
}

/** True when every reported action succeeded (or was a deliberate skip). */
export function isResultOk(result: ToExplorerResult): boolean {
  return result.ok;
}

/** First error message found in a result, if any. */
export function firstError(result: ToExplorerResult): string | undefined {
  for (const action of result.actions) {
    if (action.error) return action.error;
  }
  return undefined;
}

/**
 * True when the run took no real action - every reported action was a skip
 * (for example, the "open with" picker was cancelled). Distinguishes "nothing
 * happened" from a genuine open so callers do not close a still-open tab.
 */
export function wasSkipped(result: ToExplorerResult): boolean {
  return result.actions.length > 0 && result.actions.every((a) => a.type === "skip");
}

/**
 * Whether the OS has a default application registered for a file's extension.
 * Reliable on Windows; macOS/Linux conservatively report `true` so callers do
 * not treat every file as unassociated.
 */
export async function hasDefaultApp(fsPath: string): Promise<boolean> {
  const api = await getApi();
  return api.hasDefaultAssociation(path.extname(fsPath), api.detectOs());
}

/**
 * Open a single file or folder in its OS default application. Source/binary
 * classification is bypassed so every path uses the platform default handler
 * (explorer.exe / open / xdg-open) rather than a configured editor.
 */
export async function openExternally(fsPath: string): Promise<ToExplorerResult> {
  const { toExplorer } = await getApi();
  return toExplorer([fsPath], {
    cwd: path.dirname(fsPath),
    skipConfigDiscovery: true,
    config: {
      sourceExtensions: [],
      binaryExtensions: [],
      allowExec: false,
    },
  });
}

/**
 * Open a file externally, falling back to the native "open with" picker when
 * its extension has no default application. Used when the user opts in to being
 * prompted for an application rather than leaving such files in the editor.
 */
export async function openExternallyWithPicker(fsPath: string): Promise<ToExplorerResult> {
  const { toExplorer } = await getApi();
  return toExplorer([fsPath], {
    cwd: path.dirname(fsPath),
    skipConfigDiscovery: true,
    interactive: true,
    config: {
      sourceExtensions: [],
      binaryExtensions: [],
      allowExec: false,
    },
  });
}

/**
 * Run a script file and capture its output. The argument vector is chosen per
 * file type so interpreted scripts launch through the correct runtime.
 */
export async function runScript(fsPath: string): Promise<ToExplorerResult> {
  const { toExplorer } = await getApi();
  const argv = ["--exec", ...execArgvFor(fsPath)];
  return toExplorer(argv, {
    cwd: path.dirname(fsPath),
    skipConfigDiscovery: true,
    config: { allowExec: true },
  });
}

/**
 * Open a URL in the configured browser, optionally selecting a profile. The
 * stored profile label is translated to the selector `to-explorer` expects.
 *
 * Config discovery is left ON here (unlike the file-open helpers) so the browser
 * command and Chrome profiles directory resolve exactly as they do for the
 * `to-explorer` CLI. A bare profile like `2` maps to the on-disk `Profile 2`
 * folder only when that folder is found under the resolved profiles directory;
 * with discovery skipped, a user's custom profiles location is missed and the
 * profile flag is silently dropped, so the browser falls back to its last
 * profile. The extension's browser command is passed as an override only when it
 * is non-default, so a default `chrome` defers entirely to the user's config.
 */
export async function openUrl(
  url: string,
  browserCommand: string,
  profile: string,
): Promise<ToExplorerResult> {
  const { toExplorer } = await getApi();
  const selector = profileSelector(profile);
  const argv = ["--chrome", ...(selector ? [selector] : []), url];
  const overrideBrowser = browserCommand && browserCommand !== "chrome";
  return toExplorer(argv, {
    config: {
      ...(overrideBrowser ? { browser: { command: browserCommand } } : {}),
      allowExec: false,
    },
  });
}

/** Build the `--exec` argument vector for a given script path. */
function execArgvFor(fsPath: string): string[] {
  const ext = path.extname(fsPath).replace(/^\./, "").toLowerCase();
  switch (ext) {
    case "ps1":
      return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fsPath];
    case "sh":
      return ["sh", fsPath];
    case "bash":
    case "command":
      return ["bash", fsPath];
    case "zsh":
      return ["zsh", fsPath];
    case "ksh":
      return ["ksh", fsPath];
    case "fish":
      return ["fish", fsPath];
    case "py":
      return ["python", fsPath];
    case "pl":
      return ["perl", fsPath];
    case "rb":
      return ["ruby", fsPath];
    default:
      // .bat/.cmd and anything else: let to-explorer resolve and run it.
      return [fsPath];
  }
}

/**
 * Translate a human profile label into the selector `--chrome` understands.
 * "Default" -> "default"; "Profile 2"/"2" -> "2"; empty -> no selector.
 */
function profileSelector(profile: string): string | null {
  const trimmed = profile.trim();
  if (trimmed === "") return null;
  if (/^default$/i.test(trimmed)) return "default";
  const match = trimmed.match(/(\d+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}
