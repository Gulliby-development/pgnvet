import { describe, expect, test } from "bun:test";
import { formatUci, makeMove, parseSquare } from "../src/board";
import { standardPosition } from "../src/fen";
import { inCheck, legalMoves } from "../src/movegen";
import type { Piece, Position } from "../src/types";

type FixturePiece = readonly [string, Piece["type"], Piece["color"]];

interface FixtureOptions {
  sideToMove?: Position["sideToMove"];
  castlingRights?: string;
  enPassantSquare?: string | null;
  halfmoveClock?: number;
  fullmoveNumber?: number;
}

function fixture(pieces: readonly FixturePiece[], options: FixtureOptions = {}): Position {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (const [name, type, color] of pieces) {
    const square = parseSquare(name);
    if (square === null) {
      throw new Error(`invalid square in movegen fixture: ${name}`);
    }
    board[square] = { type, color };
  }

  const enPassantSquare =
    options.enPassantSquare === undefined || options.enPassantSquare === null
      ? null
      : parseSquare(options.enPassantSquare);
  if (options.enPassantSquare && enPassantSquare === null) {
    throw new Error(`invalid en passant square in movegen fixture: ${options.enPassantSquare}`);
  }

  return {
    board,
    sideToMove: options.sideToMove ?? "w",
    castlingRights: options.castlingRights ?? "",
    enPassantSquare,
    halfmoveClock: options.halfmoveClock ?? 0,
    fullmoveNumber: options.fullmoveNumber ?? 1,
  };
}

function uciMoves(position: Position): string[] {
  return legalMoves(position).map(formatUci).sort();
}

function movesFrom(position: Position, from: string): string[] {
  const square = parseSquare(from);
  if (square === null) {
    throw new Error(`invalid origin square in movegen test: ${from}`);
  }
  return legalMoves(position)
    .filter((move) => move.from === square)
    .map(formatUci)
    .sort();
}

function castleMoves(position: Position): string[] {
  return legalMoves(position)
    .filter((move) => move.castle !== null)
    .map(formatUci)
    .sort();
}

