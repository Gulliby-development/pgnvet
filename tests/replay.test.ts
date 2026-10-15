import { describe, expect, test } from "bun:test";
import { parsePgnGames } from "../src/pgn-games";
import { type Replay, type ReplayProblem, replay } from "../src/replay";

function replayText(text: string): Replay {
  const game = parsePgnGames(text)[0];
  if (game === undefined) {
    throw new Error("test PGN did not produce a game");
  }
  return replay(game);
}

function expectedProblem(
  code: ReplayProblem["code"],
  line: number,
  message: string,
  game = 1,
): ReplayProblem {
  return { code, line, game, message };
}

describe("replay", () => {
  test("retains the initial position and every successful standard-game ply", () => {
    const result = replayText("1. e4 e5 2. Nf3 *");

    expect(result.fens).toEqual([
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    ]);
    expect(result.plies).toBe(3);
    expect(result.finalPosition).not.toBeNull();
    expect(result.problems).toEqual([]);
    expect(result.stoppingProblem).toBeNull();
  });

  test("starts from the FEN tag and retains its successful move snapshot", () => {
    const result = replayText('[SetUp "0"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *');

    expect(result.fens).toEqual([
      "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
      "4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1",
    ]);
    expect(result.plies).toBe(1);
    expect(result.problems).toEqual([]);
  });

  test("keeps snapshots through the last successful ply before an illegal move", () => {
    const result = replayText("1. e4 e5 2. Nf3 Nf6 3. Qh5 *");

    expect(result.fens).toHaveLength(5);
    expect(result.plies).toBe(4);
    expect(result.problems).toEqual([
      expectedProblem("PV003", 1, 'illegal move "Qh5" at move 3 (white)'),
    ]);
    expect(result.stoppingProblem).toEqual(
      expectedProblem("PV003", 1, 'illegal move "Qh5" at move 3 (white)'),
    );
  });

  test("reports a stray closing parenthesis and continues replay", () => {
    const result = replayText("1. e4 ) *");

    expect(result.plies).toBe(1);
    expect(result.problems).toEqual([expectedProblem("PV001", 1, 'unexpected ")"')]);
    expect(result.stoppingProblem).toBeNull();
  });

  test("reports and recovers from a malformed tag pair", () => {
    const result = replayText("[Broken]\n1. e4 *");

    expect(result.plies).toBe(1);
    expect(result.problems).toEqual([expectedProblem("PV001", 1, "invalid tag pair")]);
  });

  test("reports an unterminated comment and a missing result marker", () => {
    const result = replayText("1. e4 {open");

    expect(result.problems).toEqual([
      expectedProblem("PV001", 1, "unterminated comment"),
      expectedProblem("PV010", 1, "game has no result marker"),
    ]);
    expect(result.stoppingProblem).toBeNull();
  });

  test("reports an unterminated nested variation at its opening line", () => {
    const result = replayText("1. e4 (1. d4 {a ) in a comment} d5");

    expect(result.plies).toBe(1);
    expect(result.problems).toEqual([
      expectedProblem("PV001", 1, "unterminated variation"),
      expectedProblem("PV010", 1, "game has no result marker"),
    ]);
  });

  test("reports unreadable SAN syntax and stops before playing it", () => {
    const result = replayText("1. xyz *");

    expect(result.plies).toBe(0);
    expect(result.stoppingProblem).toEqual(expectedProblem("PV002", 1, 'unreadable move "xyz"'));
    expect(result.problems).toEqual([expectedProblem("PV002", 1, 'unreadable move "xyz"')]);
  });

  test("reports a syntactically valid but illegal move with side and move number", () => {
    const result = replayText("1. e5 *");

    expect(result.problems).toEqual([
      expectedProblem("PV003", 1, 'illegal move "e5" at move 1 (white)'),
    ]);
    expect(result.stoppingProblem?.code).toBe("PV003");
    expect(result.plies).toBe(0);
  });

  test("reports canonical candidates for an ambiguous move", () => {
    const result = replayText('[FEN "4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"]\n1. Nd2 *');

    expect(result.problems).toEqual([
      expectedProblem("PV004", 2, 'ambiguous move "Nd2" (Nbd2 or Nfd2)'),
    ]);
    expect(result.stoppingProblem?.code).toBe("PV004");
    expect(result.plies).toBe(0);
  });

  test("reports a wrong white move number and continues replay", () => {
    const result = replayText("3. e4 e5 *");

    expect(result.problems).toEqual([
      expectedProblem("PV005", 1, "move number 3 where 1 was expected"),
    ]);
    expect(result.stoppingProblem).toBeNull();
    expect(result.plies).toBe(2);
  });

  test("checks the black move number against the current fullmove number", () => {
    const result = replayText("1. e4 2... e5 *");

    expect(result.problems).toEqual([
      expectedProblem("PV005", 1, "move number 2 where 1 was expected"),
    ]);
    expect(result.plies).toBe(2);
  });

  test("reports a plus suffix when the move gives no check", () => {
    const result = replayText("1. e4+ *");

    expect(result.problems).toEqual([
      expectedProblem("PV006", 1, 'check mark of "e4+": the move gives no check'),
    ]);
    expect(result.plies).toBe(1);
  });

  test("reports plus on a checkmating move", () => {
    const result = replayText("1. f3 e5 2. g4 Qh4+ 0-1");

    expect(result.problems).toEqual([
      expectedProblem("PV006", 1, 'check mark of "Qh4+": the move gives checkmate'),
    ]);
    expect(result.plies).toBe(4);
  });

  test("reports hash on check that is not mate", () => {
    const result = replayText('[FEN "3k4/R7/8/8/8/8/8/K7 w - - 0 1"]\n1. Rd7# *');

    expect(result.problems).toEqual([
      expectedProblem("PV006", 2, 'check mark of "Rd7#": the move gives check, not checkmate'),
    ]);
    expect(result.plies).toBe(1);
  });

  test("accepts an unmarked checking move", () => {
    const result = replayText('[FEN "3k4/R7/8/8/8/8/8/K7 w - - 0 1"]\n1. Rd7 *');

    expect(result.problems).toEqual([]);
    expect(result.plies).toBe(1);
  });

  test("reports a Result tag mismatch at the result marker", () => {
    const result = replayText('[Result "0-1"]\n1. e4 1-0');

    expect(result.problems).toEqual([
      expectedProblem("PV007", 2, 'Result tag "0-1" does not match the result marker "1-0"'),
    ]);
  });

  test("checks the Result tag after replay has stopped", () => {
    const result = replayText('[Result "0-1"]\n1. xyz 1-0');

    expect(result.problems).toEqual([
      expectedProblem("PV002", 2, 'unreadable move "xyz"'),
      expectedProblem("PV007", 2, 'Result tag "0-1" does not match the result marker "1-0"'),
    ]);
    expect(result.stoppingProblem?.code).toBe("PV002");
  });

  test("sorts lexical problems before replay problems on the same line", () => {
    const result = replayText("1. xyz ) *");

    expect(result.problems).toEqual([
      expectedProblem("PV001", 1, 'unexpected ")"'),
      expectedProblem("PV002", 1, 'unreadable move "xyz"'),
    ]);
  });

  test("reports an invalid initial FEN as PV008 without producing a snapshot", () => {
    const result = replayText('[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n1. e4 *');

    expect(result.fens).toEqual([]);
    expect(result.plies).toBe(0);
    expect(result.finalPosition).toBeNull();
    expect(result.problems).toEqual([
      expectedProblem("PV008", 1, "invalid FEN tag: white needs exactly one king"),
    ]);
    expect(result.stoppingProblem?.code).toBe("PV008");
  });

  test("requires the correct result for a checkmated final position", () => {
    const result = replayText("1. f3 e5 2. g4 Qh4# *");

    expect(result.problems).toEqual([
      expectedProblem("PV009", 1, "the game ended in checkmate, the result should be 0-1"),
    ]);
  });

  test("requires a draw marker for a stalemated final position", () => {
    const result = replayText('[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"]\n*');

    expect(result.problems).toEqual([
      expectedProblem("PV009", 2, "the game ended in stalemate, the result should be 1/2-1/2"),
    ]);
  });

  test("accepts the winning result for a checkmate", () => {
    const result = replayText("1. f3 e5 2. g4 Qh4# 0-1");

    expect(result.problems).toEqual([]);
    expect(result.stoppingProblem).toBeNull();
  });

  test("accepts a draw result for stalemate", () => {
    const result = replayText('[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"]\n1/2-1/2');

    expect(result.problems).toEqual([]);
  });

  test("reports a missing result on the last move token line", () => {
    const result = replayText("1. e4\ne5");

    expect(result.problems).toEqual([expectedProblem("PV010", 2, "game has no result marker")]);
  });

  test("reports a missing result on the last tag line for a tag-only game", () => {
    const result = replayText('[Event "unfinished"]');

    expect(result.problems).toEqual([expectedProblem("PV010", 1, "game has no result marker")]);
  });

  test("reports lexical problems first when an unterminated construct and no result share a line", () => {
    const result = replayText("1. e4 (unfinished");

    expect(result.problems).toEqual([
      expectedProblem("PV001", 1, "unterminated variation"),
      expectedProblem("PV010", 1, "game has no result marker"),
    ]);
  });
});
