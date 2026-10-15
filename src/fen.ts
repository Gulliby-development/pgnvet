import { isAttacked, parseSquare, squareName } from "./board";
import { show } from "./text";
import type { Piece, PieceType, Position } from "./types";

const PIECES = "pnbrqkPNBRQK";
const CASTLING_ORDER = "KQkq";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class FenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FenError";
  }
}

/** Parse a six-field FEN string, reporting the first malformed field. */
export function parseFen(text: string): Position {
  const fields = text.split(" ");
  if (fields.length !== 6) {
    throw new FenError("expected 6 fields");
  }

  const placement = fields[0] ?? "";
  const activeColor = fields[1] ?? "";
  const castling = fields[2] ?? "";
  const enPassant = fields[3] ?? "";
  const halfmove = fields[4] ?? "";
  const fullmove = fields[5] ?? "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    throw new FenError("placement does not have 8 ranks");
  }

  const board: (Piece | null)[] = Array(64).fill(null);
  for (let rankOffset = 0; rankOffset < 8; rankOffset += 1) {
    const rankText = ranks[rankOffset] ?? "";
    let file = 0;
    for (const character of rankText) {
      if (/^[1-8]$/.test(character)) {
        file += Number(character);
        continue;
      }
      if (!PIECES.includes(character)) {
        throw new FenError(`invalid piece ${show(character)}`);
      }

      const type = character.toLowerCase() as PieceType;
      const color = character === type ? "b" : "w";
      if (file < 8) {
        board[(7 - rankOffset) * 8 + file] = { type, color };
      }
      file += 1;
    }

    if (file !== 8) {
      throw new FenError(`rank ${8 - rankOffset} does not have 8 squares`);
    }
  }

  let whiteKing = -1;
  let blackKing = -1;
  let whiteKings = 0;
  let blackKings = 0;
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (piece?.type === "k") {
      if (piece.color === "w") {
        whiteKing = index;
        whiteKings += 1;
      } else {
        blackKing = index;
        blackKings += 1;
      }
    }
  }
  if (whiteKings !== 1) {
    throw new FenError("white needs exactly one king");
  }
  if (blackKings !== 1) {
    throw new FenError("black needs exactly one king");
  }

  for (let file = 0; file < 8; file += 1) {
    if (board[file]?.type === "p" || board[56 + file]?.type === "p") {
      throw new FenError("pawn on the first or last rank");
    }
  }

  if (activeColor !== "w" && activeColor !== "b") {
    throw new FenError(`invalid active color ${show(activeColor)}`);
  }

  if (!isValidCastlingField(castling)) {
    throw new FenError(`invalid castling field ${show(castling)}`);
  }
  const castlingRights = castling === "-" ? "" : castling;
  for (const right of castlingRights) {
    const home = castlingHomes(right);
    if (
      board[home.king]?.type !== "k" ||
      board[home.king]?.color !== home.color ||
      board[home.rook]?.type !== "r" ||
      board[home.rook]?.color !== home.color
    ) {
      throw new FenError(`castling right ${show(right)} without king and rook on their squares`);
    }
  }

  let enPassantSquare: number | null = null;
  if (enPassant !== "-") {
    const target = parseSquare(enPassant);
    const expectedRank = activeColor === "w" ? 5 : 2;
    if (target === null || Math.floor(target / 8) !== expectedRank || board[target] !== null) {
      throw new FenError(`invalid en passant square ${show(enPassant)}`);
    }

    const pawnSquare = target + (activeColor === "w" ? -8 : 8);
    const originSquare = target + (activeColor === "w" ? 8 : -8);
    const expectedPawnColor = activeColor === "w" ? "b" : "w";
    if (
      board[pawnSquare]?.type !== "p" ||
      board[pawnSquare]?.color !== expectedPawnColor ||
      board[originSquare] !== null
    ) {
      throw new FenError(`invalid en passant square ${show(enPassant)}`);
    }
    enPassantSquare = target;
  }

  if (!/^[0-9]{1,9}$/.test(halfmove)) {
    throw new FenError(`invalid halfmove clock ${show(halfmove)}`);
  }
  if (!/^[0-9]{1,9}$/.test(fullmove) || Number(fullmove) < 1) {
    throw new FenError(`invalid fullmove number ${show(fullmove)}`);
  }

  const position: Position = {
    board,
    sideToMove: activeColor,
    castlingRights,
    enPassantSquare,
    halfmoveClock: Number(halfmove),
    fullmoveNumber: Number(fullmove),
  };
  if (isAttacked(position, activeColor === "w" ? blackKing : whiteKing, activeColor === "w")) {
    throw new FenError("the side not to move is in check");
  }
  return position;
}

/** Format a position as canonical six-field FEN. */
export function formatFen(position: Position): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let empty = 0;
    let text = "";
    for (let file = 0; file < 8; file += 1) {
      const piece = position.board[rank * 8 + file];
      if (piece === null || piece === undefined) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        text += empty;
        empty = 0;
      }
      text += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    if (empty > 0) {
      text += empty;
    }
    ranks.push(text);
  }

  return [
    ranks.join("/"),
    position.sideToMove,
    position.castlingRights || "-",
    position.enPassantSquare === null ? "-" : squareName(position.enPassantSquare),
    position.halfmoveClock,
    position.fullmoveNumber,
  ].join(" ");
}

/** Return a fresh standard chess starting position. */
export function standardPosition(): Position {
  return parseFen(START_FEN);
}

function isValidCastlingField(value: string): boolean {
  if (value === "-") {
    return true;
  }
  if (value.length === 0 || !/^[KQkq]+$/.test(value)) {
    return false;
  }
  return (
    CASTLING_ORDER.split("")
      .filter((right) => value.includes(right))
      .join("") === value
  );
}

function castlingHomes(right: string): { color: "w" | "b"; king: number; rook: number } {
  switch (right) {
    case "K":
      return { color: "w", king: 4, rook: 7 };
    case "Q":
      return { color: "w", king: 4, rook: 0 };
    case "k":
      return { color: "b", king: 60, rook: 63 };
    default:
      return { color: "b", king: 60, rook: 56 };
  }
}
