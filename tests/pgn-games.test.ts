import { describe, expect, test } from "bun:test";
import { parsePgnGames } from "../src/pgn-games";

describe("parsePgnGames", () => {
  test("empty input has no games", () => {
    expect(parsePgnGames("")).toEqual([]);
  });

  test("whitespace and comments without items have no games", () => {
    expect(parsePgnGames(" \t\n{only a comment}\n; line comment\n(1. d4)\n")).toEqual([]);
  });

  test("a tag-only game retains its start, last line and tag", () => {
    const games = parsePgnGames('[Event "Club"]\n[Site "Hall"]\n');

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 2,
      tags: [
        { name: "Event", value: "Club", line: 1 },
        { name: "Site", value: "Hall", line: 2 },
      ],
      tokens: [],
      faults: [],
      result: null,
    });
  });

  test("a tag-only game has a last-wins tag map", () => {
    const game = parsePgnGames('[Event "First"]\n[Event "Last"]\n')[0];

    expect(game?.tags.map(({ value }) => value)).toEqual(["First", "Last"]);
    expect(game?.tagMap.get("Event")).toMatchObject({
      name: "Event",
      value: "Last",
      line: 2,
    });
    expect(game?.tagMap.size).toBe(1);
  });

  test("a standalone move starts an unfinished game", () => {
    const game = parsePgnGames("e4\n")[0];

    expect(game).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 1,
      tokens: [{ kind: "move", value: "e4", line: 1 }],
      result: null,
    });
  });

  test("a standalone stray delimiter starts a game with a fault", () => {
    const game = parsePgnGames("\n)\n")[0];

    expect(game).toMatchObject({
      number: 1,
      startLine: 2,
      lastLine: 2,
      tokens: [],
      faults: [{ code: "PV001", message: 'unexpected ")"', line: 2 }],
      result: null,
    });
  });

  test("an unterminated comment starts a game at its opener", () => {
    const game = parsePgnGames("\n{open\n")[0];

    expect(game).toMatchObject({
      number: 1,
      startLine: 2,
      lastLine: 2,
      faults: [{ code: "PV001", message: "unterminated comment", line: 2 }],
      tokens: [],
      result: null,
    });
  });

  test("an unterminated variation starts a game at its opener", () => {
    const game = parsePgnGames("\n(1. d4\n")[0];

    expect(game).toMatchObject({
      number: 1,
      startLine: 2,
      lastLine: 2,
      faults: [{ code: "PV001", message: "unterminated variation", line: 2 }],
      tokens: [],
      result: null,
    });
  });

  test("a malformed tag by itself forms a tag-boundary game", () => {
    const game = parsePgnGames("[Event nope]\n")[0];

    expect(game).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 1,
      tags: [],
      tokens: [],
      faults: [{ code: "PV001", message: "invalid tag pair", line: 1, boundary: "tag" }],
    });
  });

  test("a malformed tag after unfinished movetext begins a new game", () => {
    const games = parsePgnGames("1. e4\n[Event nope]\n1. d4 *");

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 1,
      tokens: [
        { kind: "move-number", value: "1.", line: 1 },
        { kind: "move", value: "e4", line: 1 },
      ],
      result: null,
    });
    expect(games[1]).toMatchObject({
      number: 2,
      startLine: 2,
      lastLine: 3,
      faults: [{ message: "invalid tag pair", line: 2, boundary: "tag" }],
      result: "*",
    });
  });

  test("a tag after movetext without a result starts the next game", () => {
    const games = parsePgnGames('[Event "First"]\n1. e4\n[Event "Second"]\n1. d4 *');

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 2,
      tags: [{ name: "Event", value: "First", line: 1 }],
      result: null,
    });
    expect(games[1]).toMatchObject({
      number: 2,
      startLine: 3,
      lastLine: 4,
      tags: [{ name: "Event", value: "Second", line: 3 }],
      result: "*",
    });
  });

  test("a result ends a game before an adjacent symbol starts another", () => {
    const games = parsePgnGames("1. e4 * 1. d4 *");

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      number: 1,
      startLine: 1,
      lastLine: 1,
      tokens: [
        { kind: "move-number", value: "1." },
        { kind: "move", value: "e4" },
        { kind: "result", value: "*" },
      ],
      result: "*",
    });
    expect(games[1]).toMatchObject({
      number: 2,
      startLine: 1,
      lastLine: 1,
      tokens: [
        { kind: "move-number", value: "1." },
        { kind: "move", value: "d4" },
        { kind: "result", value: "*" },
      ],
      result: "*",
    });
  });

  test("a tag after a result belongs to the following game", () => {
    const games = parsePgnGames('1. e4 *\n[Event "Next"]\n1. d4 *');

    expect(games).toHaveLength(2);
    expect(games[0]?.tags).toEqual([]);
    expect(games[0]?.result).toBe("*");
    expect(games[1]).toMatchObject({
      number: 2,
      startLine: 2,
      tags: [{ name: "Event", value: "Next", line: 2 }],
      result: "*",
    });
  });

  test("comments and variations alone between moves do not split a game", () => {
    const games = parsePgnGames("1. e4 {comment}\n(1. d4 {not ) a boundary}) e5 *");

    expect(games).toHaveLength(1);
    expect(games[0]?.tokens.map(({ kind, value }) => [kind, value])).toEqual([
      ["move-number", "1."],
      ["move", "e4"],
      ["move", "e5"],
      ["result", "*"],
    ]);
  });

  test("a non-tag fault after movetext remains in the same game", () => {
    const games = parsePgnGames("1. e4 ) e5 *");

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      startLine: 1,
      lastLine: 1,
      faults: [{ message: 'unexpected ")"', boundary: "other" }],
      result: "*",
    });
  });

  test("tag-only games remain separate from an adjacent result game", () => {
    const games = parsePgnGames('[Event "Tag only"]\n1. e4 *');

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      startLine: 1,
      tags: [{ name: "Event", value: "Tag only" }],
      tokens: [
        { kind: "move-number", value: "1." },
        { kind: "move", value: "e4" },
        { kind: "result", value: "*" },
      ],
      result: "*",
    });
  });

  test("game line locations follow tags and the last movetext token", () => {
    const games = parsePgnGames('[Event "Located"]\n\n1. e4\n2. e5 *');

    expect(games[0]).toMatchObject({
      startLine: 1,
      lastLine: 4,
      tags: [{ line: 1 }],
      tokens: [
        { kind: "move-number", value: "1.", line: 3 },
        { kind: "move", value: "e4", line: 3 },
        { kind: "move-number", value: "2.", line: 4 },
        { kind: "move", value: "e5", line: 4 },
        { kind: "result", value: "*", line: 4 },
      ],
    });
  });

  test("games are numbered from one in each input", () => {
    expect(parsePgnGames("1. e4 * 1. d4 *").map(({ number }) => number)).toEqual([1, 2]);
    expect(parsePgnGames("1. c4 *").map(({ number }) => number)).toEqual([1]);
  });

  test("result markers preserve their values and end each game", () => {
    const games = parsePgnGames("1. e4 1-0 1. d4 0-1 1. c4 1/2-1/2 1. Nf3 *");

    expect(games.map(({ result }) => result)).toEqual(["1-0", "0-1", "1/2-1/2", "*"]);
    expect(games.map(({ tokens }) => tokens.at(-1)?.kind)).toEqual([
      "result",
      "result",
      "result",
      "result",
    ]);
  });

  test("symbols after a result start a game even when no tag intervenes", () => {
    const games = parsePgnGames("* stray *");

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ number: 1, tokens: [{ kind: "result", value: "*" }] });
    expect(games[1]).toMatchObject({
      number: 2,
      tokens: [
        { kind: "move", value: "stray" },
        { kind: "result", value: "*" },
      ],
    });
  });

  test("last line is the last token line, not a later ignored comment line", () => {
    const game = parsePgnGames("1. e4 *\n\n{comment}\n")[0];

    expect(game?.lastLine).toBe(1);
    expect(game?.tokens.at(-1)).toMatchObject({ kind: "result", line: 1 });
  });

  test("a malformed tag after a result is assigned to a new game", () => {
    const games = parsePgnGames("*\n[broken]\n");

    expect(games).toHaveLength(2);
    expect(games[1]).toMatchObject({
      number: 2,
      startLine: 2,
      faults: [{ code: "PV001", boundary: "tag", line: 2 }],
      result: null,
    });
  });
});
