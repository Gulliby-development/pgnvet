/**
 * Show a value in double quotes, replacing every non-printable-ASCII code point
 * with a single question mark.
 */
export function show(s: string): string {
  let displayed = "";

  for (const codePoint of s) {
    const value = codePoint.codePointAt(0);
    displayed += value !== undefined && value >= 33 && value <= 126 ? codePoint : "?";
  }

  return `"${displayed}"`;
}

/** Return the singular form only when n is exactly one. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
