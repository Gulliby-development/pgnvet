import { describe, expect, test } from "bun:test";
import { type Io, run } from "../src/cli";
import { lexPgn, type PgnItem } from "../src/pgn-lexer";

function summarize(item: PgnItem): readonly unknown[] {
  switch (item.kind) {
    case "tag":
      return [item.kind, item.name, item.value, item.line, item.offset];
    case "move-number":
      return [item.kind, item.value, item.number, item.dots, item.line, item.offset];
    case "move":
      return [item.kind, item.value, item.line, item.offset];
    case "result":
      return [item.kind, item.value, item.line, item.offset];
    case "fault":
      return [item.kind, item.code, item.message, item.boundary, item.line, item.offset];
  }
}

function lexSummary(text: string): readonly (readonly unknown[])[] {
  return lexPgn(text).map(summarize);
}

function runWithFiles(files: ReadonlyMap<string, Uint8Array>, args: string[]) {
  let stdout = "";
  let stderr = "";
  const io: Io = {
    readStdin: () => new Uint8Array(),
    readFile: (path) => {
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error("missing in-memory file");
      return bytes;
    },
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  };

  return { status: run(args, io), stdout, stderr };
}

describe("lexPgn", () => {
  test("recognizes move numbers, moves and a result in source order", () => {
    expect(lexSummary("1. e4 e5 1-0")).toEqual([
      ["move-number", "1.", 1, ".", 1, 0],
      ["move", "e4", 1, 3],
      ["move", "e5", 1, 6],
      ["result", "1-0", 1, 9],
    ]);
  });

  test("recognizes every result marker", () => {
    expect(lexSummary("1-0 0-1 1/2-1/2 *")).toEqual([
      ["result", "1-0", 1, 0],
      ["result", "0-1", 1, 4],
      ["result", "1/2-1/2", 1, 8],
      ["result", "*", 1, 16],
    ]);
  });

  test("skips a brace comment between symbols", () => {
    expect(lexSummary("e4 {a comment} e5")).toEqual([
      ["move", "e4", 1, 0],
      ["move", "e5", 1, 15],
    ]);
  });

  test("advances the line count through a multiline brace comment", () => {
    expect(lexSummary("e4 {first\nsecond}\ne5")).toEqual([
      ["move", "e4", 1, 0],
      ["move", "e5", 3, 18],
    ]);
  });

  test("reports an unterminated comment at its opener and drops the rest", () => {
    expect(lexSummary("e4\n{open\n1. e5")).toEqual([
      ["move", "e4", 1, 0],
      ["fault", "PV001", "unterminated comment", "other", 2, 3],
    ]);
  });

  test("skips semicolon comments through the end of a CRLF line", () => {
    expect(lexSummary('1. e4 ; ) ] " ignored\r\n2. d4 *')).toEqual([
      ["move-number", "1.", 1, ".", 1, 0],
      ["move", "e4", 1, 3],
      ["move-number", "2.", 2, ".", 2, 23],
      ["move", "d4", 2, 26],
      ["result", "*", 2, 29],
    ]);
  });

  test("skips nested variations and ignores parentheses inside brace comments", () => {
    expect(lexSummary("1. e4 (1. d4 {not ) a close} (1...Nf6)) e5 *")).toEqual([
      ["move-number", "1.", 1, ".", 1, 0],
      ["move", "e4", 1, 3],
      ["move", "e5", 1, 40],
      ["result", "*", 1, 43],
    ]);
  });

  test("ignores closing parentheses inside semicolon comments in variations", () => {
    expect(lexSummary("e4 (1. d4 ; ) is comment\n) e5 *")).toEqual([
      ["move", "e4", 1, 0],
      ["move", "e5", 2, 27],
      ["result", "*", 2, 30],
    ]);
  });

  test("reports an unterminated variation at its opener and drops the rest", () => {
    expect(lexSummary("e4\n(1. d4\n2. c4")).toEqual([
      ["move", "e4", 1, 0],
      ["fault", "PV001", "unterminated variation", "other", 2, 3],
    ]);
  });

  test("reports an unterminated brace comment inside a variation", () => {
    expect(lexSummary("(1. d4 {open")).toEqual([
      ["fault", "PV001", "unterminated comment", "other", 1, 7],
    ]);
  });

  test("reports and skips a stray closing parenthesis", () => {
    expect(lexSummary(") e4")).toEqual([
      ["fault", "PV001", 'unexpected ")"', "other", 1, 0],
      ["move", "e4", 1, 2],
    ]);
  });

  test("reports and skips a stray closing bracket", () => {
    expect(lexSummary("] e4")).toEqual([
      ["fault", "PV001", 'unexpected "]"', "other", 1, 0],
      ["move", "e4", 1, 2],
    ]);
  });

  test("reports and skips a stray double quote", () => {
    expect(lexSummary('" e4')).toEqual([
      ["fault", "PV001", 'unexpected """', "other", 1, 0],
      ["move", "e4", 1, 2],
    ]);
  });

  test("parses tag spacing and letter-led names with digits and underscores", () => {
    expect(lexSummary('[ \tEvent_2 \t"Club"\t ]')).toEqual([["tag", "Event_2", "Club", 1, 0]]);
  });

  test("decodes escaped quotes and backslashes but preserves other backslashes", () => {
    const input = String.raw`[Note "quote: \" and slash: \\; other: \q"]`;

    expect(lexSummary(input)).toEqual([
      ["tag", "Note", 'quote: " and slash: \\; other: \\q', 1, 0],
    ]);
  });

  test("emits duplicate tags in source order for last-wins grouping", () => {
    expect(lexSummary('[Event "First"]\n[Event "Last"]')).toEqual([
      ["tag", "Event", "First", 1, 0],
      ["tag", "Event", "Last", 2, 16],
    ]);
  });

  test("rejects a tag with a missing value and skips the rest of its line", () => {
    expect(lexSummary("[Event nope] ignored\n1. e4 *")).toEqual([
      ["fault", "PV001", "invalid tag pair", "tag", 1, 0],
      ["move-number", "1.", 1, ".", 2, 21],
      ["move", "e4", 2, 24],
      ["result", "*", 2, 27],
    ]);
  });

  test("rejects a tag name that does not start with a letter", () => {
    expect(lexSummary('[1Event "Bad"]\n1. e4 *')).toEqual([
      ["fault", "PV001", "invalid tag pair", "tag", 1, 0],
      ["move-number", "1.", 1, ".", 2, 15],
      ["move", "e4", 2, 18],
      ["result", "*", 2, 21],
    ]);
  });

  test("rejects a line break inside a tag value and resumes on the next line", () => {
    expect(lexSummary('[Event "unfinished\n1. e4 *')).toEqual([
      ["fault", "PV001", "invalid tag pair", "tag", 1, 0],
      ["move-number", "1.", 1, ".", 2, 19],
      ["move", "e4", 2, 22],
      ["result", "*", 2, 25],
    ]);
  });

  test("skips a numeric NAG but retains a nonnumeric dollar symbol", () => {
    expect(lexSummary("$1 $ $12x $007")).toEqual([
      ["move", "$", 1, 3],
      ["move", "$12x", 1, 5],
    ]);
  });

  test("recognizes one or more dots after a one-to-nine-digit move number", () => {
    expect(lexSummary("1. 12.. 999999999...")).toEqual([
      ["move-number", "1.", 1, ".", 1, 0],
      ["move-number", "12..", 12, "..", 1, 3],
      ["move-number", "999999999...", 999999999, "...", 1, 8],
    ]);
  });

  test("treats a ten-digit dotted symbol as a move, not a move number", () => {
    expect(lexSummary("1000000000.")).toEqual([["move", "1000000000.", 1, 0]]);
  });

  test("splits a glued white move number and preserves the move offset", () => {
    expect(lexSummary("12.e4")).toEqual([
      ["move-number", "12.", 12, ".", 1, 0],
      ["move", "e4", 1, 3],
    ]);
  });

  test("splits a glued black move number with three dots", () => {
    expect(lexSummary("12...Nf6")).toEqual([
      ["move-number", "12...", 12, "...", 1, 0],
      ["move", "Nf6", 1, 5],
    ]);
  });

  test("splits a move number glued to a move after a CRLF", () => {
    expect(lexSummary("e4\r\n3...Qh4")).toEqual([
      ["move", "e4", 1, 0],
      ["move-number", "3...", 3, "...", 2, 4],
      ["move", "Qh4", 2, 8],
    ]);
  });

  test("keeps token locations at the start of each symbol", () => {
    expect(lexSummary("  \te4   Nf3")).toEqual([
      ["move", "e4", 1, 3],
      ["move", "Nf3", 1, 8],
    ]);
  });

  test("removes exactly one leading BOM", () => {
    expect(lexSummary("\uFEFF1. e4 *")).toEqual([
      ["move-number", "1.", 1, ".", 1, 1],
      ["move", "e4", 1, 4],
      ["result", "*", 1, 7],
    ]);
  });

  test("retains a second leading BOM as part of the next symbol", () => {
    expect(lexSummary("\uFEFF\uFEFF1. e4 *")).toEqual([
      ["move", "\uFEFF1.", 1, 1],
      ["move", "e4", 1, 5],
      ["result", "*", 1, 8],
    ]);
  });
});

