import type { Replay } from "./replay";
import { plural } from "./text";

export interface FileReplay {
  readonly path: string;
  readonly replays: readonly Replay[];
}

export interface MoveLine {
  readonly uci: string;
  readonly san: string;
}

export interface PerftLine {
  readonly uci: string;
  readonly nodes: number;
}

/** Display a file name using the command-line spelling and portable separators. */
export function displayPath(path: string): string {
  return path === "-" ? "<stdin>" : path.replaceAll("\\", "/");
}

/** Format a diagnostic with its source file and game location. */
export function formatProblemLine(path: string, problem: Replay["problems"][number]): string {
  return `${displayPath(path)}:${problem.line}: ${problem.code} game ${problem.game}: ${problem.message}`;
}

/** Render check diagnostics in input-file order followed by the aggregate summary. */
export function renderCheckReport(files: readonly FileReplay[]): string {
  const problemLines: string[] = [];
  let gameCount = 0;
  let gamesWithProblems = 0;
  let moveCount = 0;

  for (const file of files) {
    for (const replay of file.replays) {
      gameCount += 1;
      moveCount += replay.plies;
      if (replay.problems.length > 0) {
        gamesWithProblems += 1;
        for (const problem of replay.problems) {
          problemLines.push(formatProblemLine(file.path, problem));
        }
      }
    }
  }

  if (problemLines.length > 0) {
    problemLines.push(
      `${problemLines.length} ${plural(problemLines.length, "problem", "problems")} in ${gamesWithProblems} of ${gameCount} ${plural(gameCount, "game", "games")}`,
    );
    return `${problemLines.join("\n")}\n`;
  }

  return `ok, ${gameCount} ${plural(gameCount, "game", "games")}, ${moveCount} ${plural(moveCount, "move", "moves")}\n`;
}

/** Render the sorted UCI/SAN listing and its terminal state or move count. */
export function renderMovesReport(
  moves: readonly MoveLine[],
  terminal: "checkmate" | "stalemate" | null,
): string {
  if (moves.length === 0) {
    return `0 moves, ${terminal ?? "stalemate"}\n`;
  }

  const lines = moves.map(({ uci, san }) => `${uci} ${san}`);
  lines.push(`${moves.length} ${plural(moves.length, "move", "moves")}`);
  return `${lines.join("\n")}\n`;
}

/** Render root perft counts followed by the total number of leaf positions. */
export function renderPerftReport(lines: readonly PerftLine[], nodes: number): string {
  const output = lines.map(({ uci, nodes: count }) => `${uci}: ${count}`);
  output.push(`nodes ${nodes}`);
  return `${output.join("\n")}\n`;
}
