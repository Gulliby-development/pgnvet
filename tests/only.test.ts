import { describe, expect, test } from "bun:test";
import { type Io, run } from "../src/cli";

const encoder = new TextEncoder();

const gamesA =
  '[Event "A"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe6 1-0\n\n[Event "B"]\n[Result "1/2-1/2"]\n\n1. e4 e5 3. Nf3+ Nc6 1-0\n\n[Event "C"]\n\n1. d4 d5 2. xyz *\n';
const gamesB = '[Event "D"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n';

interface Row {
  readonly args: string[];
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runRow(args: string[]): Row {
  let stdout = "";
  let stderr = "";
  const files = new Map([
    ["a.pgn", gamesA],
    ["b.pgn", gamesB],
  ]);
  const io: Io = {
    readStdin: () => encoder.encode(gamesA),
    readFile: (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error("missing in-memory file");
      return encoder.encode(text);
    },
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  };
  return { args, status: run(args, io), stdout, stderr };
}

const rows: Row[] = [
  {
    args: ["check", "a.pgn"],
    status: 1,
    stdout:
      'a.pgn:4: PV003 game 1: illegal move "Nxe6" at move 5 (white)\na.pgn:9: PV005 game 2: move number 3 where 2 was expected\na.pgn:9: PV006 game 2: check mark of "Nf3+": the move gives no check\na.pgn:9: PV007 game 2: Result tag "1/2-1/2" does not match the result marker "1-0"\na.pgn:13: PV002 game 3: unreadable move "xyz"\n5 problems in 3 of 3 games\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV003", "a.pgn"],
    status: 1,
    stdout:
      'a.pgn:4: PV003 game 1: illegal move "Nxe6" at move 5 (white)\n1 problem in 1 of 3 games (only PV003)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV005,PV007", "a.pgn"],
    status: 1,
    stdout:
      'a.pgn:9: PV005 game 2: move number 3 where 2 was expected\na.pgn:9: PV007 game 2: Result tag "1/2-1/2" does not match the result marker "1-0"\n2 problems in 1 of 3 games (only PV005, PV007)\n',
    stderr: "",
  },
  {
    args: ["check", "--only=PV007", "--only", "PV005", "a.pgn"],
    status: 1,
    stdout:
      'a.pgn:9: PV005 game 2: move number 3 where 2 was expected\na.pgn:9: PV007 game 2: Result tag "1/2-1/2" does not match the result marker "1-0"\n2 problems in 1 of 3 games (only PV005, PV007)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV007,PV007,PV007", "a.pgn"],
    status: 1,
    stdout:
      'a.pgn:9: PV007 game 2: Result tag "1/2-1/2" does not match the result marker "1-0"\n1 problem in 1 of 3 games (only PV007)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV010", "a.pgn"],
    status: 0,
    stdout: "ok, 3 games, 14 moves (only PV010)\n",
    stderr: "",
  },
  {
    args: ["check", "a.pgn", "--only", "PV002"],
    status: 1,
    stdout:
      'a.pgn:13: PV002 game 3: unreadable move "xyz"\n1 problem in 1 of 3 games (only PV002)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV003,PV006", "a.pgn", "b.pgn"],
    status: 1,
    stdout:
      'a.pgn:4: PV003 game 1: illegal move "Nxe6" at move 5 (white)\na.pgn:9: PV006 game 2: check mark of "Nf3+": the move gives no check\n2 problems in 2 of 4 games (only PV003, PV006)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV003", "-"],
    status: 1,
    stdout:
      '<stdin>:4: PV003 game 1: illegal move "Nxe6" at move 5 (white)\n1 problem in 1 of 3 games (only PV003)\n',
    stderr: "",
  },
  {
    args: ["check", "--only", "PV011", "a.pgn"],
    status: 2,
    stdout: "",
    stderr: 'pgnvet: invalid --only code "PV011"\n',
  },
  {
    args: ["check", "--only", "pv003", "a.pgn"],
    status: 2,
    stdout: "",
    stderr: 'pgnvet: invalid --only code "pv003"\n',
  },
  {
    args: ["check", "--only", "", "a.pgn"],
    status: 2,
    stdout: "",
    stderr: 'pgnvet: invalid --only code ""\n',
  },
  {
    args: ["check", "--only", "PV003,", "a.pgn"],
    status: 2,
    stdout: "",
    stderr: 'pgnvet: invalid --only code ""\n',
  },
  { args: ["check", "--only"], status: 2, stdout: "", stderr: "pgnvet: --only needs a value\n" },
  { args: ["check", "--only", "PV003"], status: 2, stdout: "", stderr: "pgnvet: missing FILE\n" },
  {
    args: ["fen", "--only", "PV003", "a.pgn"],
    status: 2,
    stdout: "",
    stderr: 'pgnvet: unknown option "--only"\n',
  },
];

describe("check --only", () => {
  test("reports only the listed problem codes, in the usual order", () => {
    for (const row of rows) {
      expect(runRow(row.args)).toEqual(row);
    }
  });
});
