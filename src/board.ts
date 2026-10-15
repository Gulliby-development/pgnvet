import type { Move, Piece, Position, Square } from "./types";

const FILES = "abcdefgh";

function isSquare(square: number): boolean {
  return Number.isInteger(square) && square >= 0 && square < 64;
}

/** Convert zero-based file and rank coordinates to the a1=0 square index. */
export function square(file: number, rank: number): Square {
  if (
    !Number.isInteger(file) ||
    !Number.isInteger(rank) ||
    file < 0 ||
    file > 7 ||
    rank < 0 ||
    rank > 7
  ) {
    throw new RangeError("file and rank must be integers from 0 to 7");
  }

  return rank * 8 + file;
}

/** Return the zero-based file coordinate of a valid square. */
export function fileOf(squareIndex: Square): number {
  if (!isSquare(squareIndex)) {
    throw new RangeError("square must be an integer from 0 to 63");
  }

  return squareIndex % 8;
}

/** Return the zero-based rank coordinate of a valid square. */
export function rankOf(squareIndex: Square): number {
  if (!isSquare(squareIndex)) {
    throw new RangeError("square must be an integer from 0 to 63");
  }

  return Math.floor(squareIndex / 8);
}

/** Convert a square index to algebraic notation, such as a1 or h8. */
export function squareName(squareIndex: Square): string {
  return `${FILES[fileOf(squareIndex)]}${rankOf(squareIndex) + 1}`;
}

/** Parse algebraic square notation, returning null when it is not a square. */
export function parseSquare(text: string): Square | null {
  if (!/^[a-h][1-8]$/.test(text)) {
    return null;
  }

  const file = FILES.indexOf(text[0] ?? "");
  const rank = Number(text[1]) - 1;
  return square(file, rank);
}

/** Format a move in UCI coordinate notation. */
export function formatUci(move: Move): string {
  const promotion = move.promotion ?? "";
  return `${squareName(move.from)}${squareName(move.to)}${promotion}`;
}

/**
 * Return whether a square is attacked by the requested color.
 * This deliberately checks geometric attacks only; it does not ask whether an
 * attacking piece is pinned or whether moving it would expose its own king.
 */
export function isAttacked(position: Position, target: Square, byWhite: boolean): boolean {
  if (!isSquare(target)) {
    return false;
  }

  const targetFile = fileOf(target);
  const targetRank = rankOf(target);
  const attackerColor = byWhite ? "w" : "b";
  const pawnRank = targetRank + (byWhite ? -1 : 1);

  for (const fileOffset of [-1, 1]) {
    const file = targetFile + fileOffset;
    if (
      file >= 0 &&
      file <= 7 &&
      pawnRank >= 0 &&
      pawnRank <= 7 &&
      position.board[square(file, pawnRank)]?.type === "p" &&
      position.board[square(file, pawnRank)]?.color === attackerColor
    ) {
      return true;
    }
  }

  const knightOffsets = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ];
  for (const [fileOffset, rankOffset] of knightOffsets) {
    const file = targetFile + (fileOffset ?? 0);
    const rank = targetRank + (rankOffset ?? 0);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      continue;
    }

    const piece = position.board[square(file, rank)];
    if (piece?.type === "n" && piece.color === attackerColor) {
      return true;
    }
  }

  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) {
        continue;
      }

      const file = targetFile + fileOffset;
      const rank = targetRank + rankOffset;
      if (file < 0 || file > 7 || rank < 0 || rank > 7) {
        continue;
      }

      const piece = position.board[square(file, rank)];
      if (piece?.type === "k" && piece.color === attackerColor) {
        return true;
      }
    }
  }

  const rays = [
    { file: 1, rank: 0, slider: "r" },
    { file: -1, rank: 0, slider: "r" },
    { file: 0, rank: 1, slider: "r" },
    { file: 0, rank: -1, slider: "r" },
    { file: 1, rank: 1, slider: "b" },
    { file: 1, rank: -1, slider: "b" },
    { file: -1, rank: 1, slider: "b" },
    { file: -1, rank: -1, slider: "b" },
  ] as const;

  for (const ray of rays) {
    let file = targetFile + ray.file;
    let rank = targetRank + ray.rank;
    while (file >= 0 && file <= 7 && rank >= 0 && rank <= 7) {
      const piece = position.board[square(file, rank)];
      if (piece !== null && piece !== undefined) {
        if (piece.color === attackerColor && (piece.type === ray.slider || piece.type === "q")) {
          return true;
        }
        break;
      }

      file += ray.file;
      rank += ray.rank;
    }
  }

  return false;
}

