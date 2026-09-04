/**
 * Tiny semver-range helper for 0.x node-pack constraints.
 * Supports: exact `1.2.3`, `^1.2.3`, `>=1.2.3`, `*`, and space-AND of those.
 * Returns undefined when either side cannot be parsed — callers must not
 * pretend compatibility.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const EXACT = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemVer(raw: string): SemVer | undefined {
  const m = EXACT.exec(raw.trim());
  if (!m) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function cmp(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function satisfiesOne(version: SemVer, token: string): boolean | undefined {
  const t = token.trim();
  if (t === "" || t === "*" || t === "x" || t === "X") return true;
  if (t.startsWith("^")) {
    const base = parseSemVer(t.slice(1));
    if (!base) return undefined;
    if (cmp(version, base) < 0) return false;
    if (base.major > 0) return version.major === base.major;
    if (base.minor > 0) return version.major === 0 && version.minor === base.minor;
    return version.major === 0 && version.minor === 0;
  }
  if (t.startsWith(">=")) {
    const base = parseSemVer(t.slice(2));
    if (!base) return undefined;
    return cmp(version, base) >= 0;
  }
  if (t.startsWith("<=")) {
    const base = parseSemVer(t.slice(2));
    if (!base) return undefined;
    return cmp(version, base) <= 0;
  }
  if (t.startsWith("<")) {
    const base = parseSemVer(t.slice(1));
    if (!base) return undefined;
    return cmp(version, base) < 0;
  }
  if (t.startsWith(">")) {
    const base = parseSemVer(t.slice(1));
    if (!base) return undefined;
    return cmp(version, base) > 0;
  }
  const exact = parseSemVer(t);
  if (!exact) return undefined;
  return cmp(version, exact) === 0;
}

/** Highest parseable version that satisfies `range` (`*` / omitted → highest). */
export function pickBestVersion(versions: string[], range?: string): string | undefined {
  const parsed: Array<{ raw: string; ver: SemVer }> = [];
  for (const raw of versions) {
    const ver = parseSemVer(raw);
    if (ver) parsed.push({ raw, ver });
  }
  parsed.sort((a, b) => cmp(b.ver, a.ver));
  const want = range?.trim();
  for (const item of parsed) {
    if (want === undefined || want === "" || want === "*") return item.raw;
    if (versionSatisfies(item.raw, want) === true) return item.raw;
  }
  return undefined;
}

/** true/false when both parse; undefined if compatibility cannot be proven. */
export function versionSatisfies(version: string, range: string): boolean | undefined {
  const v = parseSemVer(version);
  if (!v) return undefined;
  const r = range.trim();
  if (r === "") return true;
  const parts = r.split(/\s+/);
  let ok = true;
  for (const p of parts) {
    const one = satisfiesOne(v, p);
    if (one === undefined) return undefined;
    if (!one) ok = false;
  }
  return ok;
}
