import { describe, expect, test } from "bun:test";
import { helpText, parseArgs, UsageError } from "../src/args";

function expectUsage(args: string[], message: string): void {
  let caught: unknown;
  try {
    parseArgs(args);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(UsageError);
  expect(caught instanceof UsageError ? caught.message : null).toBe(message);
}

describe("argument parsing", () => {
  test("recognizes help only when it is the sole argument", () => {
    expect(parseArgs(["--help"])).toEqual({ command: "help" });
    expect(helpText()).toBe(
      [
        "usage: pgnvet check FILE...",
        "       pgnvet fen [--game N] [--ply N] FILE",
        "       pgnvet moves [FEN]",
        "       pgnvet perft DEPTH [FEN]",
      ].join("\n"),
    );
  });

  test("rejects help when another argument follows", () => {
    expectUsage(["--help", "check"], 'unknown command "--help"');
  });

  test("reports a missing command", () => {
    expectUsage([], "missing command (check, fen, moves or perft)");
  });

  test("quotes an unknown command", () => {
    expectUsage(["checkmate"], 'unknown command "checkmate"');
  });

  test("preserves all check file operands in order", () => {
    expect(parseArgs(["check", "first.pgn", "-", "folder\\second.pgn"])).toEqual({
      command: "check",
      files: ["first.pgn", "-", "folder\\second.pgn"],
    });
  });

  test("requires at least one check file", () => {
    expectUsage(["check"], "missing FILE");
  });

  test("allows one standard-input file for check", () => {
    expect(parseArgs(["check", "-"])).toEqual({ command: "check", files: ["-"] });
  });

  test("rejects standard input listed twice for check", () => {
    expectUsage(["check", "-", "game.pgn", "-"], "standard input given twice");
  });

  test("uses default fen selectors", () => {
    expect(parseArgs(["fen", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 1,
      ply: undefined,
    });
  });

  test("accepts separated fen selectors", () => {
    expect(parseArgs(["fen", "--game", "3", "--ply", "12", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 3,
      ply: 12,
    });
  });

  test("accepts equals-form fen selectors", () => {
    expect(parseArgs(["fen", "--game=2", "--ply=0", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 2,
      ply: 0,
    });
  });

  test("accepts mixed separated and equals selector forms", () => {
    expect(parseArgs(["fen", "--game=2", "--ply", "4", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 2,
      ply: 4,
    });
  });

  test("uses the last game and ply selector values", () => {
    expect(parseArgs(["fen", "--game", "2", "--game=4", "--ply=3", "--ply", "8", "x.pgn"])).toEqual(
      {
        command: "fen",
        file: "x.pgn",
        game: 4,
        ply: 8,
      },
    );
  });

  test("consumes a dash-prefixed selector value as the value", () => {
    expectUsage(["fen", "--game", "-1", "game.pgn"], 'invalid --game "-1"');
  });

  test("consumes an option-looking argument as a selector value", () => {
    expectUsage(["fen", "--ply", "--game", "game.pgn"], 'invalid --ply "--game"');
  });

  test("reports a missing game selector value", () => {
    expectUsage(["fen", "game.pgn", "--game"], "--game needs a value");
  });

  test("reports a missing ply selector value", () => {
    expectUsage(["fen", "game.pgn", "--ply"], "--ply needs a value");
  });

  test("reports the leftmost scan error before a later missing selector value", () => {
    expectUsage(["fen", "--bad", "--game"], 'unknown option "--bad"');
  });

  test("completes option scanning before selector and duplicate-stdin validation", () => {
    expectUsage(["fen", "--game=0", "--unknown"], 'unknown option "--unknown"');
    expectUsage(["check", "-", "-", "--unknown"], 'unknown option "--unknown"');
  });

  test("rejects empty inline selectors and depth", () => {
    expectUsage(["fen", "--game=", "game.pgn"], 'invalid --game ""');
    expectUsage(["fen", "--ply=", "game.pgn"], 'invalid --ply ""');
    expectUsage(["perft", ""], 'invalid DEPTH ""');
  });

  test("reports selector validation before operand-count errors", () => {
    expectUsage(["fen", "--game=0"], 'invalid --game "0"');
  });

  test("validates game before ply", () => {
    expectUsage(["fen", "--game=0", "--ply=x", "game.pgn"], 'invalid --game "0"');
  });

  test("requires a fen input file", () => {
    expectUsage(["fen"], "missing FILE");
  });

  test("accepts standard input as a fen input file", () => {
    expect(parseArgs(["fen", "-"])).toEqual({
      command: "fen",
      file: "-",
      game: 1,
      ply: undefined,
    });
  });

  test("rejects multiple fen files", () => {
    expectUsage(["fen", "one.pgn", "two.pgn"], "too many arguments");
  });

  test("rejects options that do not belong to fen", () => {
    expectUsage(["moves", "--game=1"], 'unknown option "--game=1"');
  });

  test("allows moves without an explicit FEN", () => {
    expect(parseArgs(["moves"])).toEqual({ command: "moves", fen: undefined });
  });

  test("preserves a supplied moves FEN", () => {
    expect(parseArgs(["moves", "4k3/8/8/8/8/8/8/4K3 w - - 0 1"])).toEqual({
      command: "moves",
      fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    });
  });

  test("rejects too many moves operands", () => {
    expectUsage(["moves", "fen one", "fen two"], "too many arguments");
  });

  test("requires a perft depth", () => {
    expectUsage(["perft"], "missing DEPTH");
  });

  test("accepts a perft depth with an optional FEN", () => {
    expect(parseArgs(["perft", "2", "4k3/8/8/8/8/8/8/4K3 w - - 0 1"])).toEqual({
      command: "perft",
      depth: 2,
      fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    });
  });

  test("rejects too many perft operands before validating depth", () => {
    expectUsage(["perft", "5", "first FEN", "extra"], "too many arguments");
  });

  test("reports invalid perft depth with its quoted value", () => {
    expectUsage(["perft", "5"], 'invalid DEPTH "5"');
  });

  test("rejects an unknown option before operand validation", () => {
    expectUsage(["perft", "--game", "1"], 'unknown option "--game"');
  });

  test("accepts depth 1 and depth 4 boundaries", () => {
    expect(parseArgs(["perft", "1"])).toEqual({ command: "perft", depth: 1, fen: undefined });
    expect(parseArgs(["perft", "4"])).toEqual({ command: "perft", depth: 4, fen: undefined });
  });

  test("rejects depth zero", () => {
    expectUsage(["perft", "0"], 'invalid DEPTH "0"');
  });

  test("rejects depth above four", () => {
    expectUsage(["perft", "0005"], 'invalid DEPTH "0005"');
  });

  test("accepts nine-digit game and ply values", () => {
    expect(parseArgs(["fen", "--game=999999999", "--ply=999999999", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 999999999,
      ply: 999999999,
    });
  });

  test("rejects zero as a game number", () => {
    expectUsage(["fen", "--game=0", "game.pgn"], 'invalid --game "0"');
  });

  test("accepts zero as a ply", () => {
    expect(parseArgs(["fen", "--ply=0", "game.pgn"])).toEqual({
      command: "fen",
      file: "game.pgn",
      game: 1,
      ply: 0,
    });
  });

  test("rejects signs in game, ply and depth values", () => {
    expectUsage(["fen", "--game=+1", "game.pgn"], 'invalid --game "+1"');
    expectUsage(["fen", "--ply=-1", "game.pgn"], 'invalid --ply "-1"');
    expectUsage(["perft", "+2"], 'invalid DEPTH "+2"');
  });

  test("rejects decimal game, ply and depth values", () => {
    expectUsage(["fen", "--game=1.0", "game.pgn"], 'invalid --game "1.0"');
    expectUsage(["fen", "--ply=0.5", "game.pgn"], 'invalid --ply "0.5"');
    expectUsage(["perft", "2.0"], 'invalid DEPTH "2.0"');
  });

  test("rejects ten-digit game, ply and depth values", () => {
    expectUsage(["fen", "--game=1000000000", "game.pgn"], 'invalid --game "1000000000"');
    expectUsage(["fen", "--ply=1000000000", "game.pgn"], 'invalid --ply "1000000000"');
    expectUsage(["perft", "1000000000"], 'invalid DEPTH "1000000000"');
  });
});
