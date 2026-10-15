import { fileOf, makeMove, rankOf, squareName } from "./board";
import { inCheck, legalMoves } from "./movegen";
import type { Move, Position } from "./types";

const PIECE_LETTERS: Record<Exclude<Move["piece"], "p">, string> = {
  k: "K",
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
};

const ANNOTATION = "(?:!!|\\?\\?|!\\?|\\?!|!|\\?)?";

interface ParsedMove {
  readonly kind: "castle" | "piece" | "pawn";
  readonly destination: string;
  readonly piece?: Move["piece"];
  readonly originFile?: number;
  readonly originRank?: number;
  readonly capture?: boolean;
  readonly promotion?: Move["promotion"];
  readonly castle?: Move["castle"];
}

function parseToken(token: string): ParsedMove | null {
  const castle = new RegExp(`^(O-O(?:-O)?|0-0(?:-0)?)([+#])?${ANNOTATION}$`).exec(token);
  if (castle !== null) {
    const notation = castle[1]?.replaceAll("0", "O");
    return {
      kind: "castle",
      destination: "",
      castle: notation === "O-O" ? "king" : "queen",
    };
  }

  const piece = new RegExp(`^([KQRBN])([a-h])?([1-8])?(x?)([a-h][1-8])([+#])?${ANNOTATION}$`).exec(
    token,
  );
  if (piece !== null) {
    const pieceType = piece[1]?.toLowerCase() as Exclude<Move["piece"], "p"> | undefined;
    const destination = piece[5];
    if (pieceType === undefined || destination === undefined) {
      return null;
    }

    return {
      kind: "piece",
      destination,
      piece: pieceType,
      originFile: piece[2] === undefined ? undefined : piece[2].charCodeAt(0) - 97,
      originRank: piece[3] === undefined ? undefined : Number(piece[3]) - 1,
      capture: piece[4] === "x",
    };
  }

  const pawn = new RegExp(`^([a-h]x)?([a-h][1-8])(?:=([QRBN]))?([+#])?${ANNOTATION}$`).exec(token);
  if (pawn === null) {
    return null;
  }

  const destination = pawn[2];
  if (destination === undefined) {
    return null;
  }

  const captureFile = pawn[1]?.[0];
  const promotion = pawn[3]?.toLowerCase() as Move["promotion"] | undefined;
  return {
    kind: "pawn",
    destination,
    originFile: captureFile === undefined ? undefined : captureFile.charCodeAt(0) - 97,
    capture: captureFile !== undefined,
    promotion: promotion ?? null,
  };
}

function isCapture(move: Move): boolean {
  return move.capture || move.enPassant;
}

/** Format a legal move in standard algebraic notation. */
export function formatSan(position: Position, move: Move): string {
  let notation: string;
  if (move.castle !== null) {
    notation = move.castle === "king" ? "O-O" : "O-O-O";
  } else if (move.piece === "p") {
    notation = isCapture(move)
      ? `${squareName(move.from)[0]}x${squareName(move.to)}`
      : squareName(move.to);
  } else {
    const competitors = legalMoves(position).filter(
      (candidate) =>
        candidate !== move &&
        candidate.from !== move.from &&
        candidate.to === move.to &&
        candidate.piece === move.piece,
    );
    let disambiguation = "";
    if (competitors.length > 0) {
      const sameFile = competitors.some(
        (candidate) => fileOf(candidate.from) === fileOf(move.from),
      );
      const sameRank = competitors.some(
        (candidate) => rankOf(candidate.from) === rankOf(move.from),
      );
      if (!sameFile) {
        disambiguation = squareName(move.from)[0] ?? "";
      } else if (!sameRank) {
        disambiguation = String(rankOf(move.from) + 1);
      } else {
        disambiguation = squareName(move.from);
      }
    }

    notation = `${PIECE_LETTERS[move.piece]}${disambiguation}${isCapture(move) ? "x" : ""}${squareName(move.to)}`;
  }

  if (move.promotion !== null) {
    notation += `=${PIECE_LETTERS[move.promotion]}`;
  }

  const after = makeMove(position, move);
  const checkedSideIsWhite = after.sideToMove === "w";
  if (inCheck(after, checkedSideIsWhite)) {
    notation += legalMoves(after).length === 0 ? "#" : "+";
  }

  return notation;
}

/**
 * Return legal moves named by a SAN token, null for syntax that is not SAN,
 * and an empty array for valid SAN syntax that names no legal move.
 */
export function findMoves(position: Position, token: string): Move[] | null {
  const parsed = parseToken(token);
  if (parsed === null) {
    return null;
  }

  const destinationSquareName = parsed.destination;
  return legalMoves(position).filter((move) => {
    if (parsed.kind === "castle") {
      return move.castle === parsed.castle;
    }

    if (move.piece !== parsed.piece && parsed.kind === "piece") {
      return false;
    }
    if (move.piece !== "p" && parsed.kind === "pawn") {
      return false;
    }
    if (squareName(move.to) !== destinationSquareName) {
      return false;
    }

    if (parsed.originFile !== undefined && fileOf(move.from) !== parsed.originFile) {
      return false;
    }
    if (parsed.originRank !== undefined && rankOf(move.from) !== parsed.originRank) {
      return false;
    }

    const capture = isCapture(move);
    if (parsed.kind === "pawn" && capture !== parsed.capture) {
      return false;
    }
    if (parsed.kind === "piece" && parsed.capture && !capture) {
      return false;
    }

    return parsed.kind === "pawn" ? move.promotion === parsed.promotion : move.promotion === null;
  });
}
