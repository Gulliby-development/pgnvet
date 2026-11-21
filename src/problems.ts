/**
 * Every diagnostic code pgnvet reports, in the order the README documents them.
 * The list is the single source of truth for the reported codes and for the
 * values that `check --only` accepts.
 */
export const PROBLEM_CODES = [
  "PV001",
  "PV002",
  "PV003",
  "PV004",
  "PV005",
  "PV006",
  "PV007",
  "PV008",
  "PV009",
  "PV010",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** Return whether a command-line value names a diagnostic code. */
export function isProblemCode(value: string): value is ProblemCode {
  return (PROBLEM_CODES as readonly string[]).includes(value);
}
