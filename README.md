# pgnvet

pgnvet is a command-line tool for people who keep chess games as PGN text. It checks game notation by replaying legal chess moves, prints a game's position as FEN, lists legal moves, and counts move trees with perft.

<p align="center"><img src="docs/logo.svg" width="96" alt="" /></p>

[![CI](https://github.com/Gulliby-development/pgnvet/actions/workflows/ci.yml/badge.svg)](https://github.com/Gulliby-development/pgnvet/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Install

Install the project dependencies with `bun install --frozen-lockfile`. Run the CLI directly with Bun; no build step is needed:

```sh
bun run src/main.ts check FILE
```

## Usage

The help synopsis is:

```
usage: pgnvet check FILE...
       pgnvet fen [--game N] [--ply N] FILE
       pgnvet moves [FEN]
       pgnvet perft DEPTH [FEN]
```

Use `check` to replay one or more PGN files. Use `fen` to print a game's final position, or select a game and ply with `--game` and `--ply`. Ply zero is the initial position. Use `moves` to list legal moves in UCI and SAN, and `perft` to count positions to a depth from 1 through 4. The standard starting position is used when a FEN is omitted. Pass `-` as a file to read standard input.

The following `games.pgn` file demonstrates the input and diagnostic report:

```pgn
[Event "Club game"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 {a developing move} Nc6 3. Qh5 $1 Nf6 (3... g6 4. Qf3) 4. Qxf7# 1-0

[Event "Blitz"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe6 1-0

[Event "Two knights"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"]

1. Nd2 *

[Event "Marks"]
[Result "1/2-1/2"]

1. e4 e5 3. Nf3+ Nc6 1-0

[Event "Fool"]
[Result "1/2-1/2"]

1. f3 e5 2. g4 ) Qh4# 1/2-1/2

[Event "Typo"]

1. d4 d5 2. xyz *

[Event "Unfinished"]

1. c4 c5
```

Running `pgnvet check games.pgn` prints:

```
games.pgn:11: PV003 game 2: illegal move "Nxe6" at move 5 (white)
games.pgn:17: PV004 game 3: ambiguous move "Nd2" (Nbd2 or Nfd2)
games.pgn:22: PV005 game 4: move number 3 where 2 was expected
games.pgn:22: PV006 game 4: check mark of "Nf3+": the move gives no check
games.pgn:22: PV007 game 4: Result tag "1/2-1/2" does not match the result marker "1-0"
games.pgn:27: PV001 game 5: unexpected ")"
games.pgn:27: PV009 game 5: the game ended in checkmate, the result should be 0-1
games.pgn:31: PV002 game 6: unreadable move "xyz"
games.pgn:35: PV010 game 7: game has no result marker
9 problems in 6 of 7 games
```

## Rules

pgnvet uses standard chess rules for move legality, check, checkmate, and stalemate. It does not apply draw rules beyond stalemate. Its FEN parser requires six fields, valid piece placement and kings, a valid active color, ordered castling rights, a structurally valid en-passant square, and numeric clocks. A move updates castling rights, en-passant state, and both clocks.

SAN output includes capture markers, the shortest legal disambiguation, promotion notation, and check or checkmate suffixes. Move listings are sorted by UCI text. Perft counts legal move sequences and does not format SAN during recursion.

## Problems

Diagnostics use codes PV001 through PV010:

- **PV001** — PGN syntax fault, such as an invalid tag pair, stray delimiter, or unterminated comment or variation.
- **PV002** — a movetext token is not a move.
- **PV003** — a move is illegal in the current position.
- **PV004** — a SAN token matches multiple legal moves.
- **PV005** — a move number does not match the position's expected fullmove number.
- **PV006** — a supplied check or checkmate suffix does not match the resulting position.
- **PV007** — the Result tag disagrees with the result marker.
- **PV008** — the FEN tag cannot be parsed.
- **PV009** — the result marker disagrees with a final checkmate or stalemate position.
- **PV010** — the game has no result marker.

A replay stops at an unreadable, illegal, or ambiguous move. Lexical problems and a Result-tag mismatch can still be reported after a replay stops.

## PGN

Input is UTF-8. One leading byte-order mark is skipped. Lines are numbered from 1; LF ends a line and CR is whitespace. Tag names start with a letter and may contain letters, digits, and underscores. Repeated tags use the last value. Escaped quotes and backslashes are decoded in tag values.

Brace comments, semicolon-to-end-of-line comments, and nested parenthesized variations are skipped. Numeric annotation glyphs are skipped. Result markers end games; a new tag pair or movetext after an unfinished game starts the next game. The SetUp tag does not affect replay; when present, a FEN tag supplies the starting position.

## Exit codes

- **0** — the command completed successfully.
- **1** — `check` found problems, or `fen` could not follow the selected game to the requested position.
- **2** — usage, input, or FEN error.

Every exit-2 error is written to standard error, with no standard output. Printed lines end with LF on every supported operating system. Standard input is displayed as `<stdin>`; file paths are displayed as typed, with backslashes shown as slashes.

## Development

Run the automated tests and checks with:

```sh
bun test
bun run typecheck
bun run lint
```

---

Built with BAKED
