import { describe, expect, test } from "bun:test";
import { parseFen, standardPosition } from "../src/fen";
import { perft } from "../src/perft";

describe("perft", () => {
  test("counts one leaf at depth zero from the starting position", () => {
    expect(perft(standardPosition(), 0)).toBe(1);
  });

  test("counts the starting position at depth one", () => {
    expect(perft(standardPosition(), 1)).toBe(20);
  });

  test("counts the starting position at depth two", () => {
    expect(perft(standardPosition(), 2)).toBe(400);
  });

  test("counts the starting position at depth three", () => {
    expect(perft(standardPosition(), 3)).toBe(8902);
  });

  test("counts the starting position at depth four within five seconds", () => {
    const startedAt = performance.now();
    const nodes = perft(standardPosition(), 4);
    const elapsed = performance.now() - startedAt;

    expect(nodes).toBe(197281);
    expect(elapsed).toBeLessThanOrEqual(5000);
  }, 30000);

  test("counts Kiwipete at depth one", () => {
    const position = parseFen(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );

    expect(perft(position, 1)).toBe(48);
  });

  test("counts Kiwipete at depth two", () => {
    const position = parseFen(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );

    expect(perft(position, 2)).toBe(2039);
  });

  test("counts Kiwipete at depth three", () => {
    const position = parseFen(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );

    expect(perft(position, 3)).toBe(97862);
  });

  test("counts the endgame position at depth one", () => {
    const position = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");

    expect(perft(position, 1)).toBe(14);
  });

  test("counts the endgame position at depth two", () => {
    const position = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");

    expect(perft(position, 2)).toBe(191);
  });

  test("counts the endgame position at depth three", () => {
    const position = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");

    expect(perft(position, 3)).toBe(2812);
  });

  test("has no leaves at positive depth from checkmate", () => {
    const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");

    expect(perft(position, 1)).toBe(0);
  });

  test("has no leaves at positive depth from stalemate", () => {
    const position = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

    expect(perft(position, 1)).toBe(0);
  });

  test("counts the terminal position as one leaf at depth zero", () => {
    const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");

    expect(perft(position, 0)).toBe(1);
  });
});
