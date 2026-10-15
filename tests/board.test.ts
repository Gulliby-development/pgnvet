import { describe, expect, test } from "bun:test";
import {
  fileOf,
  formatUci,
  isAttacked,
  makeMove,
  parseSquare,
  rankOf,
  square,
  squareName,
} from "../src/board";
import { formatFen } from "../src/fen";
import type { Move, Piece, Position } from "../src/types";

function sq(name: string): number {
  const value = parseSquare(name);
  if (value === null) {
    throw new Error(`invalid square in test fixture: ${name}`);
  }
  return value;
}

function move(from: string, to: string, piece: Move["piece"], changes: Partial<Move> = {}): Move {
  return {
    from: sq(from),
    to: sq(to),
    piece,
    promotion: null,
    capture: false,
    enPassant: false,
    castle: null,
    ...changes,
  };
}

type FixturePiece = readonly [string, Piece["type"], Piece["color"]];

interface FixtureOptions {
  sideToMove?: "w" | "b";
  castlingRights?: string;
  enPassantSquare?: string | null;
  halfmoveClock?: number;
  fullmoveNumber?: number;
}

function position(pieces: readonly FixturePiece[], options: FixtureOptions = {}): Position {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (const [name, type, color] of pieces) {
    board[sq(name)] = { type, color };
  }

  return {
    board,
    sideToMove: options.sideToMove ?? "w",
    castlingRights: options.castlingRights ?? "",
    enPassantSquare: options.enPassantSquare ? sq(options.enPassantSquare) : null,
    halfmoveClock: options.halfmoveClock ?? 0,
    fullmoveNumber: options.fullmoveNumber ?? 1,
  };
}

describe("board square and UCI helpers", () => {
  test("uses a1 as index 0 and h8 as index 63", () => {
    expect(square(0, 0)).toBe(0);
    expect(square(7, 7)).toBe(63);
    expect(squareName(0)).toBe("a1");
    expect(squareName(63)).toBe("h8");
  });

  test("round trips an interior square through its file and rank", () => {
    const index = square(4, 3);
    expect(index).toBe(28);
    expect(fileOf(index)).toBe(4);
    expect(rankOf(index)).toBe(3);
    expect(squareName(index)).toBe("e4");
  });

  test("rejects file and rank coordinates outside the board", () => {
    expect(() => square(-1, 0)).toThrow(RangeError);
    expect(() => square(8, 0)).toThrow(RangeError);
    expect(() => square(0, -1)).toThrow(RangeError);
    expect(() => square(0, 8)).toThrow(RangeError);
  });

  test("rejects fractional coordinates and invalid square indices", () => {
    expect(() => square(1.5, 0)).toThrow(RangeError);
    expect(() => square(0, 2.5)).toThrow(RangeError);
    expect(() => fileOf(-1)).toThrow(RangeError);
    expect(() => rankOf(64)).toThrow(RangeError);
    expect(() => squareName(1.2)).toThrow(RangeError);
  });

  test("parses only lowercase board squares", () => {
    expect(parseSquare("a1")).toBe(0);
    expect(parseSquare("h8")).toBe(63);
    expect(parseSquare("e4")).toBe(28);
    expect(parseSquare("A1")).toBeNull();
    expect(parseSquare("a0")).toBeNull();
    expect(parseSquare("i4")).toBeNull();
    expect(parseSquare("e44")).toBeNull();
    expect(parseSquare("")).toBeNull();
  });

  test("formats ordinary and promotion moves in UCI notation", () => {
    expect(formatUci(move("e2", "e4", "p"))).toBe("e2e4");
    expect(formatUci(move("a7", "a8", "p", { promotion: "n" }))).toBe("a7a8n");
  });
});

