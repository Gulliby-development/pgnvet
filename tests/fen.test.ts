import { describe, expect, test } from "bun:test";
import { FenError, formatFen, parseFen } from "../src/fen";

function expectFenError(fen: string, reason: string): void {
  let error: unknown;
  try {
    parseFen(fen);
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(FenError);
  if (error instanceof Error) {
    expect(error.message).toBe(reason);
  }
}

describe("parseFen", () => {
  const invalidCases: readonly (readonly [string, string, string])[] = [
    ["requires six fields", "4k3/8/8/8/8/8/8/4K3 w - - 0", "expected 6 fields"],
    ["requires eight ranks", "4k3/8/8/8/8/8/4K3 w - - 0 1", "placement does not have 8 ranks"],
    ["rejects an invalid piece", "4k3/8/8/8/8/8/8/4K2x w - - 0 1", 'invalid piece "x"'],
    ["rejects zero as a placement digit", "4k3/8/8/8/8/8/8/4K20 w - - 0 1", 'invalid piece "0"'],
    [
      "quotes a non-ASCII invalid piece as one question mark",
      "4k3/8/8/8/8/8/8/4K2😀 w - - 0 1",
      'invalid piece "?"',
    ],
    ["rejects a short rank", "4k3/8/8/8/8/8/8/4K2 w - - 0 1", "rank 1 does not have 8 squares"],
    ["requires a white king", "4k3/8/8/8/8/8/8/8 w - - 0 1", "white needs exactly one king"],
    [
      "rejects multiple white kings",
      "4k3/8/8/8/8/8/8/4K2K w - - 0 1",
      "white needs exactly one king",
    ],
    ["requires a black king", "8/8/8/8/8/8/8/4K3 w - - 0 1", "black needs exactly one king"],
    [
      "rejects multiple black kings",
      "4k2k/8/8/8/8/8/8/4K3 w - - 0 1",
      "black needs exactly one king",
    ],
    [
      "rejects a pawn on the first rank",
      "4k3/8/8/8/8/8/8/P3K3 w - - 0 1",
      "pawn on the first or last rank",
    ],
    [
      "rejects a pawn on the eighth rank",
      "P3k3/8/8/8/8/8/8/4K3 w - - 0 1",
      "pawn on the first or last rank",
    ],
    ["validates active color", "4k3/8/8/8/8/8/8/4K3 x - - 0 1", 'invalid active color "x"'],
    [
      "requires castling rights in order",
      "4k3/8/8/8/8/8/8/4K2R w qK - 0 1",
      'invalid castling field "qK"',
    ],
    [
      "rejects repeated castling rights",
      "4k3/8/8/8/8/8/8/4K2R w KK - 0 1",
      'invalid castling field "KK"',
    ],
    [
      "requires the king and rook for a castling right",
      "4k3/8/8/8/8/8/8/4K3 w K - 0 1",
      'castling right "K" without king and rook on their squares',
    ],
    [
      "validates the en passant square syntax",
      "4k3/8/8/8/8/8/8/4K3 w - z6 0 1",
      'invalid en passant square "z6"',
    ],
    [
      "requires the en passant rank for white to move",
      "4k3/8/8/8/8/8/8/4K3 w - d5 0 1",
      'invalid en passant square "d5"',
    ],
    [
      "requires the en passant rank for black to move",
      "4k3/8/8/8/8/8/8/4K3 b - d4 0 1",
      'invalid en passant square "d4"',
    ],
    [
      "requires an empty en passant target",
      "4k3/8/3N4/3p4/8/8/8/4K3 w - d6 0 1",
      'invalid en passant square "d6"',
    ],
    [
      "requires the pawn that just moved",
      "4k3/8/8/8/8/8/8/4K3 w - d6 0 1",
      'invalid en passant square "d6"',
    ],
    [
      "requires the opposing pawn behind the en passant target",
      "4k3/8/8/3P4/8/8/8/4K3 w - d6 0 1",
      'invalid en passant square "d6"',
    ],
    [
      "requires the en passant origin square to be empty",
      "4k3/3N4/8/3p4/8/8/8/4K3 w - d6 0 1",
      'invalid en passant square "d6"',
    ],
    [
      "requires a numeric halfmove clock",
      "4k3/8/8/8/8/8/8/4K3 w - - x 1",
      'invalid halfmove clock "x"',
    ],
    [
      "rejects a signed halfmove clock",
      "4k3/8/8/8/8/8/8/4K3 w - - -1 1",
      'invalid halfmove clock "-1"',
    ],
    [
      "rejects a decimal halfmove clock",
      "4k3/8/8/8/8/8/8/4K3 w - - 1.0 1",
      'invalid halfmove clock "1.0"',
    ],
    [
      "limits the halfmove clock to nine digits",
      "4k3/8/8/8/8/8/8/4K3 w - - 1000000000 1",
      'invalid halfmove clock "1000000000"',
    ],
    [
      "requires a numeric fullmove number",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 x",
      'invalid fullmove number "x"',
    ],
    [
      "rejects a signed fullmove number",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 +1",
      'invalid fullmove number "+1"',
    ],
    [
      "rejects a decimal fullmove number",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1.0",
      'invalid fullmove number "1.0"',
    ],
    [
      "requires a positive fullmove number",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 0",
      'invalid fullmove number "0"',
    ],
    [
      "limits the fullmove number to nine digits",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1000000000",
      'invalid fullmove number "1000000000"',
    ],
    [
      "rejects a position where the side not to move is in check",
      "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1",
      "the side not to move is in check",
    ],
    [
      "field count takes precedence over malformed placement",
      "4k3/8/8/8/8/8/8/4K w - - 0",
      "expected 6 fields",
    ],
    [
      "rank count takes precedence over piece content",
      "4k3/8/8/8/8/8/4K2x w - - 0 1",
      "placement does not have 8 ranks",
    ],
    [
      "invalid piece takes precedence over rank width",
      "4k3/8/8/8/8/8/8/4Kx1 w - - 0 1",
      'invalid piece "x"',
    ],
    [
      "rank width takes precedence over king counts",
      "4k3/8/8/8/8/8/8/7 w - - 0 1",
      "rank 1 does not have 8 squares",
    ],
    [
      "white king count takes precedence over black king count",
      "8/8/8/8/8/8/8/8 w - - 0 1",
      "white needs exactly one king",
    ],
    [
      "black king count takes precedence over edge pawns",
      "8/8/8/8/8/8/8/P3K3 w - - 0 1",
      "black needs exactly one king",
    ],
    [
      "edge pawns take precedence over active color",
      "4k3/8/8/8/8/8/8/P3K3 x - - 0 1",
      "pawn on the first or last rank",
    ],
    [
      "active color takes precedence over castling syntax",
      "4k3/8/8/8/8/8/8/4K3 x qK - 0 1",
      'invalid active color "x"',
    ],
    [
      "castling syntax takes precedence over castling structure",
      "4k3/8/8/8/8/8/8/4K3 w qK - 0 1",
      'invalid castling field "qK"',
    ],
    [
      "castling structure takes precedence over en passant",
      "4k3/8/8/8/8/8/8/4K3 w K d5 0 1",
      'castling right "K" without king and rook on their squares',
    ],
    [
      "en passant takes precedence over the halfmove clock",
      "4k3/8/8/8/8/8/8/4K3 w - d5 x 1",
      'invalid en passant square "d5"',
    ],
    [
      "halfmove clock takes precedence over the fullmove number",
      "4k3/8/8/8/8/8/8/4K3 w - - x 0",
      'invalid halfmove clock "x"',
    ],
    [
      "fullmove number takes precedence over the side-not-to-move check",
      "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 x",
      'invalid fullmove number "x"',
    ],
  ];

  for (const [name, fen, reason] of invalidCases) {
    test(name, () => {
      expectFenError(fen, reason);
    });
  }

  test("rejects repeated spaces instead of normalizing fields", () => {
    expectFenError("4k3/8/8/8/8/8/8/4K3  w - - 0 1", "expected 6 fields");
  });

  test("rejects tabs instead of treating them as field separators", () => {
    expectFenError("4k3/8/8/8/8/8/8/4K3\tw - - 0 1", "expected 6 fields");
  });

  test("rejects a trailing field separator", () => {
    expectFenError("4k3/8/8/8/8/8/8/4K3 w - - 0 1 ", "expected 6 fields");
  });

  test("accepts a position where the side to move is in check", () => {
    const fen = "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1";

    expect(formatFen(parseFen(fen))).toBe(fen);
  });

  test("formats leading-zero clocks as canonical decimal values", () => {
    expect(formatFen(parseFen("4k3/8/8/8/8/8/8/4K3 w - - 000000000 000000001"))).toBe(
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    );
  });

  test("accepts maximum nine-digit clocks", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 999999999 999999999";

    expect(formatFen(parseFen(fen))).toBe(fen);
  });
});

describe("formatFen", () => {
  const roundTrips: readonly (readonly [string, string])[] = [
    ["the standard starting position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
    ["all ordered castling rights", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"],
    ["white to move after a black double step", "4k3/8/8/3p4/8/8/8/4K3 w - d6 0 1"],
    ["black to move after a white double step", "4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1"],
    [
      "the supplied castling-rich position",
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    ],
  ];

  for (const [name, fen] of roundTrips) {
    test(`round-trips ${name}`, () => {
      expect(formatFen(parseFen(fen))).toBe(fen);
    });
  }

  test("retains the en passant target in the position", () => {
    expect(parseFen("4k3/8/8/3p4/8/8/8/4K3 w - d6 0 1").enPassantSquare).toBe(43);
    expect(parseFen("4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1").enPassantSquare).toBe(20);
  });
});
