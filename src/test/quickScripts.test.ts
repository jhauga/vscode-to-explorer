/**
 * Unit tests for the pure Quick Script helpers: find/replace evaluation and the
 * validation predicates. These run in plain Node without the extension host.
 */
import "./vscodeMock.js"; // Must come first: stubs "vscode" before modules load.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyFindReplace,
  buildFindRegex,
  describeQuickScript,
  escapeRegExp,
  validateFindReplace,
  validateRawScript,
} from "../quickScripts.js";

describe("escapeRegExp", () => {
  test("escapes regex metacharacters", () => {
    assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
    assert.equal(escapeRegExp("(x)$"), "\\(x\\)\\$");
  });
});

describe("buildFindRegex", () => {
  test("adds the case-insensitive flag unless case sensitive", () => {
    const insensitive = buildFindRegex({ find: "a", replace: "", regex: true, caseSensitive: false });
    assert.equal(insensitive.flags, "gim");
    const sensitive = buildFindRegex({ find: "a", replace: "", regex: true, caseSensitive: true });
    assert.equal(sensitive.flags, "gm");
  });

  test("escapes the pattern in literal mode", () => {
    const re = buildFindRegex({ find: "a.b", replace: "", regex: false, caseSensitive: true });
    assert.equal(re.test("axb"), false);
    assert.equal(re.test("a.b"), true);
  });
});

describe("applyFindReplace", () => {
  test("trims trailing spaces on every line (the default preset)", () => {
    const input = "alpha   \nbeta \ngamma\n";
    const { text, count } = applyFindReplace(input, {
      find: " {1,}$",
      replace: "",
      regex: true,
      caseSensitive: false,
    });
    assert.equal(text, "alpha\nbeta\ngamma\n");
    assert.equal(count, 2);
  });

  test("reports zero matches and leaves text untouched", () => {
    const input = "no trailing spaces here";
    const result = applyFindReplace(input, {
      find: " {1,}$",
      replace: "",
      regex: true,
      caseSensitive: false,
    });
    assert.equal(result.count, 0);
    assert.equal(result.text, input);
  });

  test("honors capture references in regex mode", () => {
    const result = applyFindReplace("2026-06-29", {
      find: "(\\d{4})-(\\d{2})-(\\d{2})",
      replace: "$3/$2/$1",
      regex: true,
      caseSensitive: true,
    });
    assert.equal(result.text, "29/06/2026");
    assert.equal(result.count, 1);
  });

  test("treats $ literally in non-regex mode", () => {
    const result = applyFindReplace("price PLACEHOLDER end", {
      find: "PLACEHOLDER",
      replace: "$5",
      regex: false,
      caseSensitive: true,
    });
    assert.equal(result.text, "price $5 end");
    assert.equal(result.count, 1);
  });

  test("matches case-insensitively when configured", () => {
    const result = applyFindReplace("Foo foo FOO", {
      find: "foo",
      replace: "bar",
      regex: false,
      caseSensitive: false,
    });
    assert.equal(result.text, "bar bar bar");
    assert.equal(result.count, 3);
  });
});

describe("validateRawScript", () => {
  test("accepts non-empty content", () => {
    assert.deepEqual(validateRawScript("echo hello"), { ok: true });
  });

  test("rejects empty or whitespace-only content", () => {
    assert.equal(validateRawScript("   \n\t").ok, false);
  });

  test("rejects content with a null character", () => {
    assert.equal(validateRawScript("echo\u0000bad").ok, false);
  });
});

describe("validateFindReplace", () => {
  test("requires a find value", () => {
    const result = validateFindReplace({ find: "", replace: "", regex: false, caseSensitive: false });
    assert.equal(result.ok, false);
  });

  test("rejects an invalid regular expression", () => {
    const result = validateFindReplace({ find: "(", replace: "", regex: true, caseSensitive: false });
    assert.equal(result.ok, false);
  });

  test("accepts a valid regular expression", () => {
    const result = validateFindReplace({ find: " {1,}$", replace: "", regex: true, caseSensitive: false });
    assert.deepEqual(result, { ok: true });
  });
});

describe("describeQuickScript", () => {
  test("summarizes a raw script", () => {
    assert.equal(
      describeQuickScript({ id: "1", kind: "raw", name: "x", language: "bat", content: "echo hi" }),
      "Raw script • .bat",
    );
  });

  test("summarizes a find/replace script", () => {
    assert.equal(
      describeQuickScript({
        id: "2",
        kind: "findReplace",
        name: "trim",
        find: " {1,}$",
        replace: "",
        regex: true,
        caseSensitive: false,
        replaceAll: true,
      }),
      "Find / Replace • replace all",
    );
  });
});
