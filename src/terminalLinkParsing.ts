/**
 * Pure helpers that find links in text: http(s) URLs and file paths. They power
 * the terminal link provider in `terminalLinks.ts`, and `findUrls` is also used
 * by the editor link provider in `profileLinks.ts` so both surfaces agree on
 * what counts as a URL.
 *
 * Nothing here imports `vscode`, so the parsing can be unit-tested in plain
 * Node. Path detection favors recall over precision: any token that looks like
 * a file name with an extension is reported, and the caller narrows the list by
 * the configured extensions and by checking the file on disk.
 */
import * as path from "node:path";

/** A matched run of text within a line, by character offset. */
export interface LineSpan {
  /** Offset of the first matched character within the searched text. */
  start: number;
  /** Number of characters covered by the match. */
  length: number;
  /** The matched text, without surrounding quotes, punctuation, or a location suffix. */
  text: string;
}

/**
 * A fresh http(s) URL pattern. A new instance is built on every call because a
 * global regex carries `lastIndex` state, and link providers may run
 * concurrently (the terminal link API warns against sharing one).
 */
function urlPattern(): RegExp {
  return /\bhttps?:\/\/[^\s<>()[\]"']+/gi;
}

/** Strip trailing punctuation unlikely to be part of a URL ("x." -> "x"). */
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, "");
}

/** Find every http(s) URL in a line or a whole document. */
export function findUrls(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  for (const match of text.matchAll(urlPattern())) {
    const url = trimUrl(match[0]);
    // A bare scheme left over after trimming ("http://.") is not a link.
    if (!/^https?:\/\/[^/]/i.test(url)) continue;
    spans.push({ start: match.index ?? 0, length: url.length, text: url });
  }
  return spans;
}

/** Leading characters that wrap a path but are not part of it. */
const LEADING_NOISE = /^[\s([{<'"`]+/;

/** Trailing characters that end a sentence or a wrapper rather than a path. */
const TRAILING_NOISE = /[\s.,;:!?)\]}>'"`]+$/;

/** A trailing `:line`, `:line:col`, or `(line,col)` location suffix. */
const LOCATION_SUFFIX = /(?::\d+){1,2}$|\(\d+(?:,\d+)?\)?$/;

/** A URI scheme such as `file://` or `ftp://`. Two or more letters, so `C:/` is not one. */
const URI_SCHEME = /^[a-z][a-z0-9+.-]+:\/\//i;

/**
 * The final path segment has a name and an extension. The character before the
 * last dot must belong to the name, so `.gitignore` and `dir/.env` do not count.
 */
const NAME_WITH_EXTENSION = /[^.\\/]\.[a-z0-9][a-z0-9_+-]*$/i;

/** Remove location suffixes and trailing punctuation until neither remains. */
function cleanTail(raw: string): string {
  let text = raw;
  for (;;) {
    const next = text.replace(LOCATION_SUFFIX, "").replace(TRAILING_NOISE, "");
    if (next === text) return text;
    text = next;
  }
}

/** Turn a raw token into a path span, or `undefined` when it is not path-like. */
function toPathSpan(raw: string, rawStart: number): LineSpan | undefined {
  const lead = LEADING_NOISE.exec(raw)?.[0].length ?? 0;
  const text = cleanTail(raw.slice(lead));
  if (text === "" || URI_SCHEME.test(text) || !NAME_WITH_EXTENSION.test(text)) {
    return undefined;
  }
  return { start: rawStart + lead, length: text.length, text };
}

/** True when two spans share at least one character. */
function overlaps(a: LineSpan, b: LineSpan): boolean {
  return a.start < b.start + b.length && b.start < a.start + a.length;
}

/**
 * Find text in a line that looks like a file path with an extension: Windows
 * drive and UNC paths, POSIX and relative paths, bare `name.ext` tokens, and
 * quoted paths that contain spaces. Trailing punctuation and `:line:col` or
 * `(line,col)` suffixes are removed. Spans that overlap `exclude` (typically
 * the URLs on the same line) are dropped, as are other URI schemes.
 */
export function findPathCandidates(line: string, exclude: readonly LineSpan[] = []): LineSpan[] {
  const found: LineSpan[] = [];
  const taken = (span: LineSpan): boolean =>
    exclude.some((other) => overlaps(span, other)) ||
    found.some((other) => overlaps(span, other));

  // Quoted runs first, so a path with spaces is matched whole. When a run is
  // rejected, scanning resumes one character later: an apostrophe earlier in
  // the line ("it's") must not swallow the opening quote of a real path.
  const quoted = /"([^"\r\n]+)"|'([^'\r\n]+)'/g;
  for (let match = quoted.exec(line); match !== null; match = quoted.exec(line)) {
    const span = toPathSpan(match[1] ?? match[2] ?? "", match.index + 1);
    if (span && !taken(span)) {
      found.push(span);
    } else {
      quoted.lastIndex = match.index + 1;
    }
  }

  // Then whitespace-separated tokens, skipping any inside an accepted quote.
  for (const match of line.matchAll(/[^\s"'`<>|]+/g)) {
    const span = toPathSpan(match[0], match.index ?? 0);
    if (span && !taken(span)) found.push(span);
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * Resolve a path found in terminal output to an absolute path. `~/` resolves
 * against `homeDir`, absolute paths are returned unchanged, and relative paths
 * join `cwd`. Returns `undefined` for a relative path when the working
 * directory is unknown. `pathApi` selects Windows or POSIX rules and defaults
 * to the current platform.
 */
export function resolveCandidate(
  text: string,
  cwd: string | undefined,
  homeDir: string,
  pathApi: path.PlatformPath = path,
): string | undefined {
  if (text === "") return undefined;
  if (/^~[\\/]/.test(text)) return pathApi.join(homeDir, text.slice(2));
  if (pathApi.isAbsolute(text)) return text;
  if (!cwd) return undefined;
  return pathApi.join(cwd, text);
}