describe("geometric attacks", () => {
  test("finds both forward diagonals of a white pawn, not a straight square", () => {
    const board = position(
      [
        ["e8", "k", "b"],
        ["e4", "p", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    expect(isAttacked(board, sq("d5"), true)).toBe(true);
    expect(isAttacked(board, sq("f5"), true)).toBe(true);
    expect(isAttacked(board, sq("e5"), true)).toBe(false);
    expect(isAttacked(board, sq("d5"), false)).toBe(false);
  });

  test("finds both forward diagonals of a black pawn", () => {
    const board = position([
      ["e8", "k", "b"],
      ["e5", "p", "b"],
      ["e1", "k", "w"],
    ]);
    expect(isAttacked(board, sq("d4"), false)).toBe(true);
    expect(isAttacked(board, sq("f4"), false)).toBe(true);
    expect(isAttacked(board, sq("e4"), false)).toBe(false);
    expect(isAttacked(board, sq("d4"), true)).toBe(false);
  });

  test("finds knight attacks without wrapping across a board edge", () => {
    const board = position(
      [
        ["e8", "k", "b"],
        ["c3", "n", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    expect(isAttacked(board, sq("d5"), true)).toBe(true);
    expect(isAttacked(board, sq("h4"), true)).toBe(false);
    expect(isAttacked(board, sq("d5"), false)).toBe(false);
  });

  test("finds attacks from kings on adjacent squares only", () => {
    const whiteKing = position(
      [
        ["e4", "k", "w"],
        ["e8", "k", "b"],
      ],
      { sideToMove: "b" },
    );
    const blackKing = position([
      ["e4", "k", "b"],
      ["e1", "k", "w"],
    ]);
    expect(isAttacked(whiteKing, sq("d5"), true)).toBe(true);
    expect(isAttacked(blackKing, sq("d5"), false)).toBe(true);
    expect(isAttacked(whiteKing, sq("c5"), true)).toBe(false);
  });

  test("finds rook attacks on ranks and files and stops at blockers", () => {
    const clear = position(
      [
        ["e8", "k", "b"],
        ["a4", "r", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    const blocked = position(
      [
        ["e8", "k", "b"],
        ["a4", "r", "w"],
        ["d4", "p", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    expect(isAttacked(clear, sq("h4"), true)).toBe(true);
    expect(isAttacked(clear, sq("b8"), true)).toBe(false);
    expect(isAttacked(blocked, sq("c4"), true)).toBe(true);
    expect(isAttacked(blocked, sq("h4"), true)).toBe(false);
  });

  test("finds black rook attacks with the requested color", () => {
    const board = position([
      ["e8", "k", "b"],
      ["a4", "r", "b"],
      ["e1", "k", "w"],
    ]);
    expect(isAttacked(board, sq("h4"), false)).toBe(true);
    expect(isAttacked(board, sq("h4"), true)).toBe(false);
  });

  test("finds bishop diagonals and stops before an occupied diagonal square", () => {
    const clear = position(
      [
        ["e8", "k", "b"],
        ["c1", "b", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    const blocked = position(
      [
        ["e8", "k", "b"],
        ["e3", "p", "w"],
        ["c1", "b", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    expect(isAttacked(clear, sq("h6"), true)).toBe(true);
    expect(isAttacked(blocked, sq("d2"), true)).toBe(true);
    expect(isAttacked(blocked, sq("h6"), true)).toBe(false);
  });

  test("finds queen rank and diagonal attacks while honoring blockers", () => {
    const clear = position(
      [
        ["e8", "k", "b"],
        ["d4", "q", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    const blocked = position(
      [
        ["e8", "k", "b"],
        ["d6", "p", "w"],
        ["d4", "q", "w"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b" },
    );
    expect(isAttacked(clear, sq("d8"), true)).toBe(true);
    expect(isAttacked(clear, sq("g7"), true)).toBe(true);
    expect(isAttacked(blocked, sq("d5"), true)).toBe(true);
    expect(isAttacked(blocked, sq("d8"), true)).toBe(false);
  });

  test("returns false for an out-of-range attack target", () => {
    const board = position([
      ["e8", "k", "b"],
      ["e1", "k", "w"],
    ]);
    expect(isAttacked(board, -1, true)).toBe(false);
    expect(isAttacked(board, 64, false)).toBe(false);
  });
});

describe("immutable board transitions", () => {
  test("moves a quiet white piece, advances the turn and preserves its input", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["e2", "n", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 7 },
    );
    const originalFen = formatFen(before);
    const after = makeMove(before, move("e2", "f4", "n"));
    expect(formatFen(before)).toBe(originalFen);
    expect(after.board).not.toBe(before.board);
    expect(after.board[sq("e2")]).toBeNull();
    expect(after.board[sq("f4")]).toEqual({ type: "n", color: "w" });
    expect(after.sideToMove).toBe("b");
    expect(after.halfmoveClock).toBe(8);
    expect(after.fullmoveNumber).toBe(1);
    expect(after.enPassantSquare).toBeNull();
  });

  test("resets the halfmove clock for a pawn move and sets en passant on a double step", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["e2", "p", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 19 },
    );
    const after = makeMove(before, move("e2", "e4", "p"));
    expect(after.halfmoveClock).toBe(0);
    expect(after.enPassantSquare).toBe(sq("e3"));
    expect(after.board[sq("e4")]).toEqual({ type: "p", color: "w" });
    expect(before.enPassantSquare).toBeNull();
  });

  test("sets en passant after a black double pawn step and advances the fullmove", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["e7", "p", "b"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b", halfmoveClock: 9, fullmoveNumber: 6 },
    );
    const after = makeMove(before, move("e7", "e5", "p"));
    expect(after.enPassantSquare).toBe(sq("e6"));
    expect(after.sideToMove).toBe("w");
    expect(after.fullmoveNumber).toBe(7);
    expect(after.halfmoveClock).toBe(0);
  });

  test("clears a stale en passant square after a non-double move", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["d5", "p", "b"],
        ["e5", "p", "w"],
        ["e1", "k", "w"],
      ],
      { enPassantSquare: "d6", halfmoveClock: 4 },
    );
    const after = makeMove(before, move("e5", "e6", "p"));
    expect(after.enPassantSquare).toBeNull();
    expect(after.halfmoveClock).toBe(0);
  });

  test("resets the halfmove clock after a capture", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["e5", "p", "b"],
        ["e4", "r", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 12 },
    );
    const after = makeMove(before, move("e4", "e5", "r", { capture: true }));
    expect(after.halfmoveClock).toBe(0);
    expect(after.board[sq("e5")]).toEqual({ type: "r", color: "w" });
    expect(after.board[sq("e4")]).toBeNull();
  });

  test("removes the captured pawn on an en passant move", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["d5", "p", "b"],
        ["e5", "p", "w"],
        ["e1", "k", "w"],
      ],
      { enPassantSquare: "d6" },
    );
    const after = makeMove(before, move("e5", "d6", "p", { capture: true, enPassant: true }));
    expect(after.board[sq("e5")]).toBeNull();
    expect(after.board[sq("d5")]).toBeNull();
    expect(after.board[sq("d6")]).toEqual({ type: "p", color: "w" });
    expect(after.halfmoveClock).toBe(0);
    expect(after.enPassantSquare).toBeNull();
  });

  test("promotes a pawn to a queen", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["a7", "p", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 6 },
    );
    const after = makeMove(before, move("a7", "a8", "p", { promotion: "q" }));
    expect(after.board[sq("a8")]).toEqual({ type: "q", color: "w" });
    expect(after.halfmoveClock).toBe(0);
  });

  test("promotes a pawn to a rook", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["a7", "p", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 6 },
    );
    const after = makeMove(before, move("a7", "a8", "p", { promotion: "r" }));
    expect(after.board[sq("a8")]).toEqual({ type: "r", color: "w" });
  });

  test("promotes a pawn to a bishop", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["a7", "p", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 6 },
    );
    const after = makeMove(before, move("a7", "a8", "p", { promotion: "b" }));
    expect(after.board[sq("a8")]).toEqual({ type: "b", color: "w" });
  });

  test("promotes a pawn to a knight", () => {
    const before = position(
      [
        ["e8", "k", "b"],
        ["a7", "p", "w"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 6 },
    );
    const after = makeMove(before, move("a7", "a8", "p", { promotion: "n" }));
    expect(after.board[sq("a8")]).toEqual({ type: "n", color: "w" });
  });

  test("removes both white castling rights when the white king moves", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("e1", "e2", "k"));
    expect(after.castlingRights).toBe("kq");
  });

  test("removes both black castling rights when the black king moves", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { sideToMove: "b", castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("e8", "e7", "k"));
    expect(after.castlingRights).toBe("KQ");
  });

  test("removes each white home-rook right when that rook moves", () => {
    const kingside = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQkq" },
    );
    const queenside = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQkq" },
    );
    expect(makeMove(kingside, move("h1", "h2", "r")).castlingRights).toBe("Qkq");
    expect(makeMove(queenside, move("a1", "a2", "r")).castlingRights).toBe("Kkq");
  });

  test("removes each black home-rook right when that rook moves", () => {
    const kingside = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { sideToMove: "b", castlingRights: "KQkq" },
    );
    const queenside = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { sideToMove: "b", castlingRights: "KQkq" },
    );
    expect(makeMove(kingside, move("h8", "h7", "r")).castlingRights).toBe("KQq");
    expect(makeMove(queenside, move("a8", "a7", "r")).castlingRights).toBe("KQk");
  });

  test("removes a captured black home-rook right", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("h1", "h8", "r", { capture: true }));
    expect(after.castlingRights).toBe("Qq");
  });

  test("removes a captured white home-rook right", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { sideToMove: "b", castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("a8", "a1", "r", { capture: true }));
    expect(after.castlingRights).toBe("Kk");
  });

  test("moves the rook as part of kingside castling", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("e1", "g1", "k", { castle: "king" }));
    expect(after.board[sq("g1")]).toEqual({ type: "k", color: "w" });
    expect(after.board[sq("f1")]).toEqual({ type: "r", color: "w" });
    expect(after.board[sq("h1")]).toBeNull();
    expect(after.castlingRights).toBe("kq");
  });

  test("moves the rook as part of queenside castling", () => {
    const before = position(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { sideToMove: "b", castlingRights: "KQkq" },
    );
    const after = makeMove(before, move("e8", "c8", "k", { castle: "queen" }));
    expect(after.board[sq("c8")]).toEqual({ type: "k", color: "b" });
    expect(after.board[sq("d8")]).toEqual({ type: "r", color: "b" });
    expect(after.board[sq("a8")]).toBeNull();
    expect(after.castlingRights).toBe("KQ");
  });

  test("throws when a move starts from an empty square", () => {
    const before = position([
      ["e8", "k", "b"],
      ["e1", "k", "w"],
    ]);
    expect(() => makeMove(before, move("a2", "a3", "p"))).toThrow(
      "no piece on the move's from square",
    );
  });
});
