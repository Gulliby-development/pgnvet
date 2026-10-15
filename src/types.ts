/**
 * A square is indexed from 0 to 63: a1 is 0, files increase first, and h8 is 63.
 * Callers are responsible for supplying an integer in this range.
 */
export type Square = number;

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";
export type CastleSide = "king" | "queen";

export interface Piece {
  readonly type: PieceType;
  readonly color: Color;
}

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly piece: PieceType;
  readonly promotion: PromotionPiece | null;
  readonly capture: boolean;
  readonly enPassant: boolean;
  readonly castle: CastleSide | null;
}

export interface Position {
  readonly board: readonly (Piece | null)[];
  readonly sideToMove: Color;
  /** Castling rights in canonical FEN order, or an empty string when there are none. */
  readonly castlingRights: string;
  readonly enPassantSquare: Square | null;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
}
