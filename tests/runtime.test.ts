import { describe, expect, test } from "bun:test";
import { runtimeProblem } from "../src/runtime";

describe("runtimeProblem", () => {
  test.each([
    [">=1.4.0", "1.4.0"],
    [">=1.4.0", "1.4.2"],
    [">=1.4.0", "1.10.0"],
    [">=1.4.0", "2.0.0"],
    [">=1.4.0", "1.4.1-canary.7"],
    [">=1.4.0", "weird"],
    ["^1.4.0", "1.0.0"],
  ])("accepts %s with Bun %s", (range, version) => {
    expect(runtimeProblem(range, version)).toBe(null);
  });

  test.each([
    [">=1.4.0", "1.3.9", "requires Bun >=1.4.0 (found 1.3.9)"],
    [">=1.4.0", "0.9.0", "requires Bun >=1.4.0 (found 0.9.0)"],
    [">=1.10.2", "1.9.7", "requires Bun >=1.10.2 (found 1.9.7)"],
  ])("reports %s for Bun %s", (range, version, message) => {
    expect(runtimeProblem(range, version)).toBe(message);
  });
});
