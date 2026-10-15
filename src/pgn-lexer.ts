import { show } from "./text";

export type PgnResult = "1-0" | "0-1" | "1/2-1/2" | "*";

interface LocatedItem {
  readonly line: number;
  readonly offset: number;
  readonly order: number;
}

export interface PgnTag extends LocatedItem {
  readonly kind: "tag";
  readonly name: string;
  readonly value: string;
}

export interface PgnMoveNumber extends LocatedItem {
  readonly kind: "move-number";
  readonly value: string;
  readonly number: number;
  readonly dots: string;
}

export interface PgnMove extends LocatedItem {
  readonly kind: "move";
  readonly value: string;
}

export interface PgnResultToken extends LocatedItem {
  readonly kind: "result";
  readonly value: PgnResult;
}

export type PgnToken = PgnMoveNumber | PgnMove | PgnResultToken;

export interface PgnFault extends LocatedItem {
  readonly kind: "fault";
  readonly code: "PV001";
  readonly message: string;
  /** A malformed tag still marks a tag boundary for game grouping. */
  readonly boundary: "tag" | "other";
}

export type PgnItem = PgnTag | PgnToken | PgnFault;

const RESULTS = new Set<PgnResult>(["1-0", "0-1", "1/2-1/2", "*"]);
const SYMBOL_DELIMITERS = new Set(["{", "}", ";", "(", ")", "[", "]", '"']);

function isWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\v" ||
    character === "\f"
  );
}

function isLetter(character: string): boolean {
  return (character >= "A" && character <= "Z") || (character >= "a" && character <= "z");
}

function isTagNameContinuation(character: string): boolean {
  return isLetter(character) || (character >= "0" && character <= "9") || character === "_";
}

/**
 * Scan PGN text into line-aware tags, movetext tokens and PV001 lexical faults.
 * Only the first leading BOM is removed; any following BOM remains input text.
 */
export function lexPgn(text: string): PgnItem[] {
  const scanner = new PgnScanner(text);
  return scanner.scan();
}

class PgnScanner {
  private index = 0;
  private line = 1;
  private order = 0;
  private readonly items: PgnItem[] = [];

  constructor(private readonly text: string) {
    if (text.startsWith("\uFEFF")) this.index = 1;
  }

  scan(): PgnItem[] {
    while (this.index < this.text.length) {
      const character = this.text.charAt(this.index);

      if (isWhitespace(character)) {
        this.consume();
      } else if (character === "{") {
        this.skipBraceComment();
      } else if (character === ";") {
        this.skipLine();
      } else if (character === "(") {
        const openerLine = this.line;
        this.consume();
        if (!this.skipVariation(openerLine)) break;
      } else if (character === ")") {
        this.fault(`unexpected ${show(character)}`, this.line, this.index, "other");
        this.consume();
      } else if (character === "]" || character === '"') {
        this.fault(`unexpected ${show(character)}`, this.line, this.index, "other");
        this.consume();
      } else if (character === "[") {
        this.scanTag();
      } else if (character === "}") {
        // A closing brace outside a comment is a delimiter, but is not a PGN fault.
        this.consume();
      } else {
        this.scanSymbol();
      }
    }

    return this.items;
  }

  private consume(): string {
    const character = this.text.charAt(this.index);
    this.index += 1;
    if (character === "\n") this.line += 1;
    return character;
  }

  private skipLine(): void {
    while (this.index < this.text.length && this.text[this.index] !== "\n") this.consume();
  }

  private skipBraceComment(): boolean {
    const openerLine = this.line;
    const openerOffset = this.index;
    this.consume();

    while (this.index < this.text.length) {
      if (this.consume() === "}") return true;
    }

    this.fault("unterminated comment", openerLine, openerOffset, "other");
    return false;
  }

  /** Skip a complete variation, interpreting comments so their parentheses are inert. */
  private skipVariation(openerLine: number): boolean {
    const openerOffset = this.index - 1;
    let depth = 1;

    while (this.index < this.text.length) {
      const character = this.text.charAt(this.index);
      if (character === "{") {
        if (!this.skipBraceComment()) return false;
      } else if (character === ";") {
        this.skipLine();
      } else if (character === "(") {
        depth += 1;
        this.consume();
      } else if (character === ")") {
        depth -= 1;
        this.consume();
        if (depth === 0) return true;
      } else {
        this.consume();
      }
    }

    this.fault("unterminated variation", openerLine, openerOffset, "other");
    return false;
  }

