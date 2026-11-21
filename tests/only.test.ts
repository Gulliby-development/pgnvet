import { describe, expect, test } from "bun:test";
import { parseArgs, UsageError } from "../src/args";
import { type Io, run } from "../src/cli";
import { PROBLEM_CODES, type ProblemCode } from "../src/problems";
import type { Replay, ReplayProblem } from "../src/replay";
import { renderCheckReport, selectProblems } from "../src/report";

const encoder = new TextEncoder();

/**
 * Three games: an illegal move (PV003), an unreadable move (PV002) and a
 * missing result marker (PV010). Each game keeps two successful plies.
 */
const samplePgn = [
  '[Event "Illegal"]',
  '[Result "1-0"]',
  "",
  "1. e4 e5 2. Nxe6 1-0",
  "",
  '[Event "Typo"]',
  "",
  "1. d4 d5 2. xyz *",
  "",
  '[Event "Unfinished"]',
  "",
  "1. c4 c5",
].join("\n");

interface CliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[], files: ReadonlyMap<string, Uint8Array>): CliResult {
  let stdout = "";
  let stderr = "";
  const io: Io = {
    readStdin: () => new Uint8Array(),
    readFile: (path) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`unexpected read: ${path}`);
      }
      return value;
    },
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  };

  return { status: run([...args], io), stdout, stderr };
}

function sampleFiles(): Map<string, Uint8Array> {
  return new Map([["sample.pgn", encoder.encode(samplePgn)]]);
}

function usageMessage(args: readonly string[]): string | null {
  try {
    parseArgs([...args]);
  } catch (error) {
    return error instanceof UsageError ? error.message : `not a UsageError: ${String(error)}`;
  }
  return null;
}

function problem(code: ProblemCode, line: number, message = "detail"): ReplayProblem {
  return { code, line, game: 1, message };
}

function replayWith(problems: readonly ReplayProblem[]): Replay {
  return { fens: [], plies: 7, finalPosition: null, problems, stoppingProblem: null };
}

