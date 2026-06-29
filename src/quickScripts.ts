/**
 * Data model, persistence, and pure helpers for to-explorer Quick Scripts.
 *
 * A Quick Script is a small, named, reusable action the user saves once and
 * runs from the editor. Two kinds are supported:
 *   - "raw": arbitrary script content (run like a script file), and
 *   - "findReplace": a configured find/replace preset applied to the editor.
 *
 * The pure functions here (validation and find/replace evaluation) carry no
 * dependency on the VS Code API so they can be unit-tested in plain Node.
 */
import type * as vscode from "vscode";

/** Discriminates the two Quick Script kinds. */
export type QuickScriptKind = "raw" | "findReplace";

/** A Quick Script holding raw script content run like a script file. */
export interface RawQuickScript {
  id: string;
  kind: "raw";
  name: string;
  /** Script extension token without a dot (e.g. "bat", "ps1", "py"). */
  language: string;
  /** Raw script body written to a temp file and executed on run. */
  content: string;
}

/** A Quick Script describing a find/replace preset applied to the editor. */
export interface FindReplaceQuickScript {
  id: string;
  kind: "findReplace";
  name: string;
  /** Search text or regular-expression source. */
  find: string;
  /** Replacement text (supports $1 capture references in regex mode). */
  replace: string;
  /** Treat `find` as a regular expression. */
  regex: boolean;
  /** Match case when searching. */
  caseSensitive: boolean;
  /** Replace every match in one pass; when false, open the find widget. */
  replaceAll: boolean;
}

/** Any persisted Quick Script. */
export type QuickScript = RawQuickScript | FindReplaceQuickScript;

/** Global-state key under which the Quick Script list is stored. */
export const QUICK_SCRIPTS_KEY = "vscode-to-explorer.quickScripts";

/** Largest raw script accepted, guarding against accidental huge pastes. */
const MAX_RAW_SCRIPT_LENGTH = 100_000;

/** Outcome of a validation check. */
export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/** Narrow an untrusted stored value to a Quick Script. */
function isQuickScript(value: unknown): value is QuickScript {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.name !== "string") return false;
  if (v.kind === "raw") {
    return typeof v.content === "string" && typeof v.language === "string";
  }
  if (v.kind === "findReplace") {
    return (
      typeof v.find === "string" &&
      typeof v.replace === "string" &&
      typeof v.regex === "boolean" &&
      typeof v.caseSensitive === "boolean" &&
      typeof v.replaceAll === "boolean"
    );
  }
  return false;
}

/** Read every saved Quick Script, ignoring any malformed entries. */
export function loadQuickScripts(context: vscode.ExtensionContext): QuickScript[] {
  const stored = context.globalState.get<unknown[]>(QUICK_SCRIPTS_KEY, []);
  return Array.isArray(stored) ? stored.filter(isQuickScript) : [];
}

/** Append a Quick Script to the persisted list. */
export async function saveQuickScript(
  context: vscode.ExtensionContext,
  script: QuickScript,
): Promise<void> {
  const scripts = loadQuickScripts(context);
  scripts.push(script);
  await context.globalState.update(QUICK_SCRIPTS_KEY, scripts);
}

/** Replace the persisted Quick Script that shares an id, or append if new. */
export async function updateQuickScript(
  context: vscode.ExtensionContext,
  script: QuickScript,
): Promise<void> {
  const scripts = loadQuickScripts(context);
  const index = scripts.findIndex((existing) => existing.id === script.id);
  if (index === -1) {
    scripts.push(script);
  } else {
    scripts[index] = script;
  }
  await context.globalState.update(QUICK_SCRIPTS_KEY, scripts);
}

/** Escape a literal string for safe embedding in a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Subset of a find/replace script needed to evaluate the operation. */
export type FindReplaceConfig = Pick<
  FindReplaceQuickScript,
  "find" | "replace" | "regex" | "caseSensitive"
>;

/** Build the global regular expression used to apply a find/replace. */
export function buildFindRegex(config: FindReplaceConfig): RegExp {
  const pattern = config.regex ? config.find : escapeRegExp(config.find);
  // "g" replaces every match; "m" anchors ^/$ to line boundaries so patterns
  // such as " {1,}$" trim trailing spaces on each line, matching the VS Code
  // find behavior. "i" is added when the search is case-insensitive.
  const flags = config.caseSensitive ? "gm" : "gmi";
  return new RegExp(pattern, flags);
}

/** Result of applying a find/replace to text. */
export interface FindReplaceOutcome {
  text: string;
  count: number;
}

/** Apply a find/replace preset to text and report how many matches changed. */
export function applyFindReplace(text: string, config: FindReplaceConfig): FindReplaceOutcome {
  const regex = buildFindRegex(config);
  const matches = text.match(regex);
  const count = matches ? matches.length : 0;
  if (count === 0) return { text, count: 0 };
  // In literal mode, neutralize "$" so it is not read as a capture reference.
  const replacement = config.regex ? config.replace : config.replace.replace(/\$/g, "$$$$");
  return { text: text.replace(regex, replacement), count };
}

/** Statically validate raw script content without ever executing it. */
export function validateRawScript(content: string): ValidationResult {
  if (content.trim() === "") return { ok: false, reason: "The script is empty." };
  if (content.length > MAX_RAW_SCRIPT_LENGTH) {
    return { ok: false, reason: "The script is too large to save as a Quick Script." };
  }
  if (content.includes("\u0000")) {
    return { ok: false, reason: "The script contains a null character." };
  }
  return { ok: true };
}

/** Validate a find/replace preset, compiling the pattern in regex mode. */
export function validateFindReplace(config: FindReplaceConfig): ValidationResult {
  if (config.find === "") return { ok: false, reason: "The Find field is required." };
  if (config.regex) {
    try {
      // Compile in isolation purely to surface a syntax error to the user.
      void new RegExp(config.find);
    } catch (err) {
      return { ok: false, reason: `Invalid regular expression: ${(err as Error).message}` };
    }
  }
  return { ok: true };
}

/** Short human label describing a Quick Script for menus and pickers. */
export function describeQuickScript(script: QuickScript): string {
  if (script.kind === "raw") return `Raw script • .${script.language}`;
  const scope = script.replaceAll ? "replace all" : "open find widget";
  return `Find / Replace • ${scope}`;
}
