import { describe, expect, test } from "bun:test";
import { plural, show } from "../src/text";

describe("show", () => {
  test("wraps an empty value in double quotes", () => {
    expect(show("")).toBe('""');
  });

  test("preserves the lowest printable ASCII character", () => {
    expect(show("!")).toBe('"!"');
  });

  test("preserves the highest printable ASCII character", () => {
    expect(show("~")).toBe('"~"');
  });

  test("replaces a space with one question mark", () => {
    expect(show(" ")).toBe('"?"');
  });

  test("replaces tab and line feed separately", () => {
    expect(show("\t\n")).toBe('"??"');
  });

  test("preserves printable punctuation, including quotes and backslashes", () => {
    expect(show('a"b\\c')).toBe('"a"b\\c"');
  });

  test("replaces a non-ASCII character with one question mark", () => {
    expect(show("é")).toBe('"?"');
  });

  test("replaces a supplementary code point with one question mark", () => {
    expect(show("😀")).toBe('"?"');
  });

  test("replaces each non-ASCII code point independently", () => {
    expect(show("é😀")).toBe('"??"');
  });

  test("preserves adjacent printable boundary characters", () => {
    expect(show("!~")).toBe('"!~"');
  });

  test("replaces a control character between printable characters", () => {
    expect(show("a\u0000b")).toBe('"a?b"');
  });
});

describe("plural", () => {
  test("uses the singular form for exactly one", () => {
    expect(plural(1, "move", "moves")).toBe("move");
  });

  test("uses the plural form for zero", () => {
    expect(plural(0, "move", "moves")).toBe("moves");
  });

  test("uses the plural form for two", () => {
    expect(plural(2, "game", "games")).toBe("games");
  });

  test("uses the plural form for negative values", () => {
    expect(plural(-1, "item", "items")).toBe("items");
  });

  test("uses the plural form for a non-integer value", () => {
    expect(plural(1.5, "item", "items")).toBe("items");
  });
});