describe("--only argument parsing", () => {
  test("keeps a single code", () => {
    expect(parseArgs(["check", "--only", "PV003", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV003"],
    });
  });

  test("accepts the equals form", () => {
    expect(parseArgs(["check", "--only=PV004", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV004"],
    });
  });

  test("sorts a comma-separated list", () => {
    expect(parseArgs(["check", "--only", "PV010,PV003", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV003", "PV010"],
    });
  });

  test("adds up repeated options", () => {
    expect(parseArgs(["check", "--only", "PV006", "--only=PV001", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV001", "PV006"],
    });
  });

  test("drops duplicates with the last value of a repeated code", () => {
    expect(parseArgs(["check", "--only", "PV003,PV003", "--only", "PV003", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV003"],
    });
  });

  test("accepts the option among the file operands", () => {
    expect(parseArgs(["check", "first.pgn", "--only", "PV006", "-"])).toEqual({
      command: "check",
      files: ["first.pgn", "-"],
      only: ["PV006"],
    });
  });

  test("ignores spaces around codes", () => {
    expect(parseArgs(["check", "--only", " PV003 , PV006 ", "games.pgn"])).toEqual({
      command: "check",
      files: ["games.pgn"],
      only: ["PV003", "PV006"],
    });
  });

  test("accepts every documented code", () => {
    const parsed = parseArgs(["check", `--only=${PROBLEM_CODES.join(",")}`, "games.pgn"]);
    expect(parsed).toEqual({ command: "check", files: ["games.pgn"], only: [...PROBLEM_CODES] });
  });

  test("leaves the option out when it is absent", () => {
    const parsed = parseArgs(["check", "games.pgn"]);
    expect(parsed).toEqual({ command: "check", files: ["games.pgn"] });
    expect(Object.hasOwn(parsed, "only")).toBe(false);
  });

  test("reports a missing value", () => {
    expect(usageMessage(["check", "--only"])).toBe("--only needs a value");
  });

  test("reports an empty value the same way", () => {
    expect(usageMessage(["check", "--only=", "games.pgn"])).toBe("--only needs a value");
  });

  test("reports an unknown code with its quoted value", () => {
    expect(usageMessage(["check", "--only", "PV011", "games.pgn"])).toBe(
      'invalid --only code "PV011"',
    );
  });

  test("reports an empty list element as an empty code", () => {
    expect(usageMessage(["check", "--only", "PV003,", "games.pgn"])).toBe('invalid --only code ""');
  });

  test("requires the documented upper-case spelling", () => {
    expect(usageMessage(["check", "--only", "pv003", "games.pgn"])).toBe(
      'invalid --only code "pv003"',
    );
  });

  test("validates codes before the missing FILE check", () => {
    expect(usageMessage(["check", "--only", "PV011"])).toBe('invalid --only code "PV011"');
  });

  test("is rejected by the other commands", () => {
    expect(usageMessage(["fen", "--only", "PV001", "games.pgn"])).toBe('unknown option "--only"');
    expect(usageMessage(["moves", "--only=PV003"])).toBe('unknown option "--only=PV003"');
    expect(usageMessage(["perft", "2", "--only", "PV003"])).toBe('unknown option "--only"');
  });
});

describe("--only reporting", () => {
  test("keeps every problem when no list is given", () => {
    const problems = [problem("PV003", 4), problem("PV006", 5)];
    expect(selectProblems(problems, undefined)).toEqual(problems);
  });

  test("keeps only the listed codes in their original order", () => {
    const problems = [problem("PV003", 4), problem("PV006", 5), problem("PV003", 6)];
    expect(selectProblems(problems, ["PV006", "PV003"]).map((item) => item.line)).toEqual([
      4, 5, 6,
    ]);
  });

  test("filters the counted games and suffixes the summary", () => {
    const files = [
      { path: "one.pgn", replays: [replayWith([problem("PV003", 4), problem("PV006", 5)])] },
      { path: "two.pgn", replays: [replayWith([problem("PV003", 9)])] },
    ];
    expect(renderCheckReport(files, ["PV006"])).toBe(
      "one.pgn:5: PV006 game 1: detail\n1 problem in 1 of 2 games (only PV006)\n",
    );
  });

  test("suffixes the ok summary when nothing matches", () => {
    const files = [{ path: "one.pgn", replays: [replayWith([problem("PV003", 4)])] }];
    expect(renderCheckReport(files, ["PV010"])).toBe("ok, 1 game, 7 moves (only PV010)\n");
  });

  test("writes every requested code once, sorted, in the summary", () => {
    const files = [{ path: "one.pgn", replays: [replayWith([problem("PV003", 4)])] }];
    expect(renderCheckReport(files, ["PV006", "PV003"])).toBe(
      "one.pgn:4: PV003 game 1: detail\n1 problem in 1 of 1 game (only PV003, PV006)\n",
    );
  });
});

describe("--only in the CLI", () => {
  test("prints only the selected code and counts its games", () => {
    expect(runCli(["check", "--only", "PV003", "sample.pgn"], sampleFiles())).toEqual({
      status: 1,
      stdout:
        'sample.pgn:4: PV003 game 1: illegal move "Nxe6" at move 2 (white)\n' +
        "1 problem in 1 of 3 games (only PV003)\n",
      stderr: "",
    });
  });

  test("exits zero when the selected code does not occur", () => {
    expect(runCli(["check", "--only", "PV005", "sample.pgn"], sampleFiles())).toEqual({
      status: 0,
      stdout: "ok, 3 games, 6 moves (only PV005)\n",
      stderr: "",
    });
  });

  test("groups several codes under one summary suffix", () => {
    expect(runCli(["check", "sample.pgn", "--only", "PV010,PV002"], sampleFiles())).toEqual({
      status: 1,
      stdout:
        'sample.pgn:8: PV002 game 2: unreadable move "xyz"\n' +
        "sample.pgn:12: PV010 game 3: game has no result marker\n" +
        "2 problems in 2 of 3 games (only PV002, PV010)\n",
      stderr: "",
    });
  });

  test("leaves the unfiltered report unchanged", () => {
    expect(runCli(["check", "sample.pgn"], sampleFiles())).toEqual({
      status: 1,
      stdout:
        'sample.pgn:4: PV003 game 1: illegal move "Nxe6" at move 2 (white)\n' +
        'sample.pgn:8: PV002 game 2: unreadable move "xyz"\n' +
        "sample.pgn:12: PV010 game 3: game has no result marker\n" +
        "3 problems in 3 of 3 games\n",
      stderr: "",
    });
  });

  test("reports a bad code on stderr with exit code 2 and no stdout", () => {
    expect(runCli(["check", "--only", "PV012", "sample.pgn"], sampleFiles())).toEqual({
      status: 2,
      stdout: "",
      stderr: 'pgnvet: invalid --only code "PV012"\n',
    });
  });

  test("reports a missing value on stderr with exit code 2 and no stdout", () => {
    expect(runCli(["check", "--only"], sampleFiles())).toEqual({
      status: 2,
      stdout: "",
      stderr: "pgnvet: --only needs a value\n",
    });
  });
});
