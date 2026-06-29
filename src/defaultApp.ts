/**
 * Detect whether the OS default application for a file is VS Code itself.
 *
 * When "open everything externally" is on, handing a file to its OS default app
 * is normally what closes the editor tab. But if that default app *is* VS Code,
 * the OS reopens the file in a new tab, which the interceptor catches and sends
 * out again - an endless open/close loop. Knowing the default is VS Code lets
 * the interceptor leave such files in the editor instead.
 *
 * Detection is reliable on Windows (registry / `assoc` + `ftype`) and Linux
 * (`xdg-mime`). macOS has no dependency-free way to resolve the default handler,
 * so it falls back to "not VS Code" and relies on the interceptor's cooldown
 * guard to break any loop. Results are cached per platform+extension because a
 * file association rarely changes within a session and every lookup spawns a
 * short-lived process.
 */
import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** How long a child detection process may run before being abandoned. */
const PROBE_TIMEOUT_MS = 4000;

/** Cache keyed by `${platform}:${ext}` so each association is probed once. */
const cache = new Map<string, boolean>();

/**
 * True when a registry value, command line, or desktop-entry name points at any
 * VS Code build (stable, Insiders, or VSCodium). Pure and exported for testing.
 */
export function commandLooksLikeVSCode(text: string | undefined | null): boolean {
  if (!text) return false;
  return /(?:^|[\\/])(?:code|code - insiders|vscodium)(?:\.(?:exe|cmd|desktop))?(?:["'\s]|$)/i.test(
    text,
  ) || /\\Microsoft VS Code\b/i.test(text) || /\bvscodium\b/i.test(text);
}

/** Strip a leading dot and lowercase an extension token (".PDF" -> "pdf"). */
function extensionOf(fsPath: string): string {
  return path.extname(fsPath).replace(/^\./, "").toLowerCase();
}

/** Resolve the default-handler ProgId for an extension on Windows. */
async function windowsProgId(ext: string): Promise<string | undefined> {
  const dotExt = `.${ext}`;
  // The user's explicit Open-With choice takes precedence over the class root.
  try {
    const { stdout } = await run(
      "reg",
      [
        "query",
        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${dotExt}\\UserChoice`,
        "/v",
        "ProgId",
      ],
      { timeout: PROBE_TIMEOUT_MS, windowsHide: true },
    );
    const match = stdout.match(/ProgId\s+REG_SZ\s+(.+)\s*$/im);
    if (match?.[1]) return match[1].trim();
  } catch {
    // No explicit user choice; fall back to the registered association below.
  }

  try {
    const comspec = process.env.ComSpec ?? "cmd.exe";
    const { stdout } = await run(comspec, ["/d", "/s", "/c", "assoc", dotExt], {
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    const eq = stdout.indexOf("=");
    if (eq !== -1) return stdout.slice(eq + 1).trim();
  } catch {
    // `assoc` exits non-zero when nothing is registered for the extension.
  }
  return undefined;
}

/** Resolve the open command line for a Windows ProgId. */
async function windowsCommandForProgId(progId: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(
      "reg",
      ["query", `HKCR\\${progId}\\shell\\open\\command`, "/ve"],
      { timeout: PROBE_TIMEOUT_MS, windowsHide: true },
    );
    const match = stdout.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)\s*$/im);
    if (match?.[1]) return match[1].trim();
  } catch {
    // Some ProgIds only expose their command through `ftype`.
  }

  try {
    const comspec = process.env.ComSpec ?? "cmd.exe";
    const { stdout } = await run(comspec, ["/d", "/s", "/c", "ftype", progId], {
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    const eq = stdout.indexOf("=");
    if (eq !== -1) return stdout.slice(eq + 1).trim();
  } catch {
    // No file-type command registered for this ProgId.
  }
  return undefined;
}

/** Windows detection: ProgId name or its resolved command implicates VS Code. */
async function detectWindows(ext: string): Promise<boolean> {
  const progId = await windowsProgId(ext);
  if (!progId) return false;
  if (commandLooksLikeVSCode(progId)) return true;
  const command = await windowsCommandForProgId(progId);
  return commandLooksLikeVSCode(command);
}

/** Linux detection: resolve the MIME default `.desktop` entry via xdg-mime. */
async function detectLinux(fsPath: string): Promise<boolean> {
  try {
    const mime = (
      await run("xdg-mime", ["query", "filetype", fsPath], {
        timeout: PROBE_TIMEOUT_MS,
      })
    ).stdout.trim();
    if (!mime) return false;
    const desktop = (
      await run("xdg-mime", ["query", "default", mime], {
        timeout: PROBE_TIMEOUT_MS,
      })
    ).stdout.trim();
    return commandLooksLikeVSCode(desktop);
  } catch {
    return false;
  }
}

/**
 * Resolve whether the OS would open `fsPath` in VS Code by default. Never
 * throws: any detection failure resolves to `false` so files still open
 * externally as before.
 */
export async function defaultAppIsVSCode(fsPath: string): Promise<boolean> {
  const ext = extensionOf(fsPath);
  if (!ext) return false; // Extension-less files: let the OS decide as usual.

  const platform = os.platform();
  const key = `${platform}:${ext}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    if (platform === "win32") {
      result = await detectWindows(ext);
    } else if (platform === "linux") {
      result = await detectLinux(fsPath);
    }
    // macOS and anything else: rely on the interceptor's cooldown safety net.
  } catch {
    result = false;
  }

  cache.set(key, result);
  return result;
}

/** Clear the detection cache (primarily for tests). */
export function clearDefaultAppCache(): void {
  cache.clear();
}
