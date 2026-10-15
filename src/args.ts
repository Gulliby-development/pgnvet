import { show } from "./text";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type ParsedArgs =
  | { command: "help" }
  | { command: "check"; files: string[] }
  | { command: "fen"; file: string; game: number; ply: number | undefined }
  | { command: "moves"; fen: string | undefined }
  | { command: "perft"; depth: number; fen: string | undefined };

const USAGE = [
  "usage: pgnvet check FILE...",
  "       pgnvet fen [--game N] [--ply N] FILE",
  "       pgnvet moves [FEN]",
  "       pgnvet perft DEPTH [FEN]",
].join("\n");

type Command = "check" | "fen" | "moves" | "perft";

function isWholeNumber(value: string): boolean {
  return /^[0-9]{1,9}$/.test(value);
}

function parseSelector(value: string, option: "--game" | "--ply"): number {
  const minimum = option === "--game" ? 1 : 0;
  if (!isWholeNumber(value)) {
    throw new UsageError(`invalid ${option} ${show(value)}`);
  }

  const parsed = Number(value);
  if (parsed < minimum) {
    throw new UsageError(`invalid ${option} ${show(value)}`);
  }
  return parsed;
}

function parseDepth(value: string): number {
  if (!isWholeNumber(value)) {
    throw new UsageError(`invalid DEPTH ${show(value)}`);
  }

  const parsed = Number(value);
  if (parsed < 1 || parsed > 4) {
    throw new UsageError(`invalid DEPTH ${show(value)}`);
  }
  return parsed;
}

/** Parse the command line, preserving the requested validation precedence. */
export function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 1 && args[0] === "--help") {
    return { command: "help" };
  }

  const first = args[0];
  if (first === undefined) {
    throw new UsageError("missing command (check, fen, moves or perft)");
  }

  if (first !== "check" && first !== "fen" && first !== "moves" && first !== "perft") {
    throw new UsageError(`unknown command ${show(first)}`);
  }

  const command: Command = first;
  const operands: string[] = [];
  let gameValue: string | undefined;
  let plyValue: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }

    if (command === "fen" && (argument === "--game" || argument === "--ply")) {
      const value = args[index + 1];
      if (value === undefined) {
        throw new UsageError(`${argument} needs a value`);
      }
      if (argument === "--game") {
        gameValue = value;
      } else {
        plyValue = value;
      }
      index += 1;
      continue;
    }

    if (command === "fen" && argument.startsWith("--game=")) {
      gameValue = argument.slice("--game=".length);
      continue;
    }

    if (command === "fen" && argument.startsWith("--ply=")) {
      plyValue = argument.slice("--ply=".length);
      continue;
    }

    if (argument.startsWith("-") && argument !== "-") {
      throw new UsageError(`unknown option ${show(argument)}`);
    }
    operands.push(argument);
  }

  const game = gameValue === undefined ? 1 : parseSelector(gameValue, "--game");
  const ply = plyValue === undefined ? undefined : parseSelector(plyValue, "--ply");

  if (command === "check") {
    if (operands.length === 0) {
      throw new UsageError("missing FILE");
    }
    if (operands.filter((operand) => operand === "-").length > 1) {
      throw new UsageError("standard input given twice");
    }
    return { command, files: operands };
  }

  if (command === "fen") {
    if (operands.length === 0) {
      throw new UsageError("missing FILE");
    }
    if (operands.length > 1) {
      throw new UsageError("too many arguments");
    }
    const file = operands[0];
    if (file === undefined) {
      throw new UsageError("missing FILE");
    }
    return { command, file, game, ply };
  }

  if (command === "moves") {
    if (operands.length > 1) {
      throw new UsageError("too many arguments");
    }
    return { command, fen: operands[0] };
  }

  if (operands.length === 0) {
    throw new UsageError("missing DEPTH");
  }
  if (operands.length > 2) {
    throw new UsageError("too many arguments");
  }
  const depthArgument = operands[0];
  if (depthArgument === undefined) {
    throw new UsageError("missing DEPTH");
  }
  const depth = parseDepth(depthArgument);
  return { command, depth, fen: operands[1] };
}

/** The exact text printed when --help is the sole argument. */
export function helpText(): string {
  return USAGE;
}
