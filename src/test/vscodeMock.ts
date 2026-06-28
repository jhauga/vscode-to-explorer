/**
 * Installs a require hook that resolves the "vscode" module to a minimal stub.
 *
 * The extension's source files `import * as vscode from "vscode"`, a module that
 * only exists inside the VS Code extension host. To unit-test the pure helper
 * functions in plain Node, import this module *before* importing any extension
 * source so that the `require("vscode")` calls resolve to a harmless stub.
 */
import Module from "node:module";

/** Bare-bones stand-in; the tested functions never touch the VS Code API. */
const vscodeStub: Record<string, unknown> = {};

const loader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = loader._load;

loader._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};