describe("BOM handling through injected Io", () => {
  test("the Map-backed file input path accepts a single leading BOM", () => {
    const files = new Map([["single-bom.pgn", new TextEncoder().encode("\uFEFF1. e4 *")]]);

    expect(runWithFiles(files, ["check", "single-bom.pgn"])).toEqual({
      status: 0,
      stdout: "ok, 1 game, 1 move\n",
      stderr: "",
    });
  });

  test("the Map-backed file input path preserves a second leading BOM", () => {
    const files = new Map([["double-bom.pgn", new TextEncoder().encode("\uFEFF\uFEFF1. e4 *")]]);

    expect(runWithFiles(files, ["check", "double-bom.pgn"])).toEqual({
      status: 1,
      stdout: 'double-bom.pgn:1: PV002 game 1: unreadable move "?1."\n1 problem in 1 of 1 game\n',
      stderr: "",
    });
  });

  test("the Map-backed stdin path skips one BOM before lexing", () => {
    const stdin = new TextEncoder().encode("\uFEFF1. e4 *");
    const io: Io = {
      readStdin: () => stdin,
      readFile: () => {
        throw new Error("stdin should not read a file");
      },
      out: (text) => {
        output += text;
      },
      err: (text) => {
        errors += text;
      },
    };
    let output = "";
    let errors = "";

    expect(run(["check", "-"], io)).toBe(0);
    expect(output).toBe("ok, 1 game, 1 move\n");
    expect(errors).toBe("");
  });
});