describe("legal move generation", () => {
  test("lists the twenty standard opening moves", () => {
    expect(uciMoves(standardPosition())).toEqual([
      "a2a3",
      "a2a4",
      "b1a3",
      "b1c3",
      "b2b3",
      "b2b4",
      "c2c3",
      "c2c4",
      "d2d3",
      "d2d4",
      "e2e3",
      "e2e4",
      "f2f3",
      "f2f4",
      "g1f3",
      "g1h3",
      "g2g3",
      "g2g4",
      "h2h3",
      "h2h4",
    ]);
  });

  test("keeps a rook pinned on the king's file", () => {
    const position = fixture([
      ["e8", "r", "b"],
      ["g8", "k", "b"],
      ["e2", "r", "w"],
      ["e1", "k", "w"],
    ]);

    expect(uciMoves(position)).toEqual([
      "e1d1",
      "e1d2",
      "e1f1",
      "e1f2",
      "e2e3",
      "e2e4",
      "e2e5",
      "e2e6",
      "e2e7",
      "e2e8",
    ]);
  });

  test("does not let a pinned knight uncover a rook check", () => {
    const position = fixture([
      ["e8", "r", "b"],
      ["g8", "k", "b"],
      ["e2", "n", "w"],
      ["e1", "k", "w"],
    ]);

    expect(uciMoves(position)).toEqual(["e1d1", "e1d2", "e1f1", "e1f2"]);
  });

  test("allows only safe king moves when escaping a rook check", () => {
    const position = fixture([
      ["e8", "r", "b"],
      ["h8", "k", "b"],
      ["e1", "k", "w"],
    ]);

    expect(inCheck(position, true)).toBe(true);
    expect(inCheck(position, false)).toBe(false);
    expect(uciMoves(position)).toEqual(["e1d1", "e1d2", "e1f1", "e1f2"]);
  });

  test("can evade check by interposing or capturing the checking rook", () => {
    const position = fixture([
      ["e8", "r", "b"],
      ["g8", "k", "b"],
      ["b5", "b", "w"],
      ["e1", "k", "w"],
    ]);

    expect(uciMoves(position)).toEqual(["b5e2", "b5e8", "e1d1", "e1d2", "e1f1", "e1f2"]);
  });

  test("double check permits king moves only", () => {
    const position = fixture([
      ["e8", "r", "b"],
      ["g8", "k", "b"],
      ["b4", "b", "b"],
      ["e1", "k", "w"],
    ]);

    expect(inCheck(position, true)).toBe(true);
    expect(uciMoves(position)).toEqual(["e1d1", "e1f1", "e1f2"]);
  });

  test("does not move a king onto an enemy-controlled square or capture its protector", () => {
    const position = fixture([
      ["e3", "k", "b"],
      ["d2", "r", "b"],
      ["e1", "k", "w"],
    ]);

    expect(inCheck(position, true)).toBe(false);
    expect(uciMoves(position)).toEqual(["e1f1"]);
  });

  test("allows a king to move along an open corner's three safe squares", () => {
    const position = fixture([
      ["h8", "k", "b"],
      ["a1", "k", "w"],
    ]);

    expect(uciMoves(position)).toEqual(["a1a2", "a1b1", "a1b2"]);
  });

  test("never generates a move that captures the opposing king", () => {
    const position = fixture([
      ["e8", "k", "b"],
      ["e2", "r", "w"],
      ["e1", "k", "w"],
    ]);

    expect(uciMoves(position)).not.toContain("e2e8");
  });

  test("allows both white castles when rights, paths and squares are safe", () => {
    const position = fixture(
      [
        ["e8", "k", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(castleMoves(position)).toEqual(["e1c1", "e1g1"]);
  });

  test("allows both black castles for the black side to move", () => {
    const position = fixture(
      [
        ["a8", "r", "b"],
        ["e8", "k", "b"],
        ["h8", "r", "b"],
        ["e1", "k", "w"],
      ],
      { sideToMove: "b", castlingRights: "kq" },
    );

    expect(castleMoves(position)).toEqual(["e8c8", "e8g8"]);
  });

  test("blocks kingside castling when f1 is occupied", () => {
    const position = fixture(
      [
        ["e8", "k", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["f1", "b", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(castleMoves(position)).toEqual(["e1c1"]);
  });

  test("blocks queenside castling when b1 is occupied", () => {
    const position = fixture(
      [
        ["e8", "k", "b"],
        ["a1", "r", "w"],
        ["b1", "n", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(castleMoves(position)).toEqual(["e1g1"]);
  });

  test("forbids castling while the king is in check", () => {
    const position = fixture(
      [
        ["e8", "r", "b"],
        ["h8", "k", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(inCheck(position, true)).toBe(true);
    expect(castleMoves(position)).toEqual([]);
  });

  test("does not castle through an attacked transit square", () => {
    const position = fixture(
      [
        ["f8", "r", "b"],
        ["h8", "k", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(castleMoves(position)).toEqual(["e1c1"]);
  });

  test("does not castle onto an attacked destination square", () => {
    const position = fixture(
      [
        ["g8", "r", "b"],
        ["h8", "k", "b"],
        ["a1", "r", "w"],
        ["e1", "k", "w"],
        ["h1", "r", "w"],
      ],
      { castlingRights: "KQ" },
    );

    expect(castleMoves(position)).toEqual(["e1c1"]);
  });

  test("rejects en passant that exposes the white king to a rook", () => {
    const position = fixture(
      [
        ["h8", "k", "b"],
        ["h5", "r", "b"],
        ["f5", "p", "b"],
        ["a5", "k", "w"],
        ["g5", "p", "w"],
      ],
      { enPassantSquare: "f6" },
    );

    expect(inCheck(position, true)).toBe(false);
    expect(movesFrom(position, "g5")).toEqual(["g5g6"]);
  });

  test("rejects en passant that exposes the black king to a rook", () => {
    const position = fixture(
      [
        ["h8", "k", "w"],
        ["h4", "r", "w"],
        ["f4", "p", "w"],
        ["a4", "k", "b"],
        ["g4", "p", "b"],
      ],
      { sideToMove: "b", enPassantSquare: "f3" },
    );

    expect(inCheck(position, false)).toBe(false);
    expect(movesFrom(position, "g4")).toEqual(["g4g3"]);
  });

  test("allows en passant to remove a pawn checking the white king", () => {
    const position = fixture(
      [
        ["a8", "k", "b"],
        ["d5", "p", "b"],
        ["e5", "p", "w"],
        ["e4", "k", "w"],
      ],
      { enPassantSquare: "d6" },
    );
    const enPassant = legalMoves(position).find((move) => formatUci(move) === "e5d6");

    expect(inCheck(position, true)).toBe(true);
    expect(enPassant).toBeDefined();
    if (enPassant) {
      expect(inCheck(makeMove(position, enPassant), true)).toBe(false);
    }
  });

  test("offers every quiet promotion choice on the last rank", () => {
    const position = fixture([
      ["h8", "k", "b"],
      ["a7", "p", "w"],
      ["e1", "k", "w"],
    ]);

    expect(movesFrom(position, "a7")).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  test("offers every capture-promotion choice", () => {
    const position = fixture([
      ["h8", "k", "b"],
      ["b8", "r", "b"],
      ["a7", "p", "w"],
      ["e1", "k", "w"],
    ]);

    expect(movesFrom(position, "a7")).toEqual([
      "a7a8b",
      "a7a8n",
      "a7a8q",
      "a7a8r",
      "a7b8b",
      "a7b8n",
      "a7b8q",
      "a7b8r",
    ]);
  });

  test("does not promote a pawn before it reaches the last rank", () => {
    const position = fixture([
      ["h8", "k", "b"],
      ["a6", "p", "w"],
      ["e1", "k", "w"],
    ]);

    expect(movesFrom(position, "a6")).toEqual(["a6a7"]);
  });

  test("recognizes checkmate as checked with no legal moves", () => {
    const position = fixture(
      [
        ["h8", "k", "b"],
        ["g7", "q", "w"],
        ["g6", "k", "w"],
      ],
      { sideToMove: "b" },
    );

    expect(inCheck(position, false)).toBe(true);
    expect(legalMoves(position)).toEqual([]);
  });

  test("recognizes stalemate as not checked with no legal moves", () => {
    const position = fixture(
      [
        ["h8", "k", "b"],
        ["f7", "q", "w"],
        ["g6", "k", "w"],
      ],
      { sideToMove: "b" },
    );

    expect(inCheck(position, false)).toBe(false);
    expect(legalMoves(position)).toEqual([]);
  });

  test("does not invent a draw rule from the halfmove clock", () => {
    const position = fixture(
      [
        ["h8", "k", "b"],
        ["e1", "k", "w"],
      ],
      { halfmoveClock: 100, fullmoveNumber: 51 },
    );

    expect(uciMoves(position)).toEqual(["e1d1", "e1d2", "e1e2", "e1f1", "e1f2"]);
  });
});