  private scanTag(): void {
    const openerLine = this.line;
    const openerOffset = this.index;
    this.consume();

    const invalid = (): void => {
      this.fault("invalid tag pair", openerLine, openerOffset, "tag");
      this.skipLine();
    };
    const skipTagSpaces = (): void => {
      while (this.index < this.text.length) {
        const character = this.text.charAt(this.index);
        if (character !== " " && character !== "\t") break;
        this.consume();
      }
    };

    skipTagSpaces();
    const nameStart = this.index;
    if (this.index >= this.text.length || !isLetter(this.text.charAt(this.index))) {
      invalid();
      return;
    }
    this.consume();
    while (this.index < this.text.length && isTagNameContinuation(this.text.charAt(this.index)))
      this.consume();
    const name = this.text.slice(nameStart, this.index);

    skipTagSpaces();
    if (this.text[this.index] !== '"') {
      invalid();
      return;
    }
    this.consume();

    let value = "";
    let closedQuote = false;
    while (this.index < this.text.length && this.text[this.index] !== "\n") {
      const character = this.text.charAt(this.index);
      if (character === '"') {
        this.consume();
        closedQuote = true;
        break;
      }
      if (character === "\\") {
        const next = this.text[this.index + 1];
        if (next === '"' || next === "\\") {
          this.consume();
          value += this.consume();
        } else {
          value += this.consume();
        }
      } else {
        value += this.consume();
      }
    }
    if (!closedQuote) {
      invalid();
      return;
    }

    skipTagSpaces();
    if (this.text[this.index] !== "]") {
      invalid();
      return;
    }
    this.consume();

    this.items.push({
      kind: "tag",
      name,
      value,
      line: openerLine,
      offset: openerOffset,
      order: this.order++,
    });
  }

  private scanSymbol(): void {
    const start = this.index;
    const startLine = this.line;

    while (this.index < this.text.length) {
      const character = this.text.charAt(this.index);
      if (isWhitespace(character) || SYMBOL_DELIMITERS.has(character)) break;
      this.consume();
    }

    const value = this.text.slice(start, this.index);
    if (value.length > 0) this.emitSymbol(value, startLine, start);
  }

  private emitSymbol(value: string, line: number, offset: number): void {
    let cursor = 0;

    while (cursor < value.length) {
      const remaining = value.slice(cursor);
      const remainingOffset = offset + cursor;

      if (/^\$[0-9]+$/.test(remaining)) return;

      if (RESULTS.has(remaining as PgnResult)) {
        this.items.push({
          kind: "result",
          value: remaining as PgnResult,
          line,
          offset: remainingOffset,
          order: this.order++,
        });
        return;
      }

      let digitEnd = cursor;
      while (
        digitEnd < value.length &&
        value.charAt(digitEnd) >= "0" &&
        value.charAt(digitEnd) <= "9"
      ) {
        digitEnd += 1;
      }
      const digitCount = digitEnd - cursor;
      if (
        digitCount >= 1 &&
        digitCount <= 9 &&
        digitEnd < value.length &&
        value.charAt(digitEnd) === "."
      ) {
        let dotsEnd = digitEnd;
        while (dotsEnd < value.length && value.charAt(dotsEnd) === ".") {
          dotsEnd += 1;
        }
        const digits = value.slice(cursor, digitEnd);
        const dots = value.slice(digitEnd, dotsEnd);
        this.addMoveNumber(value.slice(cursor, dotsEnd), digits, dots, line, remainingOffset);
        cursor = dotsEnd;
        continue;
      }

      this.items.push({
        kind: "move",
        value: remaining,
        line,
        offset: remainingOffset,
        order: this.order++,
      });
      return;
    }
  }

  private addMoveNumber(
    value: string,
    digits: string,
    dots: string,
    line: number,
    offset: number,
  ): void {
    this.items.push({
      kind: "move-number",
      value,
      number: Number(digits),
      dots,
      line,
      offset,
      order: this.order++,
    });
  }

  private fault(
    message: string,
    line: number,
    offset: number,
    boundary: PgnFault["boundary"],
  ): void {
    this.items.push({
      kind: "fault",
      code: "PV001",
      message,
      line,
      offset,
      order: this.order++,
      boundary,
    });
  }
}
