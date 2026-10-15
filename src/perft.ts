import { makeMove } from "./board";
import { legalMoves } from "./movegen";
import type { Position } from "./types";

/** Count the leaf positions reachable after depth plies of legal play. */
export function perft(position: Position, depth: number): number {
  if (depth <= 0) {
    return 1;
  }

  let nodes = 0;
  for (const move of legalMoves(position)) {
    nodes += perft(makeMove(position, move), depth - 1);
  }
  return nodes;
}
