import { helpText, parseArgs, UsageError } from "./args";
import { formatUci, makeMove } from "./board";
import { FenError, parseFen, standardPosition } from "./fen";
import { inCheck, legalMoves } from "./movegen";
import { perft } from "./perft";
import { parsePgnGames } from "./pgn-games";
import { replay } from "./replay";
import {
  displayPath,
  type FileReplay,
  formatProblemLine,
  type MoveLine,
  type PerftLine,
  renderCheckReport,
  renderMovesReport,
  renderPerftReport,
} from "./report";
import { formatSan } from "./san";
import type { Position } from "./types";

export interface Io {
  readStdin(): Uint8Array;
  readFile(path: string): Uint8Array;
  out(text: string): void;
  err(text: string): void;
}

interface LoadedFile {
  readonly path: string;
  readonly text: string;
}

function writeUsageError(io: Io, message: string): number {
  io.err(`pgnvet: ${message}\n`);
  return 2;
}

function readText(path: string, io: Io): string | null {
  let bytes: Uint8Array;
  try {
    bytes = path === "-" ? io.readStdin() : io.readFile(path);
  } catch {
    writeUsageError(io, `${displayPath(path)}: cannot read the file`);
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    writeUsageError(io, `${displayPath(path)}: input is not valid UTF-8`);
    return null;
  }
}

function loadFen(text: string | undefined): Position {
  return text === undefined ? standardPosition() : parseFen(text);
}

function invalidFen(io: Io, error: unknown): number {
  const reason =
    error instanceof FenError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return writeUsageError(io, `invalid FEN: ${reason}`);
}

function runCheck(files: readonly string[], io: Io): number {
  const loaded: LoadedFile[] = [];
  for (const path of files) {
    const text = readText(path, io);
    if (text === null) return 2;
    loaded.push({ path, text });
  }

  const results: FileReplay[] = loaded.map(({ path, text }) => ({
    path,
    replays: parsePgnGames(text).map(replay),
  }));
  const report = renderCheckReport(results);
  io.out(report);
  return results.some((file) => file.replays.some((game) => game.problems.length > 0)) ? 1 : 0;
}

function runFen(file: string, gameNumber: number, ply: number | undefined, io: Io): number {
  const text = readText(file, io);
  if (text === null) return 2;

  const games = parsePgnGames(text);
  const game = games[gameNumber - 1];
  if (game === undefined) {
    const gameCount = games.length;
    const countText = `${gameCount} ${gameCount === 1 ? "game" : "games"}`;
    return writeUsageError(
      io,
      `${displayPath(file)}: game ${gameNumber} not found (the file has ${countText})`,
    );
  }

  const result = replay(game);
  if (ply !== undefined && ply < result.fens.length) {
    const fen = result.fens[ply];
    if (fen !== undefined) {
      io.out(`${fen}\n`);
      return 0;
    }
  }

  if (result.stoppingProblem !== null) {
    io.err(`pgnvet: ${formatProblemLine(file, result.stoppingProblem)}\n`);
    return 1;
  }

  if (ply !== undefined && ply >= result.fens.length) {
    const actualPlies = result.plies;
    const plyLabel = actualPlies === 1 ? "ply" : "plies";
    return writeUsageError(
      io,
      `${displayPath(file)}: game ${gameNumber} has only ${actualPlies} ${plyLabel}`,
    );
  }

  const finalFen = result.fens[result.fens.length - 1];
  if (finalFen === undefined) {
    if (result.stoppingProblem !== null) {
      io.err(`pgnvet: ${formatProblemLine(file, result.stoppingProblem)}\n`);
      return 1;
    }
    return writeUsageError(io, `${displayPath(file)}: game ${gameNumber} has no position`);
  }

  io.out(`${finalFen}\n`);
  return 0;
}

function moveLines(position: Position): MoveLine[] {
  return legalMoves(position)
    .map((move) => ({
      uci: formatUci(move),
      san: formatSan(position, move),
    }))
    .sort((left, right) => (left.uci < right.uci ? -1 : left.uci > right.uci ? 1 : 0));
}

function runMoves(fen: string | undefined, io: Io): number {
  let position: Position;
  try {
    position = loadFen(fen);
  } catch (error) {
    return invalidFen(io, error);
  }

  const moves = moveLines(position);
  let terminal: "checkmate" | "stalemate" | null = null;
  if (moves.length === 0) {
    terminal = inCheck(position, position.sideToMove === "w") ? "checkmate" : "stalemate";
  }
  io.out(renderMovesReport(moves, terminal));
  return 0;
}

function runPerft(depth: number, fen: string | undefined, io: Io): number {
  let position: Position;
  try {
    position = loadFen(fen);
  } catch (error) {
    return invalidFen(io, error);
  }

  const lines: PerftLine[] = legalMoves(position)
    .map((move) => ({
      move,
      uci: formatUci(move),
    }))
    .sort((left, right) => (left.uci < right.uci ? -1 : left.uci > right.uci ? 1 : 0))
    .map(({ move, uci }) => ({
      uci,
      nodes: perft(makeMove(position, move), depth - 1),
    }));
  const total = lines.reduce((sum, line) => sum + line.nodes, 0);
  io.out(renderPerftReport(lines, total));
  return 0;
}

/** Execute a pgnvet command using injected byte-oriented input and output. */
export function run(args: string[], io: Io): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    if (error instanceof UsageError) {
      return writeUsageError(io, error.message);
    }
    return writeUsageError(io, error instanceof Error ? error.message : String(error));
  }

  switch (parsed.command) {
    case "help":
      io.out(`${helpText()}\n`);
      return 0;
    case "check":
      return runCheck(parsed.files, io);
    case "fen":
      return runFen(parsed.file, parsed.game, parsed.ply, io);
    case "moves":
      return runMoves(parsed.fen, io);
    case "perft":
      return runPerft(parsed.depth, parsed.fen, io);
  }
}
