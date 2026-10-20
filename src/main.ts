import { readFileSync } from "node:fs";
import packageJson from "../package.json";
import { type Io, run } from "./cli";
import { runtimeProblem } from "./runtime";

const problem = runtimeProblem(packageJson.engines.bun, Bun.version);
if (problem !== null) {
  process.stderr.write(`pgnvet: ${problem}\n`);
  process.exitCode = 2;
} else {
  const io: Io = {
    readStdin: () => new Uint8Array(readFileSync(0)),
    readFile: (path) => new Uint8Array(readFileSync(path)),
    out: (text) => {
      process.stdout.write(text);
    },
    err: (text) => {
      process.stderr.write(text);
    },
  };

  process.exitCode = run(process.argv.slice(2), io);
}
