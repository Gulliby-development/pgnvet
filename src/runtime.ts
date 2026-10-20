type Version = readonly [number, number, number];

const versionPattern = /^(\d+)\.(\d+)\.(\d+)/;

function parseVersion(value: string): Version | null {
  const match = versionPattern.exec(value);
  if (match === null) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function runtimeProblem(range: string, version: string): string | null {
  if (!range.startsWith(">=")) return null;

  const minimum = parseVersion(range.slice(2));
  const actual = parseVersion(version);
  if (minimum === null || actual === null) return null;

  for (let index = 0; index < minimum.length; index += 1) {
    const requiredPart = minimum[index];
    const actualPart = actual[index];
    if (requiredPart === undefined || actualPart === undefined) continue;
    if (actualPart > requiredPart) return null;
    if (actualPart < requiredPart) {
      return `requires Bun ${range} (found ${version})`;
    }
  }

  return null;
}
