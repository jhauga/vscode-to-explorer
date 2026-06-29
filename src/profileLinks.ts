/**
 * Routes clicked http(s) links through the configured browser profile.
 *
 * VS Code's built-in link handling opens URLs in the OS default browser, and the
 * stable API offers no way to override the browser for the rendered Markdown
 * preview's own link clicks (the purpose-built `registerExternalUriOpener` is
 * still a proposed API). This module works within the stable surface:
 *
 *   - a {@link vscode.DocumentLinkProvider} claims http(s) URLs in Markdown,
 *     HTML, and plain-text *source* so Ctrl+Click opens them in the profile, and
 *   - an `extendMarkdownIt` hook rewrites external links in the *rendered*
 *     Markdown preview to the same callback.
 *
 * Both point at a `vscode://<extension id>/open-url?url=...` callback handled by
 * a {@link vscode.UriHandler}, which forwards to the existing
 * `openUrlWithProfile` command. The whole behavior is opt-in via
 * `vscode-to-explorer.browser.openLinksInProfile`; when off, links open as
 * usual.
 */
import * as vscode from "vscode";
import { getConfig } from "./config.js";

/** Matches an http(s) URL; trailing punctuation is trimmed from the match. */
const URL_RE = /\bhttps?:\/\/[^\s<>()[\]"']+/gi;

/** Document languages whose source links are routed through the profile. */
const SELECTOR: vscode.DocumentSelector = [
  { scheme: "file", language: "markdown" },
  { scheme: "file", language: "html" },
  { scheme: "file", language: "plaintext" },
];

/** This extension's id (`publisher.name`), set when the links are registered. */
let extensionId = "";

/** Strip trailing punctuation unlikely to be part of a URL ("x)." -> "x"). */
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, "");
}

/** Build the `vscode://<extension id>/open-url?url=...` callback for a URL. */
function callbackUri(url: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: vscode.env.uriScheme,
    authority: extensionId,
    path: "/open-url",
    query: `url=${encodeURIComponent(url)}`,
  });
}

/** Forward an `open-url` callback to the browser-profile command. */
function handleUri(uri: vscode.Uri): void {
  if (uri.path !== "/open-url") return;
  const url = new URLSearchParams(uri.query).get("url");
  if (!url || !/^https?:\/\//i.test(url)) return;
  void vscode.commands.executeCommand("vscode-to-explorer.openUrlWithProfile", url);
}

/** Turns http(s) URLs in a document's source into browser-profile links. */
class ProfileLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    if (!getConfig(document.uri).browserOpenLinksInProfile) return [];
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    for (const match of text.matchAll(URL_RE)) {
      const url = trimUrl(match[0]);
      const start = match.index ?? 0;
      const range = new vscode.Range(
        document.positionAt(start),
        document.positionAt(start + url.length),
      );
      const link = new vscode.DocumentLink(range, callbackUri(url));
      link.tooltip = "Open in configured browser profile";
      links.push(link);
    }
    return links;
  }
}

/**
 * markdown-it plugin: rewrite external links in the rendered preview to the
 * profile callback. Reads the setting per render so toggling it takes effect on
 * the next preview refresh without re-registering. `md` is the markdown-it
 * instance supplied by VS Code's Markdown preview; it is loosely typed because
 * the extension does not depend on the markdown-it types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extendMarkdownIt(md: any): any {
  const renderToken = (tokens: any, idx: number, options: any, _env: any, self: any): string =>
    self.renderToken(tokens, idx, options);
  const previous = md.renderer.rules.link_open ?? renderToken;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  md.renderer.rules.link_open = (tokens: any, idx: number, options: any, env: any, self: any): string => {
    if (getConfig().browserOpenLinksInProfile) {
      const token = tokens[idx];
      const hrefIndex = token.attrIndex("href");
      if (hrefIndex >= 0) {
        const href: string = token.attrs[hrefIndex][1];
        if (/^https?:\/\//i.test(href)) {
          token.attrs[hrefIndex][1] = callbackUri(href).toString();
        }
      }
    }
    return previous(tokens, idx, options, env, self);
  };

  return md;
}

/**
 * Register the URI handler and document-link provider, and return the
 * `extendMarkdownIt` hook for the extension's `activate` to expose to VS Code's
 * Markdown preview.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerProfileLinks(context: vscode.ExtensionContext): (md: any) => any {
  extensionId = context.extension.id;
  context.subscriptions.push(
    vscode.window.registerUriHandler({ handleUri }),
    vscode.languages.registerDocumentLinkProvider(SELECTOR, new ProfileLinkProvider()),
  );
  return extendMarkdownIt;
}
