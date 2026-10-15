import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readmePath = resolve(dirname(fileURLToPath(import.meta.url)), "../README.md");
const readme = readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n");

const usageBlock = [
  "usage: pgnvet check FILE...",
  "       pgnvet fen [--game N] [--ply N] FILE",
  "       pgnvet moves [FEN]",
  "       pgnvet perft DEPTH [FEN]",
].join("\n");

const gamesPgnBlock = [
  '[Event "Club game"]',
  '[White "Ann"]',
  '[Black "Bob"]',
  '[Result "1-0"]',
  "",
  "1. e4 e5 2. Bc4 {a developing move} Nc6 3. Qh5 $1 Nf6 (3... g6 4. Qf3) 4. Qxf7# 1-0",
  "",
  '[Event "Blitz"]',
  '[Result "1-0"]',
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe6 1-0",
  "",
  '[Event "Two knights"]',
  '[SetUp "1"]',
  '[FEN "4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"]',
  "",
  "1. Nd2 *",
  "",
  '[Event "Marks"]',
  '[Result "1/2-1/2"]',
  "",
  "1. e4 e5 3. Nf3+ Nc6 1-0",
  "",
  '[Event "Fool"]',
  '[Result "1/2-1/2"]',
  "",
  "1. f3 e5 2. g4 ) Qh4# 1/2-1/2",
  "",
  '[Event "Typo"]',
  "",
  "1. d4 d5 2. xyz *",
  "",
  '[Event "Unfinished"]',
  "",
  "1. c4 c5",
].join("\n");

const checkOutputBlock = [
  'games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)',
  'games.pgn:17: PV004 game 3: ambiguous move "Nd2" (Nbd2 or Nfd2)',
  "games.pgn:22: PV005 game 4: move number 3 where 2 was expected",
  'games.pgn:22: PV006 game 4: check mark of "Nf3+": the move gives no check',
  'games.pgn:22: PV007 game 4: Result tag "1/2-1/2" does not match the result marker "1-0"',
  'games.pgn:27: PV001 game 5: unexpected ")"',
  "games.pgn:27: PV009 game 5: the game ended in checkmate, the result should be 0-1",
  'games.pgn:31: PV002 game 6: unreadable move "xyz"',
  "games.pgn:35: PV010 game 7: game has no result marker",
  "9 problems in 6 of 7 games",
].join("\n");

function fencedBlocks(): string[] {
  const pattern = /^\x60\x60\x60([^\n]*)\n([\s\S]*?)^\x60\x60\x60$/gm;
  return [...readme.matchAll(pattern)].map(([, language, content]) =>
    [language, content].join("\n"),
  );
}

describe("README documentation contracts", () => {
  test("names the project and explains its audience and purpose", () => {
    expect(readme.startsWith("# pgnvet\n")).toBe(true);
    expect(readme).toContain(
      "pgnvet is a command-line tool for people who keep chess games as PGN text.",
    );
    expect(readme).toContain("replaying legal chess moves");
    expect(readme).toContain("prints a game's position as FEN");
    expect(readme).toContain("counts move trees with perft");
  });

  test("has the seven required sections in the prescribed order", () => {
    expect(readme.match(/^## .+$/gm)).toEqual([
      "## Install",
      "## Usage",
      "## Rules",
      "## Problems",
      "## PGN",
      "## Exit codes",
      "## Development",
    ]);
  });

  test("documents the Bun install and direct run without a build step", () => {
    expect(readme).toContain("bun install");
    expect(readme).toContain("Run the CLI directly with Bun; no build step is needed:");
    expect(fencedBlocks()[0]).toBe("sh\nbun run src/main.ts check FILE\n");
  });

  test("copies the four usage lines exactly", () => {
    expect(fencedBlocks()[1]).toBe(["", usageBlock, ""].join("\n"));
  });

  test("copies the complete supplied games.pgn example exactly", () => {
    expect(fencedBlocks()[2]).toBe(["pgn", gamesPgnBlock, ""].join("\n"));
  });

  test("copies the complete supplied check output exactly", () => {
    expect(fencedBlocks()[3]).toBe(["", checkOutputBlock, ""].join("\n"));
  });

  test("documents the requested chess, FEN, SAN, move-order and perft rules", () => {
    expect(readme).toContain(
      "standard chess rules for move legality, check, checkmate, and stalemate",
    );
    expect(readme).toContain("It does not apply draw rules beyond stalemate.");
    expect(readme).toContain("six fields");
    expect(readme).toContain("shortest legal disambiguation");
    expect(readme).toContain("sorted by UCI text");
    expect(readme).toContain("counts legal move sequences");
  });

  test("lists every problem code from PV001 through PV010 in order", () => {
    expect([...readme.matchAll(/^- \*\*(PV\d{3})\*\*/gm)].map(([, code]) => code)).toEqual([
      "PV001",
      "PV002",
      "PV003",
      "PV004",
      "PV005",
      "PV006",
      "PV007",
      "PV008",
      "PV009",
      "PV010",
    ]);
  });

  test("explains the PGN encoding, tag and comment conventions", () => {
    expect(readme).toContain("Input is UTF-8. One leading byte-order mark is skipped.");
    expect(readme).toContain("LF ends a line and CR is whitespace.");
    expect(readme).toContain("Repeated tags use the last value.");
    expect(readme).toContain(
      "Brace comments, semicolon-to-end-of-line comments, and nested parenthesized variations are skipped.",
    );
    expect(readme).toContain("The SetUp tag does not affect replay");
  });

  test("documents exact exit-code meanings and output conventions", () => {
    const markdownTick = String.fromCharCode(96);
    expect(readme).toContain("- **0** — the command completed successfully.");
    expect(readme).toContain(
      [
        "- **1** — ",
        markdownTick,
        "check",
        markdownTick,
        " found problems, or ",
        markdownTick,
        "fen",
        markdownTick,
        " could not follow the selected game to the requested position.",
      ].join(""),
    );
    expect(readme).toContain("- **2** — usage, input, or FEN error.");
    expect(readme).toContain(
      "Every exit-2 error is written to standard error, with no standard output.",
    );
    expect(readme).toContain("Standard input is displayed as `<stdin>`");
  });

  test("documents all three development checks and no extra example output", () => {
    expect(fencedBlocks()[4]).toBe("sh\nbun test\nbun run typecheck\nbun run lint\n");
    expect(fencedBlocks()).toHaveLength(5);
    expect(readme).not.toContain("bun build");
  });
});
