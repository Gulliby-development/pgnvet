import { describe, expect, test } from "bun:test";
import { type Io, run } from "../src/cli";
import type { Replay } from "../src/replay";
import {
  displayPath,
  formatProblemLine,
  renderCheckReport,
  renderMovesReport,
  renderPerftReport,
} from "../src/report";

function replayWith(overrides: Partial<Replay> = {}): Replay {
  return {
    fens: [],
    plies: 0,
    finalPosition: null,
    problems: [],
    stoppingProblem: null,
    ...overrides,
  };
}

function captureRun(args: string[]) {
  const files = new Map<string, Uint8Array>();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: Io = {
    readStdin() {
      return files.get("<stdin>") ?? new Uint8Array();
    },
    readFile(path) {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw new Error(`unexpected file read: ${path}`);
      }
      return bytes;
    },
    out(text) {
      stdout.push(text);
    },
    err(text) {
      stderr.push(text);
    },
  };

  return {
    status: run(args, io),
    stdout: stdout.join(""),
    stderr: stderr.join(""),
  };
}

describe("report rendering", () => {
  test("normalizes backslashes in displayed file paths", () => {
    expect(displayPath("C:\\games\\round 1.pgn")).toBe("C:/games/round 1.pgn");
  });

  test("names standard input as <stdin>", () => {
    expect(displayPath("-")).toBe("<stdin>");
  });

  test("formats a diagnostic with its line, code, game, and message", () => {
    expect(
      formatProblemLine("games.pgn", {
        line: 11,
        code: "PV003",
        game: 2,
        message: 'illegal move "Nxe6" at move 5 (white)',
      }),
    ).toBe('games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)');
  });

  test("renders diagnostics in file and replay order with the aggregate count", () => {
    const report = renderCheckReport([
      {
        path: "first\\games.pgn",
        replays: [
          replayWith({
            plies: 5,
            problems: [
              {
                line: 11,
                code: "PV003",
                game: 2,
                message: 'illegal move "Nxe6" at move 5 (white)',
              },
              {
                line: 13,
                code: "PV006",
                game: 2,
                message: 'check mark of "Nf3+": the move gives no check',
              },
            ],
          }),
          replayWith({ plies: 2 }),
        ],
      },
      {
        path: "-",
        replays: [
          replayWith({
            plies: 1,
            problems: [
              {
                line: 3,
                code: "PV010",
                game: 1,
                message: "game has no result marker",
              },
            ],
          }),
        ],
      },
    ]);

    expect(report).toBe(
      'first/games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)\n' +
        'first/games.pgn:13: PV006 game 2: check mark of "Nf3+": the move gives no check\n' +
        "<stdin>:3: PV010 game 1: game has no result marker\n" +
        "3 problems in 2 of 3 games\n",
    );
    expect(report.includes("\r")).toBe(false);
  });

  test("renders a singular problem summary", () => {
    expect(
      renderCheckReport([
        {
          path: "one.pgn",
          replays: [
            replayWith({
              problems: [
                {
                  line: 1,
                  code: "PV001",
                  game: 1,
                  message: "unterminated comment",
                },
              ],
            }),
          ],
        },
      ]),
    ).toBe("one.pgn:1: PV001 game 1: unterminated comment\n1 problem in 1 of 1 game\n");
  });

  test("renders a singular clean check summary", () => {
    expect(renderCheckReport([{ path: "one.pgn", replays: [replayWith({ plies: 1 })] }])).toBe(
      "ok, 1 game, 1 move\n",
    );
  });

  test("renders an empty check summary with plural forms", () => {
    expect(renderCheckReport([])).toBe("ok, 0 games, 0 moves\n");
  });

  test("renders a sorted move listing with its plural count and LF endings", () => {
    const report = renderMovesReport(
      [
        { uci: "a7a8b", san: "a8=B" },
        { uci: "a7a8n", san: "a8=N" },
        { uci: "a7a8q", san: "a8=Q+" },
        { uci: "a7a8r", san: "a8=R+" },
        { uci: "e1d1", san: "Kd1" },
      ],
      null,
    );

    expect(report).toBe(
      "a7a8b a8=B\n" +
        "a7a8n a8=N\n" +
        "a7a8q a8=Q+\n" +
        "a7a8r a8=R+\n" +
        "e1d1 Kd1\n" +
        "5 moves\n",
    );
    expect(report.includes("\r")).toBe(false);
  });

  test("renders a singular move count", () => {
    expect(renderMovesReport([{ uci: "e2e4", san: "e4" }], null)).toBe("e2e4 e4\n1 move\n");
  });

  test("renders an empty checkmate listing", () => {
    expect(renderMovesReport([], "checkmate")).toBe("0 moves, checkmate\n");
  });

  test("renders an empty stalemate listing", () => {
    expect(renderMovesReport([], "stalemate")).toBe("0 moves, stalemate\n");
  });

  test("defaults an empty move listing to stalemate when no terminal is supplied", () => {
    expect(renderMovesReport([], null)).toBe("0 moves, stalemate\n");
  });

  test("renders sorted root perft splits and the total", () => {
    expect(
      renderPerftReport(
        [
          { uci: "e1d1", nodes: 5 },
          { uci: "e1d2", nodes: 5 },
          { uci: "e1f1", nodes: 5 },
          { uci: "e1f2", nodes: 5 },
          { uci: "e2e3", nodes: 5 },
          { uci: "e2e4", nodes: 5 },
        ],
        30,
      ),
    ).toBe(
      "e1d1: 5\n" +
        "e1d2: 5\n" +
        "e1f1: 5\n" +
        "e1f2: 5\n" +
        "e2e3: 5\n" +
        "e2e4: 5\n" +
        "nodes 30\n",
    );
  });

  test("renders the zero-node perft boundary", () => {
    expect(renderPerftReport([], 0)).toBe("nodes 0\n");
  });

  test("prints the supplied promotion and en-passant move list in UCI order", () => {
    const result = captureRun(["moves", "4k3/P7/8/3pP3/8/8/8/4K3 w - d6 0 1"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "a7a8b a8=B\n" +
        "a7a8n a8=N\n" +
        "a7a8q a8=Q+\n" +
        "a7a8r a8=R+\n" +
        "e1d1 Kd1\n" +
        "e1d2 Kd2\n" +
        "e1e2 Ke2\n" +
        "e1f1 Kf1\n" +
        "e1f2 Kf2\n" +
        "e5d6 exd6\n" +
        "e5e6 e6\n" +
        "11 moves\n",
    );
    expect(result.stderr).toBe("");
    expect(result.stdout.includes("\r")).toBe(false);
  });

  test("prints the supplied sorted perft root split", () => {
    const result = captureRun(["perft", "2", "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "e1d1: 5\n" +
        "e1d2: 5\n" +
        "e1f1: 5\n" +
        "e1f2: 5\n" +
        "e2e3: 5\n" +
        "e2e4: 5\n" +
        "nodes 30\n",
    );
    expect(result.stderr).toBe("");
    expect(result.stdout.includes("\r")).toBe(false);
  });
});
