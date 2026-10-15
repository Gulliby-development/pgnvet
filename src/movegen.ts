import { fileOf, isAttacked, makeMove, rankOf, square } from "./board";
import type { Color, Move, PieceType, Position, PromotionPiece, Square } from "./types";

const KNIGHT_OFFSETS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const ROOK_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const BISHOP_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const PROMOTIONS: readonly PromotionPiece[] = ["q", "r", "b", "n"];

function otherColor(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function pieceAt(position: Position, target: Square) {
  return position.board[target] ?? null;
}

function makeCandidate(
  from: Square,
  to: Square,
  piece: PieceType,
  capture = false,
  promotion: PromotionPiece | null = null,
  enPassant = false,
  castle: Move["castle"] = null,
): Move {
  return { from, to, piece, promotion, capture, enPassant, castle };
}

function appendPawnMove(
  moves: Move[],
  from: Square,
  to: Square,
  capture: boolean,
  enPassant = false,
): void {
  const destinationRank = rankOf(to);
  if (destinationRank === 0 || destinationRank === 7) {
    for (const promotion of PROMOTIONS) {
      moves.push(makeCandidate(from, to, "p", capture, promotion, enPassant));
    }
    return;
  }

  moves.push(makeCandidate(from, to, "p", capture, null, enPassant));
}

function addPawnMoves(position: Position, from: Square, color: Color, moves: Move[]): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  const direction = color === "w" ? 1 : -1;
  const nextRank = rank + direction;

  if (nextRank < 0 || nextRank > 7) {
    return;
  }

  const forward = square(file, nextRank);
  if (pieceAt(position, forward) === null) {
    appendPawnMove(moves, from, forward, false);

    const startingRank = color === "w" ? 1 : 6;
    const doubleRank = rank + direction * 2;
    if (rank === startingRank && pieceAt(position, square(file, doubleRank)) === null) {
      moves.push(makeCandidate(from, square(file, doubleRank), "p"));
    }
  }

  for (const fileOffset of [-1, 1]) {
    const targetFile = file + fileOffset;
    if (targetFile < 0 || targetFile > 7) {
      continue;
    }

    const target = square(targetFile, nextRank);
    const targetPiece = pieceAt(position, target);
    if (targetPiece !== null && targetPiece.color !== color && targetPiece.type !== "k") {
      appendPawnMove(moves, from, target, true);
      continue;
    }

    const enPassantRank = color === "w" ? 4 : 3;
    const targetEnPassantRank = color === "w" ? 5 : 2;
    const capturedPawnSquare = target + (color === "w" ? -8 : 8);
    const capturedPawn = pieceAt(position, capturedPawnSquare);
    if (
      rank === enPassantRank &&
      nextRank === targetEnPassantRank &&
      position.enPassantSquare === target &&
      targetPiece === null &&
      capturedPawn?.type === "p" &&
      capturedPawn.color === otherColor(color)
    ) {
      moves.push(makeCandidate(from, target, "p", true, null, true));
    }
  }
}

function addLeaperMoves(
  position: Position,
  from: Square,
  color: Color,
  piece: "n" | "k",
  offsets: readonly (readonly [number, number])[],
  moves: Move[],
): void {
  const file = fileOf(from);
  const rank = rankOf(from);

  for (const [fileOffset, rankOffset] of offsets) {
    const targetFile = file + fileOffset;
    const targetRank = rank + rankOffset;
    if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) {
      continue;
    }

    const target = square(targetFile, targetRank);
    const targetPiece = pieceAt(position, target);
    if (targetPiece === null) {
      moves.push(makeCandidate(from, target, piece));
    } else if (targetPiece.color !== color && targetPiece.type !== "k") {
      moves.push(makeCandidate(from, target, piece, true));
    }
  }
}

