import { makeMove } from "./board";
import { formatFen, parseFen, standardPosition } from "./fen";
import { inCheck, legalMoves } from "./movegen";
import type { PgnGame } from "./pgn-games";
import type { PgnFault, PgnResult, PgnToken } from "./pgn-lexer";
import { findMoves, formatSan } from "./san";
import { show } from "./text";
import type { Position } from "./types";

export type ReplayProblemCode =
  | PgnFault["code"]
  | "PV002"
  | "PV003"
  | "PV004"
  | "PV005"
  | "PV006"
  | "PV007"
  | "PV008"
  | "PV009"
  | "PV010";

export interface ReplayProblem {
  readonly code: ReplayProblemCode;
  readonly line: number;
  readonly game: number;
  readonly message: string;
}

export interface Replay {
  /** Canonical positions indexed by ply; index zero is the initial position. */
  readonly fens: readonly string[];
  readonly plies: number;
  readonly finalPosition: Position | null;
  readonly problems: readonly ReplayProblem[];
  readonly stoppingProblem: ReplayProblem | null;
}

interface PendingProblem {
  readonly problem: ReplayProblem;
  readonly detectionOrder: number;
}

function checkMark(token: string): "+" | "#" | null {
  const match = /([+#])(?:!!|\?\?|!\?|\?!|!|\?)?$/.exec(token);
  const mark = match?.[1];
  return mark === "+" || mark === "#" ? mark : null;
}

function sideName(position: Position): "white" | "black" {
  return position.sideToMove === "w" ? "white" : "black";
}

function expectedTerminalResult(position: Position): {
  readonly kind: "checkmate" | "stalemate";
  readonly result: PgnResult;
} | null {
  if (legalMoves(position).length > 0) {
    return null;
  }
  if (inCheck(position, position.sideToMove === "w")) {
    return {
      kind: "checkmate",
      result: position.sideToMove === "w" ? "0-1" : "1-0",
    };
  }
  return { kind: "stalemate", result: "1/2-1/2" };
}

/** Replay a grouped PGN game and retain its initial and successful-ply positions. */
export function replay(game: PgnGame): Replay {
  const pending: PendingProblem[] = [];
  let detectionOrder = 0;
  let stoppingProblem: ReplayProblem | null = null;
  let position: Position | null = null;
  const fens: string[] = [];

  const report = (code: ReplayProblemCode, line: number, message: string): ReplayProblem => {
    const problem: ReplayProblem = { code, line, game: game.number, message };
    pending.push({ problem, detectionOrder });
    detectionOrder += 1;
    return problem;
  };

  const fenTag = game.tagMap.get("FEN");
  if (fenTag !== undefined) {
    try {
      position = parseFen(fenTag.value);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      stoppingProblem = report("PV008", fenTag.line, `invalid FEN tag: ${reason}`);
    }
  } else {
    position = standardPosition();
  }
  if (position !== null) {
    fens.push(formatFen(position));
  }

  const resultTag = game.tagMap.get("Result");
  const events: Array<PgnToken | PgnFault> = [...game.tokens, ...game.faults].sort(
    (left, right) => left.order - right.order,
  );

  for (const event of events) {
    if (event.kind === "fault") {
      report(event.code, event.line, event.message);
      continue;
    }

    if (event.kind === "move-number") {
      if (
        position !== null &&
        stoppingProblem === null &&
        event.number !== position.fullmoveNumber
      ) {
        report(
          "PV005",
          event.line,
          `move number ${event.number} where ${position.fullmoveNumber} was expected`,
        );
      }
      continue;
    }

    if (event.kind === "move") {
      if (position === null || stoppingProblem !== null) {
        continue;
      }

      const matches = findMoves(position, event.value);
      if (matches === null) {
        stoppingProblem = report("PV002", event.line, `unreadable move ${show(event.value)}`);
        continue;
      }
      if (matches.length === 0) {
        stoppingProblem = report(
          "PV003",
          event.line,
          `illegal move ${show(event.value)} at move ${position.fullmoveNumber} (${sideName(position)})`,
        );
        continue;
      }
      if (matches.length > 1) {
        const candidates = matches
          .map((move) => formatSan(position as Position, move).replace(/[+#]$/, ""))
          .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
        stoppingProblem = report(
          "PV004",
          event.line,
          `ambiguous move ${show(event.value)} (${candidates.join(" or ")})`,
        );
        continue;
      }

      const move = matches[0];
      if (move === undefined) {
        continue;
      }
      const before = position;
      const after = makeMove(before, move);
      position = after;
      fens.push(formatFen(after));

      const mark = checkMark(event.value);
      if (mark !== null) {
        const checked = inCheck(after, after.sideToMove === "w");
        const checkmated = checked && legalMoves(after).length === 0;
        let mismatch: string | null = null;
        if (!checked) {
          mismatch = "the move gives no check";
        } else if (mark === "+" && checkmated) {
          mismatch = "the move gives checkmate";
        } else if (mark === "#" && !checkmated) {
          mismatch = "the move gives check, not checkmate";
        }
        if (mismatch !== null) {
          report("PV006", event.line, `check mark of ${show(event.value)}: ${mismatch}`);
        }
      }
      continue;
    }

    if (resultTag !== undefined && resultTag.value !== event.value) {
      report(
        "PV007",
        event.line,
        `Result tag ${show(resultTag.value)} does not match the result marker ${show(event.value)}`,
      );
    }

    if (position !== null && stoppingProblem === null) {
      const terminal = expectedTerminalResult(position);
      if (terminal !== null && event.value !== terminal.result) {
        report(
          "PV009",
          event.line,
          `the game ended in ${terminal.kind}, the result should be ${terminal.result}`,
        );
      }
    }
  }

  if (game.result === null) {
    report("PV010", game.lastLine, "game has no result marker");
  }

  const orderedProblems = pending
    .sort((left, right) => {
      const lineOrder = left.problem.line - right.problem.line;
      if (lineOrder !== 0) return lineOrder;
      const leftIsLexical = left.problem.code === "PV001";
      const rightIsLexical = right.problem.code === "PV001";
      if (leftIsLexical !== rightIsLexical) return leftIsLexical ? -1 : 1;
      return left.detectionOrder - right.detectionOrder;
    })
    .map(({ problem }) => problem);

  return {
    fens,
    plies: fens.length === 0 ? 0 : fens.length - 1,
    finalPosition: position,
    problems: orderedProblems,
    stoppingProblem,
  };
}
