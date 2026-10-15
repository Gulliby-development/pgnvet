import { describe, expect, test } from "bun:test";
import { makeMove, parseSquare, squareName } from "../src/board";
import { standardPosition } from "../src/fen";
import { legalMoves } from "../src/movegen";
import { findMoves, formatSan } from "../src/san";
import type { Color, Move, Piece, PieceType, Position, PromotionPiece } from "../src/types";

type FixturePiece = readonly [string, PieceType, Color];

interface PositionOptions {
  sideToMove?: Color;
  castlingRights?: string;
  enPassantSquare?: string | null;
}

function squareIndex(name: string): number {
  const value = parseSquare(name);
  if (value === null) {
    throw new Error(`invalid square in test fixture: ${name}`);
  }
  return value;
}

function position(pieces: readonly FixturePiece[], options: PositionOptions = {}): Position {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (const [name, type, color] of pieces) {
    board[squareIndex(name)] = { type, color };
  }

  return {
    board,
    sideToMove: options.sideToMove ?? "w",
    castlingRights: options.castlingRights ?? "",
    enPassantSquare:
      options.enPassantSquare === undefined || options.enPassantSquare === null
        ? null
        : squareIndex(options.enPassantSquare),
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

function requiredMove(
  board: Position,
  from: string,
  to: string,
  promotion: PromotionPiece | null = null,
): Move {
  const move = legalMoves(board).find(
    (candidate) =>
      candidate.from === squareIndex(from) &&
      candidate.to === squareIndex(to) &&
      candidate.promotion === promotion,
  );
  if (move === undefined) {
    throw new Error(`missing legal test move: ${from}-${to}`);
  }
  return move;
}

function formatMove(
  board: Position,
  from: string,
  to: string,
  promotion: PromotionPiece | null = null,
): string {
  return formatSan(board, requiredMove(board, from, to, promotion));
}

function play(board: Position, token: string): Position {
  const moves = findMoves(board, token);
  if (moves === null || moves.length !== 1) {
    throw new Error(`expected one legal test move for ${token}`);
  }
  const move = moves[0];
  if (move === undefined) {
    throw new Error(`missing legal test move for ${token}`);
  }
  return makeMove(board, move);
}

const CASTLING_POSITION = position(
  [
    ["a1", "r", "w"],
    ["e1", "k", "w"],
    ["h1", "r", "w"],
    ["a8", "r", "b"],
    ["e8", "k", "b"],
    ["h8", "r", "b"],
  ],
  { castlingRights: "KQkq" },
);

describe("formatSan", () => {
  test("formats a quiet pawn move as its destination", () => {
    const board = standardPosition();
    expect(formatMove(board, "e2", "e4")).toBe("e4");
  });

  test("formats a pawn capture with its origin file and x", () => {
    const board = position([
      ["a1", "k", "w"],
      ["d5", "p", "w"],
      ["e6", "p", "b"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "d5", "e6")).toBe("dxe6");
  });

  test("formats en passant as a pawn capture", () => {
    const board = position(
      [
        ["a1", "k", "w"],
        ["e5", "p", "w"],
        ["d5", "p", "b"],
        ["h8", "k", "b"],
      ],
      { enPassantSquare: "d6" },
    );
    expect(formatMove(board, "e5", "d6")).toBe("exd6");
  });

  test("formats a kingside castle with the letter-O form", () => {
    expect(formatMove(CASTLING_POSITION, "e1", "g1")).toBe("O-O");
  });

  test("formats a queenside castle with the letter-O form", () => {
    expect(formatMove(CASTLING_POSITION, "e1", "c1")).toBe("O-O-O");
  });

  test("formats a quiet knight move", () => {
    expect(formatMove(standardPosition(), "g1", "f3")).toBe("Nf3");
  });

  test("formats a piece capture with x", () => {
    const board = position([
      ["e1", "k", "w"],
      ["d4", "n", "w"],
      ["e6", "p", "b"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "d4", "e6")).toBe("Nxe6");
  });

  test("formats a king move with its piece letter", () => {
    const board = position([
      ["e1", "k", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "e1", "d2")).toBe("Kd2");
  });

  test("formats a queen move with its piece letter", () => {
    const board = position([
      ["a1", "k", "w"],
      ["d1", "q", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "d1", "d2")).toBe("Qd2");
  });

  test("formats a rook move with its piece letter", () => {
    const board = position([
      ["a1", "k", "w"],
      ["d1", "r", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "d1", "d2")).toBe("Rd2");
  });

  test("formats a bishop move with its piece letter", () => {
    const board = position([
      ["a1", "k", "w"],
      ["c1", "b", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "c1", "d2")).toBe("Bd2");
  });

  test("formats a knight move with its piece letter", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "b1", "d2")).toBe("Nd2");
  });

  const promotions: readonly (readonly [string, PromotionPiece, string])[] = [
    ["queen", "q", "a8=Q+"],
    ["rook", "r", "a8=R+"],
    ["bishop", "b", "a8=B"],
    ["knight", "n", "a8=N"],
  ];

  for (const [name, promotion, expected] of promotions) {
    test(`formats a ${name} promotion`, () => {
      const board = position([
        ["e1", "k", "w"],
        ["a7", "p", "w"],
        ["e8", "k", "b"],
      ]);
      expect(formatMove(board, "a7", "a8", promotion)).toBe(expected);
    });
  }

  test("disambiguates knights by file when their origins share a rank", () => {
    const board = position([
      ["d1", "k", "w"],
      ["b1", "n", "w"],
      ["f1", "n", "w"],
      ["e8", "k", "b"],
    ]);
    expect(formatMove(board, "b1", "d2")).toBe("Nbd2");
    expect(formatMove(board, "f1", "d2")).toBe("Nfd2");
  });

  test("disambiguates knights by rank when their origins share a file", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["b3", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "b1", "d2")).toBe("N1d2");
    expect(formatMove(board, "b3", "d2")).toBe("N3d2");
  });

  test("uses both file and rank when separate competitors require each", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["f1", "n", "w"],
      ["b3", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(formatMove(board, "b1", "d2")).toBe("Nb1d2");
  });

  test("adds plus when a move gives check but not mate", () => {
    const board = position([
      ["a1", "k", "w"],
      ["d5", "n", "w"],
      ["e8", "k", "b"],
    ]);
    expect(formatMove(board, "d5", "f6")).toBe("Nf6+");
  });

  test("adds hash when a move gives checkmate", () => {
    let board = standardPosition();
    board = play(board, "f3");
    board = play(board, "e5");
    board = play(board, "g4");
    expect(formatMove(board, "d8", "h4")).toBe("Qh4#");
  });
});

describe("findMoves", () => {
  test("matches a normal pawn move in the starting position", () => {
    expect(findMoves(standardPosition(), "e4")).toHaveLength(1);
  });

  test("matches a normal piece move in the starting position", () => {
    expect(findMoves(standardPosition(), "Nf3")).toHaveLength(1);
  });

  test("matches each uppercase piece letter", () => {
    const kingPosition = position([
      ["e1", "k", "w"],
      ["h8", "k", "b"],
    ]);
    const queenPosition = position([
      ["a1", "k", "w"],
      ["d1", "q", "w"],
      ["h8", "k", "b"],
    ]);
    const rookPosition = position([
      ["a1", "k", "w"],
      ["d1", "r", "w"],
      ["h8", "k", "b"],
    ]);
    const bishopPosition = position([
      ["a1", "k", "w"],
      ["c1", "b", "w"],
      ["h8", "k", "b"],
    ]);
    const knightPosition = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["h8", "k", "b"],
    ]);

    expect(findMoves(kingPosition, "Kd2")).toHaveLength(1);
    expect(findMoves(queenPosition, "Qd2")).toHaveLength(1);
    expect(findMoves(rookPosition, "Rd2")).toHaveLength(1);
    expect(findMoves(bishopPosition, "Bd2")).toHaveLength(1);
    expect(findMoves(knightPosition, "Nd2")).toHaveLength(1);
  });

  test("matches kingside castling in letter and zero forms", () => {
    expect(findMoves(CASTLING_POSITION, "O-O")).toHaveLength(1);
    expect(findMoves(CASTLING_POSITION, "0-0")).toHaveLength(1);
  });

  test("matches queenside castling in letter and zero forms", () => {
    expect(findMoves(CASTLING_POSITION, "O-O-O")).toHaveLength(1);
    expect(findMoves(CASTLING_POSITION, "0-0-0")).toHaveLength(1);
  });

  test("filters piece moves by origin file", () => {
    const board = position([
      ["d1", "k", "w"],
      ["b1", "n", "w"],
      ["f1", "n", "w"],
      ["e8", "k", "b"],
    ]);
    expect(findMoves(board, "Nbd2")?.map((move) => squareName(move.from))).toEqual(["b1"]);
  });

  test("filters piece moves by origin rank", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["b3", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "N1d2")?.map((move) => squareName(move.from))).toEqual(["b1"]);
  });

  test("filters piece moves by both origin file and rank", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["f1", "n", "w"],
      ["b3", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "Nb1d2")?.map((move) => squareName(move.from))).toEqual(["b1"]);
  });

  test("accepts piece moves with capture x omitted when capturing", () => {
    const board = position([
      ["e1", "k", "w"],
      ["d4", "n", "w"],
      ["e6", "p", "b"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "Ne6")?.map((move) => move.capture)).toEqual([true]);
  });

  test("requires a capture when piece SAN includes x", () => {
    const board = position([
      ["e1", "k", "w"],
      ["d4", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "Nxe6")).toEqual([]);
  });

  test("requires the origin file and x for a pawn capture", () => {
    const board = position([
      ["a1", "k", "w"],
      ["d5", "p", "w"],
      ["e6", "p", "b"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "dxe6")).toHaveLength(1);
    expect(findMoves(board, "e6")).toEqual([]);
    expect(findMoves(board, "de6")).toBeNull();
  });

  test("matches an en-passant capture as a pawn capture", () => {
    const board = position(
      [
        ["a1", "k", "w"],
        ["e5", "p", "w"],
        ["d5", "p", "b"],
        ["h8", "k", "b"],
      ],
      { enPassantSquare: "d6" },
    );
    const moves = findMoves(board, "exd6");
    expect(moves).toHaveLength(1);
    expect(moves?.[0]?.enPassant).toBe(true);
  });

  const promotionTokens: readonly (readonly [string, PromotionPiece])[] = [
    ["a8=Q", "q"],
    ["a8=R", "r"],
    ["a8=B", "b"],
    ["a8=N", "n"],
  ];

  for (const [token, promotion] of promotionTokens) {
    test(`matches pawn promotion ${token}`, () => {
      const board = position([
        ["e1", "k", "w"],
        ["a7", "p", "w"],
        ["e8", "k", "b"],
      ]);
      const moves = findMoves(board, token);
      expect(moves).toHaveLength(1);
      expect(moves?.[0]?.promotion).toBe(promotion);
    });
  }

  test("matches a capture promotion with its origin file and x", () => {
    const board = position([
      ["e1", "k", "w"],
      ["a7", "p", "w"],
      ["b8", "r", "b"],
      ["h8", "k", "b"],
    ]);
    const moves = findMoves(board, "axb8=Q");
    expect(moves).toHaveLength(1);
    expect(moves?.[0]?.capture).toBe(true);
    expect(moves?.[0]?.promotion).toBe("q");
  });

  const annotations: readonly (readonly [string, string])[] = [
    ["!", "Nf3!"],
    ["?", "Nf3?"],
    ["!!", "Nf3!!"],
    ["??", "Nf3??"],
    ["!?", "Nf3!?"],
    ["?!", "Nf3?!"],
  ];

  for (const [annotation, token] of annotations) {
    test(`accepts the ${annotation} annotation suffix`, () => {
      expect(findMoves(standardPosition(), token)).toHaveLength(1);
    });
  }

  test("accepts an optional check suffix", () => {
    expect(findMoves(standardPosition(), "Nf3+")).toHaveLength(1);
  });

  test("accepts a check suffix followed by an annotation", () => {
    expect(findMoves(standardPosition(), "Nf3#?!")).toHaveLength(1);
  });

  test("returns all legal matches for an ambiguous SAN token", () => {
    const board = position([
      ["e1", "k", "w"],
      ["b1", "n", "w"],
      ["f1", "n", "w"],
      ["b3", "n", "w"],
      ["h8", "k", "b"],
    ]);
    expect(findMoves(board, "Nd2")?.map((move) => squareName(move.from))).toEqual([
      "b1",
      "f1",
      "b3",
    ]);
  });

  test("returns null for tokens that are not SAN syntax", () => {
    const board = standardPosition();
    const invalidTokens = ["", "xyz", "nf3", "Nf9", "e.p.", "a8=K", "Nf3!?!!", "O-O-O-O"];

    for (const token of invalidTokens) {
      expect(findMoves(board, token)).toBeNull();
    }
  });

  test("returns an empty array for valid syntax with no legal move", () => {
    const board = position([
      ["e1", "k", "w"],
      ["e8", "k", "b"],
    ]);
    expect(findMoves(board, "Nf3")).toEqual([]);
    expect(findMoves(board, "e4")).toEqual([]);
    expect(findMoves(board, "a8=Q")).toEqual([]);
  });

  test("requires promotion notation for a pawn reaching its last rank", () => {
    const board = position([
      ["e1", "k", "w"],
      ["a7", "p", "w"],
      ["e8", "k", "b"],
    ]);
    expect(findMoves(board, "a8")).toEqual([]);
    expect(findMoves(board, "a8=Q")).toHaveLength(1);
  });

  test("does not accept promotion notation on a non-promotion move", () => {
    const board = position([
      ["e1", "k", "w"],
      ["a2", "p", "w"],
      ["e8", "k", "b"],
    ]);
    expect(findMoves(board, "a3=Q")).toEqual([]);
  });
});