function addSlidingMoves(
  position: Position,
  from: Square,
  color: Color,
  piece: "b" | "r" | "q",
  directions: readonly (readonly [number, number])[],
  moves: Move[],
): void {
  const file = fileOf(from);
  const rank = rankOf(from);

  for (const [fileOffset, rankOffset] of directions) {
    let targetFile = file + fileOffset;
    let targetRank = rank + rankOffset;
    while (targetFile >= 0 && targetFile <= 7 && targetRank >= 0 && targetRank <= 7) {
      const target = square(targetFile, targetRank);
      const targetPiece = pieceAt(position, target);
      if (targetPiece === null) {
        moves.push(makeCandidate(from, target, piece));
      } else {
        if (targetPiece.color !== color && targetPiece.type !== "k") {
          moves.push(makeCandidate(from, target, piece, true));
        }
        break;
      }

      targetFile += fileOffset;
      targetRank += rankOffset;
    }
  }
}

function canCastle(position: Position, color: Color, side: "king" | "queen"): boolean {
  const homeRank = color === "w" ? 0 : 7;
  const kingFrom = square(4, homeRank);
  const king = pieceAt(position, kingFrom);
  if (king?.type !== "k" || king.color !== color) {
    return false;
  }

  const right = color === "w" ? (side === "king" ? "K" : "Q") : side === "king" ? "k" : "q";
  if (!position.castlingRights.includes(right)) {
    return false;
  }

  const rookFrom = square(side === "king" ? 7 : 0, homeRank);
  const rook = pieceAt(position, rookFrom);
  if (rook?.type !== "r" || rook.color !== color) {
    return false;
  }

  const emptyFiles = side === "king" ? [5, 6] : [1, 2, 3];
  for (const file of emptyFiles) {
    if (pieceAt(position, square(file, homeRank)) !== null) {
      return false;
    }
  }

  const enemyIsWhite = color === "b";
  if (isAttacked(position, kingFrom, enemyIsWhite)) {
    return false;
  }

  const transit = square(side === "king" ? 5 : 3, homeRank);
  const transitPosition = makeMove(position, makeCandidate(kingFrom, transit, "k"));
  return !isAttacked(transitPosition, transit, enemyIsWhite);
}

function addCastlingMoves(position: Position, color: Color, kingFrom: Square, moves: Move[]): void {
  const homeRank = color === "w" ? 0 : 7;
  for (const side of ["king", "queen"] as const) {
    if (!canCastle(position, color, side)) {
      continue;
    }

    const destination = square(side === "king" ? 6 : 2, homeRank);
    moves.push(makeCandidate(kingFrom, destination, "k", false, null, false, side));
  }
}

function findKing(position: Position, color: Color): Square | null {
  for (let index = 0; index < position.board.length; index += 1) {
    const piece = position.board[index];
    if (piece?.type === "k" && piece.color === color) {
      return index;
    }
  }
  return null;
}

/** Return whether the requested side's king is currently attacked. */
export function inCheck(position: Position, white: boolean): boolean {
  const color: Color = white ? "w" : "b";
  const king = findKing(position, color);
  return king !== null && isAttacked(position, king, !white);
}

/** Generate every legal move for the side to move. */
export function legalMoves(position: Position): Move[] {
  const color = position.sideToMove;
  if (findKing(position, color) === null) {
    return [];
  }

  const candidates: Move[] = [];
  for (let from = 0; from < position.board.length; from += 1) {
    const piece = position.board[from];
    if (piece === null || piece === undefined || piece.color !== color) {
      continue;
    }

    switch (piece.type) {
      case "p":
        addPawnMoves(position, from, color, candidates);
        break;
      case "n":
        addLeaperMoves(position, from, color, "n", KNIGHT_OFFSETS, candidates);
        break;
      case "b":
        addSlidingMoves(position, from, color, "b", BISHOP_DIRECTIONS, candidates);
        break;
      case "r":
        addSlidingMoves(position, from, color, "r", ROOK_DIRECTIONS, candidates);
        break;
      case "q":
        addSlidingMoves(
          position,
          from,
          color,
          "q",
          [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS],
          candidates,
        );
        break;
      case "k":
        addLeaperMoves(position, from, color, "k", BISHOP_DIRECTIONS, candidates);
        addLeaperMoves(
          position,
          from,
          color,
          "k",
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ],
          candidates,
        );
        addCastlingMoves(position, color, from, candidates);
        break;
    }
  }

  return candidates.filter((candidate) => {
    const after = makeMove(position, candidate);
    const king = findKing(after, color);
    return king !== null && !isAttacked(after, king, color === "b");
  });
}
