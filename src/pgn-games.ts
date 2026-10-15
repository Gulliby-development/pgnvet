import {
  lexPgn,
  type PgnFault,
  type PgnItem,
  type PgnResult,
  type PgnTag,
  type PgnToken,
} from "./pgn-lexer";

export interface PgnGame {
  readonly number: number;
  readonly startLine: number;
  readonly lastLine: number;
  /** All tags in source order, including earlier values of duplicate names. */
  readonly tags: readonly PgnTag[];
  /** The final value of each tag name, matching PGN's last-duplicate-wins rule. */
  readonly tagMap: ReadonlyMap<string, PgnTag>;
  readonly tokens: readonly PgnToken[];
  readonly faults: readonly PgnFault[];
  readonly result: PgnResult | null;
}

interface MutableGame {
  startLine: number;
  lastLine: number;
  tags: PgnTag[];
  tagMap: Map<string, PgnTag>;
  tokens: PgnToken[];
  faults: PgnFault[];
  hasMovetext: boolean;
  result: PgnResult | null;
}

/** Group the scanner's ordered events into games without creating empty games. */
export function groupPgnItems(items: readonly PgnItem[]): PgnGame[] {
  const games: PgnGame[] = [];
  let current: MutableGame | null = null;

  const start = (line: number): MutableGame => ({
    startLine: line,
    lastLine: line,
    tags: [],
    tagMap: new Map(),
    tokens: [],
    faults: [],
    hasMovetext: false,
    result: null,
  });

  const finish = (): void => {
    if (current === null) return;
    games.push({
      number: games.length + 1,
      startLine: current.startLine,
      lastLine: current.lastLine,
      tags: current.tags,
      tagMap: current.tagMap,
      tokens: current.tokens,
      faults: current.faults,
      result: current.result,
    });
    current = null;
  };

  for (const item of items) {
    const isTagBoundary = item.kind === "tag" || (item.kind === "fault" && item.boundary === "tag");
    if (current !== null && current.result === null && current.hasMovetext && isTagBoundary) {
      finish();
    }

    if (current === null) current = start(item.line);
    if (item.kind === "tag") {
      current.lastLine = item.line;
      current.tags.push(item);
      current.tagMap.set(item.name, item);
    } else if (item.kind === "fault") {
      current.faults.push(item);
    } else {
      current.lastLine = item.line;
      current.tokens.push(item);
      current.hasMovetext = true;
      if (item.kind === "result") {
        current.result = item.value;
        finish();
      }
    }
  }

  finish();
  return games;
}

/** Scan and group a complete PGN text input. */
export function parsePgnGames(text: string): PgnGame[] {
  return groupPgnItems(lexPgn(text));
}
