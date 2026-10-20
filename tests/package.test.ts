import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";
import { runtimeProblem } from "../src/runtime";

describe("package engines", () => {
  test("declares the Bun engine in manifest order", () => {
    expect(JSON.stringify(packageJson, null, 2)).toContain('"type": "module",');
    expect(packageJson.engines).toEqual({ bun: ">=1.4.0" });
    expect(Object.keys(packageJson)).toEqual([
      "name",
      "version",
      "private",
      "type",
      "engines",
      "scripts",
      "devDependencies",
    ]);
  });

  test("accepts the Bun version running the tests", () => {
    expect(runtimeProblem(packageJson.engines.bun, Bun.version)).toBe(null);
  });
});
