import { readFileSync } from "node:fs";
import { type Io, run } from "./cli";

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