function withoutRight(rights: string, right: string): string {
  return rights.replace(right, "");
}

function rookRight(color: Piece["color"], homeSquare: Square): string | null {
  if (color === "w") {
    if (homeSquare === square(7, 0)) return "K";
    if (homeSquare === square(0, 0)) return "Q";
  } else {
    if (homeSquare === square(7, 7)) return "k";
    if (homeSquare === square(0, 7)) return "q";
  }
  return null;
}

/** Apply a move to a fresh position, leaving the input position untouched. */
export function makeMove(position: Position, move: Move): Position {
  const movingPiece = position.board[move.from];
  if (movingPiece === null || movingPiece === undefined) {
    throw new Error("no piece on the move's from square");
  }

  const board = position.board.slice();
  const capturedPiece = board[move.to] ?? null;
  const enPassantCaptureSquare = move.enPassant
    ? move.to + (movingPiece.color === "w" ? -8 : 8)
    : null;
  const actualCapturedPiece =
    enPassantCaptureSquare === null ? capturedPiece : (board[enPassantCaptureSquare] ?? null);

  board[move.from] = null;
  if (enPassantCaptureSquare !== null) {
    board[enPassantCaptureSquare] = null;
  }
  const placedPiece: Piece =
    move.promotion === null ? movingPiece : { type: move.promotion, color: movingPiece.color };
  board[move.to] = placedPiece;

  let castlingRights = position.castlingRights;
  if (movingPiece.type === "k") {
    castlingRights = withoutRight(
      withoutRight(castlingRights, movingPiece.color === "w" ? "K" : "k"),
      movingPiece.color === "w" ? "Q" : "q",
    );
  }
  if (movingPiece.type === "r") {
    const right = rookRight(movingPiece.color, move.from);
    if (right !== null) {
      castlingRights = withoutRight(castlingRights, right);
    }
  }
  if (actualCapturedPiece?.type === "r") {
    const right = rookRight(actualCapturedPiece.color, move.to);
    if (right !== null) {
      castlingRights = withoutRight(castlingRights, right);
    }
  }

  const fromFile = fileOf(move.from);
  const toFile = fileOf(move.to);
  const fromRank = rankOf(move.from);
  const toRank = rankOf(move.to);
  const isDoublePawnStep =
    movingPiece.type === "p" && fromFile === toFile && Math.abs(toRank - fromRank) === 2;
  const enPassantSquare = isDoublePawnStep ? square(fromFile, (fromRank + toRank) / 2) : null;

  if (move.castle !== null) {
    const homeRank = movingPiece.color === "w" ? 0 : 7;
    const rookFrom = square(move.castle === "king" ? 7 : 0, homeRank);
    const rookTo = square(move.castle === "king" ? 5 : 3, homeRank);
    board[rookTo] = board[rookFrom] ?? null;
    board[rookFrom] = null;
  }

  const isCapture = move.capture || move.enPassant || capturedPiece !== null;

  return {
    board,
    sideToMove: position.sideToMove === "w" ? "b" : "w",
    castlingRights,
    enPassantSquare,
    halfmoveClock: movingPiece.type === "p" || isCapture ? 0 : position.halfmoveClock + 1,
    fullmoveNumber: position.fullmoveNumber + (position.sideToMove === "b" ? 1 : 0),
  };
}
