/**
 * Copy the bundled Comfy Workflows skill into a consumer project's
 * `.agents/skills/comfy-workflows/` so Agent Skills clients can discover it
 * without searching node_modules.
 *
 * Source of truth is the currently executing installed package. No network.
 * Copies files; never creates symlinks.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { ComfyError, ErrorCodes } from "../errors.js";

export const SKILL_NAME = "comfy-workflows";
export const SKILL_META_FILENAME = ".comfy-workflows-skill.json";
export const CORE_PACKAGE = "@stepupgaming/comfy-workflows";

export type AgentSkillStatusName = "missing" | "current" | "outdated" | "modified";

export interface SkillInstallMeta {
  package: string;
  packageVersion: string;
  skillName: string;
  contentHash: string;
  installedAt: string;
}

export interface AgentSkillPaths {
  projectRoot: string;
  destination: string;
  bundled: string;
}

export interface AgentSkillReport {
  skill: string;
  coreVersion: string;
  installed: boolean;
  installedVersion: string | null;
  destination: string;
  bundled: string;
  status: AgentSkillStatusName;
  contentHash: string | null;
  bundledHash: string;
  action?: "unchanged" | "installed" | "updated" | "forced";
}

function posixRel(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

function isSkillContent(rel: string): boolean {
  if (rel === SKILL_META_FILENAME) return false;
  if (rel === "SKILL.md") return true;
  return rel.startsWith("references/");
}

/** Sorted relative paths of skill files (SKILL.md + references/**). */
export function listSkillFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs).sort()) {
      const full = join(abs, name);
      const st = statSync(full);
      const rel = posixRel(dir, full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      if (isSkillContent(rel)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

export function hashSkillDir(dir: string): string {
  const h = createHash("sha256");
  for (const rel of listSkillFiles(dir)) {
    h.update(rel);
    h.update("\0");
    h.update(readFileSync(join(dir, rel)));
    h.update("\n");
  }
  return h.digest("hex");
}

export function bundledSkillDir(pkgRoot: string): string {
  return join(pkgRoot, "skills", SKILL_NAME);
}

export function projectSkillDir(projectRoot: string): string {
  return join(resolve(projectRoot), ".agents", "skills", SKILL_NAME);
}

export function readCoreVersion(pkgRoot: string): string {
  const pj = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
    version?: string;
  };
  if (typeof pj.version !== "string" || pj.version.length === 0) {
    throw new ComfyError({
      code: ErrorCodes.AgentSkillMissing,
      message: `package.json at ${pkgRoot} has no version.`,
    });
  }
  return pj.version;
}

export function assertBundledSkill(pkgRoot: string): string {
  const bundled = bundledSkillDir(pkgRoot);
  const skillMd = join(bundled, "SKILL.md");
  if (!existsSync(skillMd) || !statSync(skillMd).isFile()) {
    throw new ComfyError({
      code: ErrorCodes.AgentSkillMissing,
      message: `Bundled skill missing at ${skillMd}. Reinstall ${CORE_PACKAGE}.`,
      hint: "The skill is shipped inside the installed package. This command does not fetch it from the network.",
    });
  }
  return bundled;
}

function readMeta(dest: string): SkillInstallMeta | null {
  const p = join(dest, SKILL_META_FILENAME);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<SkillInstallMeta>;
    if (
      typeof raw.package !== "string" ||
      typeof raw.packageVersion !== "string" ||
      typeof raw.skillName !== "string" ||
      typeof raw.contentHash !== "string"
    ) {
      return null;
    }
    return {
      package: raw.package,
      packageVersion: raw.packageVersion,
      skillName: raw.skillName,
      contentHash: raw.contentHash,
      installedAt: typeof raw.installedAt === "string" ? raw.installedAt : "",
    };
  } catch {
    return null;
  }
}

export function inspectAgentSkill(opts: {
  projectRoot: string;
  pkgRoot: string;
}): AgentSkillReport {
  const projectRoot = resolve(opts.projectRoot);
  const bundled = assertBundledSkill(opts.pkgRoot);
  const destination = projectSkillDir(projectRoot);
  const coreVersion = readCoreVersion(opts.pkgRoot);
  const bundledHash = hashSkillDir(bundled);
  const destExists = existsSync(destination) && statSync(destination).isDirectory();
  const skillMd = join(destination, "SKILL.md");
  const installed = destExists && existsSync(skillMd) && statSync(skillMd).isFile();
  if (!installed) {
    return {
      skill: SKILL_NAME,
      coreVersion,
      installed: false,
      installedVersion: null,
      destination,
      bundled,
      status: "missing",
      contentHash: null,
      bundledHash,
    };
  }
  const contentHash = hashSkillDir(destination);
  const meta = readMeta(destination);
  let status: AgentSkillStatusName;
  if (contentHash === bundledHash) status = "current";
  else if (meta !== null && meta.contentHash === contentHash) status = "outdated";
  else status = "modified";
  return {
    skill: SKILL_NAME,
    coreVersion,
    installed: true,
    installedVersion: meta?.packageVersion ?? null,
    destination,
    bundled,
    status,
    contentHash,
    bundledHash,
  };
}

function copySkillFiles(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  const wanted = new Set(listSkillFiles(from));
  for (const rel of wanted) {
    const src = join(from, rel);
    const dest = join(to, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, readFileSync(src));
  }
  const existing = listSkillFiles(to);
  for (const rel of existing) {
    if (!wanted.has(rel)) rmSync(join(to, rel), { force: true });
  }
}

function writeMeta(dest: string, meta: SkillInstallMeta): void {
  writeFileSync(join(dest, SKILL_META_FILENAME), JSON.stringify(meta, null, 2) + "\n");
}

export function installAgentSkill(opts: {
  projectRoot: string;
  pkgRoot: string;
  force?: boolean;
  now?: string;
}): AgentSkillReport {
  const report = inspectAgentSkill(opts);
  if (report.status === "modified" && opts.force !== true) {
    throw new ComfyError({
      code: ErrorCodes.AgentSkillModified,
      message: `Modified local skill at ${report.destination}. Refusing to overwrite.`,
      hint: "Re-run with --force to replace the project copy from the installed package.",
      details: report,
    });
  }
  if (report.status === "current") {
    const meta = readMeta(report.destination);
    if (
      meta !== null &&
      meta.packageVersion === report.coreVersion &&
      meta.contentHash === report.bundledHash &&
      meta.skillName === SKILL_NAME
    ) {
      return { ...report, action: "unchanged" };
    }
    writeMeta(report.destination, {
      package: CORE_PACKAGE,
      packageVersion: report.coreVersion,
      skillName: SKILL_NAME,
      contentHash: report.bundledHash,
      installedAt: opts.now ?? new Date().toISOString(),
    });
    return { ...inspectAgentSkill(opts), action: "unchanged" };
  }

  if (existsSync(report.destination) && !statSync(report.destination).isDirectory()) {
    throw new ComfyError({
      code: ErrorCodes.AgentSkillModified,
      message: `Destination exists and is not a directory: ${report.destination}`,
    });
  }

  copySkillFiles(report.bundled, report.destination);
  writeMeta(report.destination, {
    package: CORE_PACKAGE,
    packageVersion: report.coreVersion,
    skillName: SKILL_NAME,
    contentHash: report.bundledHash,
    installedAt: opts.now ?? new Date().toISOString(),
  });
  const next = inspectAgentSkill(opts);
  const action: AgentSkillReport["action"] =
    opts.force === true && report.status === "modified"
      ? "forced"
      : report.status === "outdated"
        ? "updated"
        : "installed";
  return { ...next, action };
}
