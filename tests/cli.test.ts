import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Io, run } from "../src/cli";

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  reads: string[];
}

function runWithFiles(
  args: string[],
  files: ReadonlyMap<string, Uint8Array> = new Map(),
  stdin: Uint8Array = new Uint8Array(),
): RunResult {
  let stdout = "";
  let stderr = "";
  const reads: string[] = [];
  const io: Io = {
    readStdin: () => {
      reads.push("<stdin>");
      return stdin;
    },
    readFile: (path) => {
      reads.push(path);
      const value = files.get(path);
      if (value === undefined) throw new Error("missing in-memory file");
      return value;
    },
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  };

  return { status: run(args, io), stdout, stderr, reads };
}

const gamesPgn = `[Event "Club game"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 {a developing move} Nc6 3. Qh5 $1 Nf6 (3... g6 4. Qf3) 4. Qxf7# 1-0

[Event "Blitz"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe6 1-0

[Event "Two knights"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"]

1. Nd2 *

[Event "Marks"]
[Result "1/2-1/2"]

1. e4 e5 3. Nf3+ Nc6 1-0

[Event "Fool"]
[Result "1/2-1/2"]

1. f3 e5 2. g4 ) Qh4# 1/2-1/2

[Event "Typo"]

1. d4 d5 2. xyz *

[Event "Unfinished"]

1. c4 c5`;

describe("CLI", () => {
  test("prints the exact help text only for the sole --help argument", () => {
    expect(runWithFiles(["--help"])).toEqual({
      status: 0,
      stdout:
        "usage: pgnvet check FILE...\n" +
        "       pgnvet fen [--game N] [--ply N] FILE\n" +
        "       pgnvet moves [FEN]\n" +
        "       pgnvet perft DEPTH [FEN]\n",
      stderr: "",
      reads: [],
    });
  });

  test("reports a missing command on stderr with exit code 2", () => {
    expect(runWithFiles([])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: missing command (check, fen, moves or perft)\n",
      reads: [],
    });
  });

  test("quotes an unknown command and leaves stdout empty", () => {
    expect(runWithFiles(["chess"])).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: unknown command "chess"\n',
      reads: [],
    });
  });

  test("reports unknown options before operand-count errors", () => {
    expect(runWithFiles(["moves", "--game", "1"])).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: unknown option "--game"\n',
      reads: [],
    });
  });

  test("consumes a dash-prefixed selector value before validating it", () => {
    expect(runWithFiles(["fen", "--game", "--bad", "game.pgn"])).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: invalid --game "--bad"\n',
      reads: [],
    });
  });

  test("validates --game before --ply and before operand counts", () => {
    expect(runWithFiles(["fen", "--game=0", "--ply=x"])).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: invalid --game "0"\n',
      reads: [],
    });
  });

  test("reports a missing file and a missing perft depth", () => {
    expect(runWithFiles(["fen"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: missing FILE\n",
      reads: [],
    });
    expect(runWithFiles(["perft"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: missing DEPTH\n",
      reads: [],
    });
  });

  test("rejects extra operands before validating the perft depth", () => {
    expect(runWithFiles(["perft", "5", "one FEN", "extra"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: too many arguments\n",
      reads: [],
    });
  });

  test("rejects a depth outside the supported range", () => {
    expect(runWithFiles(["perft", "5"])).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: invalid DEPTH "5"\n',
      reads: [],
    });
  });

  test("rejects two stdin operands before reading either", () => {
    expect(runWithFiles(["check", "-", "-"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: standard input given twice\n",
      reads: [],
    });
  });

  test("normalizes backslashes in an unreadable file path", () => {
    expect(runWithFiles(["check", "folder\\missing.pgn"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: folder/missing.pgn: cannot read the file\n",
      reads: ["folder\\missing.pgn"],
    });
  });

  test("reports malformed UTF-8 in a file and emits no stdout", () => {
    const files = new Map([["bad.pgn", Uint8Array.of(0xff, 0x28)]]);

    expect(runWithFiles(["check", "bad.pgn"], files)).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: bad.pgn: input is not valid UTF-8\n",
      reads: ["bad.pgn"],
    });
  });

  test("reports malformed UTF-8 from injected stdin", () => {
    expect(runWithFiles(["check", "-"], new Map(), Uint8Array.of(0xff))).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: <stdin>: input is not valid UTF-8\n",
      reads: ["<stdin>"],
    });
  });

  test("reads every check file in argument order before writing output", () => {
    const files = new Map([
      ["first.pgn", bytes("1. e4 *")],
      ["bad.pgn", Uint8Array.of(0xff)],
      ["later.pgn", bytes("1. d4 *")],
    ]);

    expect(runWithFiles(["check", "first.pgn", "bad.pgn", "later.pgn"], files)).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: bad.pgn: input is not valid UTF-8\n",
      reads: ["first.pgn", "bad.pgn"],
    });
  });

  test("accepts one leading BOM in file input", () => {
    const files = new Map([["single-bom.pgn", bytes("\uFEFF1. e4 *")]]);

    expect(runWithFiles(["check", "single-bom.pgn"], files)).toEqual({
      status: 0,
      stdout: "ok, 1 game, 1 move\n",
      stderr: "",
      reads: ["single-bom.pgn"],
    });
  });

  test("retains a second BOM in file input", () => {
    const files = new Map([["double-bom.pgn", bytes("\uFEFF\uFEFF1. e4 *")]]);

    expect(runWithFiles(["check", "double-bom.pgn"], files)).toEqual({
      status: 1,
      stdout: 'double-bom.pgn:1: PV002 game 1: unreadable move "?1."\n1 problem in 1 of 1 game\n',
      stderr: "",
      reads: ["double-bom.pgn"],
    });
  });

  test("accepts one leading BOM in injected stdin", () => {
    expect(runWithFiles(["check", "-"], new Map(), bytes("\uFEFF1. e4 *"))).toEqual({
      status: 0,
      stdout: "ok, 1 game, 1 move\n",
      stderr: "",
      reads: ["<stdin>"],
    });
  });

  test("retains a second BOM in injected stdin", () => {
    expect(runWithFiles(["check", "-"], new Map(), bytes("\uFEFF\uFEFF1. e4 *"))).toEqual({
      status: 1,
      stdout: '<stdin>:1: PV002 game 1: unreadable move "?1."\n1 problem in 1 of 1 game\n',
      stderr: "",
      reads: ["<stdin>"],
    });
  });

  test("checks empty stdin and reports zero games and moves", () => {
    expect(runWithFiles(["check", "-"])).toEqual({
      status: 0,
      stdout: "ok, 0 games, 0 moves\n",
      stderr: "",
      reads: ["<stdin>"],
    });
  });

  test("checks an empty file without inventing a game", () => {
    const files = new Map([["empty.pgn", bytes("")]]);

    expect(runWithFiles(["check", "empty.pgn"], files)).toEqual({
      status: 0,
      stdout: "ok, 0 games, 0 moves\n",
      stderr: "",
      reads: ["empty.pgn"],
    });
  });

  test("checks files in argument order and counts replayed plies", () => {
    const files = new Map([
      ["first.pgn", bytes("1. e4 *")],
      ["second.pgn", bytes("1. d4 d5 *")],
    ]);

    expect(runWithFiles(["check", "first.pgn", "second.pgn"], files)).toEqual({
      status: 0,
      stdout: "ok, 2 games, 3 moves\n",
      stderr: "",
      reads: ["first.pgn", "second.pgn"],
    });
  });

  test("prints the complete supplied multi-game diagnostic report", () => {
    const files = new Map([["games.pgn", bytes(gamesPgn)]]);

    expect(runWithFiles(["check", "games.pgn"], files)).toEqual({
      status: 1,
      stdout:
        'games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)\n' +
        'games.pgn:17: PV004 game 3: ambiguous move "Nd2" (Nbd2 or Nfd2)\n' +
        "games.pgn:22: PV005 game 4: move number 3 where 2 was expected\n" +
        'games.pgn:22: PV006 game 4: check mark of "Nf3+": the move gives no check\n' +
        'games.pgn:22: PV007 game 4: Result tag "1/2-1/2" does not match the result marker "1-0"\n' +
        'games.pgn:27: PV001 game 5: unexpected ")"\n' +
        "games.pgn:27: PV009 game 5: the game ended in checkmate, the result should be 0-1\n" +
        'games.pgn:31: PV002 game 6: unreadable move "xyz"\n' +
        "games.pgn:35: PV010 game 7: game has no result marker\n" +
        "9 problems in 6 of 7 games\n",
      stderr: "",
      reads: ["games.pgn"],
    });
  });

  test("checks that lexical recovery skips a variation and accepts zero castling", () => {
    expect(
      runWithFiles(
        ["check", "-"],
        new Map(),
        bytes("1. e4 (1. d4 {a ) in a comment} d5) e5 2. Nf3 *"),
      ),
    ).toEqual({
      status: 0,
      stdout: "ok, 1 game, 3 moves\n",
      stderr: "",
      reads: ["<stdin>"],
    });
    expect(
      runWithFiles(["check", "-"], new Map(), bytes("1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.0-0 *")),
    ).toEqual({
      status: 0,
      stdout: "ok, 1 game, 7 moves\n",
      stderr: "",
      reads: ["<stdin>"],
    });
  });

  test("reports an unterminated comment and the missing result marker", () => {
    expect(runWithFiles(["check", "-"], new Map(), bytes("1. e4 {open"))).toEqual({
      status: 1,
      stdout:
        "<stdin>:1: PV001 game 1: unterminated comment\n" +
        "<stdin>:1: PV010 game 1: game has no result marker\n" +
        "2 problems in 1 of 1 game\n",
      stderr: "",
      reads: ["<stdin>"],
    });
  });

  test("prints the final FEN by default and supports a ply snapshot", () => {
    const files = new Map([["games.pgn", bytes(gamesPgn)]]);

    expect(runWithFiles(["fen", "games.pgn"], files)).toEqual({
      status: 0,
      stdout: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4\n",
      stderr: "",
      reads: ["games.pgn"],
    });
    expect(runWithFiles(["fen", "--game", "1", "--ply", "3", "games.pgn"], files)).toEqual({
      status: 0,
      stdout: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2\n",
      stderr: "",
      reads: ["games.pgn"],
    });
  });

  test("returns the initial FEN for ply zero", () => {
    const files = new Map([["games.pgn", bytes(gamesPgn)]]);

    expect(runWithFiles(["fen", "--ply=0", "games.pgn"], files)).toEqual({
      status: 0,
      stdout: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n",
      stderr: "",
      reads: ["games.pgn"],
    });
  });

  test("writes the stopping problem for a game that cannot be replayed", () => {
    const files = new Map([["games.pgn", bytes(gamesPgn)]]);

    expect(runWithFiles(["fen", "--game=2", "games.pgn"], files)).toEqual({
      status: 1,
      stdout: "",
      stderr: 'pgnvet: games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)\n',
      reads: ["games.pgn"],
    });
  });

  test("reports a missing selected game as a usage error", () => {
    const files = new Map([["games.pgn", bytes(gamesPgn)]]);

    expect(runWithFiles(["fen", "--game=9", "games.pgn"], files)).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: games.pgn: game 9 not found (the file has 7 games)\n",
      reads: ["games.pgn"],
    });
  });

  test("reports a requested ply beyond a completed game's length", () => {
    const files = new Map([["one.pgn", bytes("1. e4 *")]]);

    expect(runWithFiles(["fen", "--ply=2", "one.pgn"], files)).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: one.pgn: game 1 has only 1 ply\n",
      reads: ["one.pgn"],
    });
  });

  test("returns a valid snapshot before a later replay stop", () => {
    const files = new Map([["stopped.pgn", bytes("1. e4 e5 2. Nxe6 *")]]);

    expect(runWithFiles(["fen", "--ply=1", "stopped.pgn"], files)).toEqual({
      status: 0,
      stdout: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\n",
      stderr: "",
      reads: ["stopped.pgn"],
    });
  });

  test("reports invalid initial FEN even when ply zero was requested", () => {
    const invalidFen = '[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n1. e4 *';

    expect(runWithFiles(["fen", "--ply=0", "-"], new Map(), bytes(invalidFen))).toEqual({
      status: 1,
      stdout: "",
      stderr: "pgnvet: <stdin>:1: PV008 game 1: invalid FEN tag: white needs exactly one king\n",
      reads: ["<stdin>"],
    });
  });

  test("prints standard legal moves in UCI order", () => {
    expect(runWithFiles(["moves"])).toEqual({
      status: 0,
      stdout:
        "a2a3 a3\na2a4 a4\nb1a3 Na3\nb1c3 Nc3\nb2b3 b3\nb2b4 b4\n" +
        "c2c3 c3\nc2c4 c4\nd2d3 d3\nd2d4 d4\ne2e3 e3\ne2e4 e4\n" +
        "f2f3 f3\nf2f4 f4\ng1f3 Nf3\ng1h3 Nh3\ng2g3 g3\ng2g4 g4\n" +
        "h2h3 h3\nh2h4 h4\n20 moves\n",
      stderr: "",
      reads: [],
    });
  });

  test("prints the supplied promotion and en-passant move listing", () => {
    const fen = "4k3/P7/8/3pP3/8/8/8/4K3 w - d6 0 1";

    expect(runWithFiles(["moves", fen])).toEqual({
      status: 0,
      stdout:
        "a7a8b a8=B\na7a8n a8=N\na7a8q a8=Q+\na7a8r a8=R+\n" +
        "e1d1 Kd1\ne1d2 Kd2\ne1e2 Ke2\ne1f1 Kf1\ne1f2 Kf2\n" +
        "e5d6 exd6\ne5e6 e6\n11 moves\n",
      stderr: "",
      reads: [],
    });
  });

  test("reports stalemate and checkmate when there are no legal moves", () => {
    expect(runWithFiles(["moves", "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"])).toEqual({
      status: 0,
      stdout: "0 moves, stalemate\n",
      stderr: "",
      reads: [],
    });
    expect(runWithFiles(["moves", "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"])).toEqual({
      status: 0,
      stdout: "0 moves, checkmate\n",
      stderr: "",
      reads: [],
    });
  });

  test("prints exact invalid-FEN errors for moves and perft", () => {
    expect(runWithFiles(["moves", "8/8/8/8/8/8/8/8 w - - 0 1"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: invalid FEN: white needs exactly one king\n",
      reads: [],
    });
    expect(runWithFiles(["perft", "1", "8/8/8/8/8/8/8/8 w - - 0 1"])).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: invalid FEN: white needs exactly one king\n",
      reads: [],
    });
  });

  test("prints the supplied six-branch perft split and total", () => {
    expect(runWithFiles(["perft", "2", "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"])).toEqual({
      status: 0,
      stdout: "e1d1: 5\ne1d2: 5\ne1f1: 5\ne1f2: 5\ne2e3: 5\ne2e4: 5\nnodes 30\n",
      stderr: "",
      reads: [],
    });
  });

  test("starts the real entry point once to reject malformed UTF-8 on stdin", () => {
    const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/main.ts");
    const result = spawnSync(process.execPath, [mainPath, "check", "-"], {
      input: Uint8Array.of(0xff),
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("pgnvet: <stdin>: input is not valid UTF-8\n");
  });
});
