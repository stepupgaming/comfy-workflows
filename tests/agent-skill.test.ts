import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ComfyError } from "../src/errors.js";
import {
  SKILL_META_FILENAME,
  hashSkillDir,
  inspectAgentSkill,
  installAgentSkill,
  projectSkillDir,
} from "../src/cli/agent-skill.js";

const run = promisify(execFile);
const repoRoot = join(__dirname, "..");

function project(): string {
  return mkdtempSync(join(tmpdir(), "cwf-agent-"));
}

function skillMd(root: string): string {
  return join(projectSkillDir(root), "SKILL.md");
}

describe("agent skill install (module)", () => {
  it("copies SKILL.md and references into .agents/skills/comfy-workflows", () => {
    const root = project();
    const report = installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, now: "2026-09-04T00:00:00.000Z" });
    expect(report.status).toBe("current");
    expect(report.action).toBe("installed");
    expect(report.coreVersion).toBe(
      (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version,
    );
    expect(existsSync(skillMd(root))).toBe(true);
    expect(existsSync(join(projectSkillDir(root), "references", "code-first.md"))).toBe(true);
    const fm = readFileSync(skillMd(root), "utf8");
    expect(fm.startsWith("---")).toBe(true);
    expect(fm).toMatch(/^name:\s*comfy-workflows\s*$/m);
    const meta = JSON.parse(readFileSync(join(projectSkillDir(root), SKILL_META_FILENAME), "utf8"));
    expect(meta.package).toBe("@stepupgaming/comfy-workflows");
    expect(meta.packageVersion).toBe(report.coreVersion);
    expect(meta.skillName).toBe("comfy-workflows");
    expect(meta.contentHash).toBe(report.bundledHash);
    expect(meta.contentHash).toBe(hashSkillDir(projectSkillDir(root)));
  });

  it("repeated install is CURRENT and does not rewrite files", () => {
    const root = project();
    installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, now: "2026-09-04T00:00:00.000Z" });
    const dest = skillMd(root);
    const before = statSync(dest).mtimeMs;
    const second = installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, now: "2026-09-04T01:00:00.000Z" });
    expect(second.status).toBe("current");
    expect(second.action).toBe("unchanged");
    expect(statSync(dest).mtimeMs).toBe(before);
  });

  it("updates an unchanged generated copy from an older package", () => {
    const root = project();
    installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, now: "2026-09-04T00:00:00.000Z" });
    const destDir = projectSkillDir(root);
    writeFileSync(skillMd(root), "# old generated skill\n");
    const oldHash = hashSkillDir(destDir);
    writeFileSync(
      join(destDir, SKILL_META_FILENAME),
      JSON.stringify({
        package: "@stepupgaming/comfy-workflows",
        packageVersion: "0.0.0",
        skillName: "comfy-workflows",
        contentHash: oldHash,
        installedAt: "2020-01-01T00:00:00.000Z",
      }) + "\n",
    );
    expect(inspectAgentSkill({ projectRoot: root, pkgRoot: repoRoot }).status).toBe("outdated");
    const updated = installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, now: "2026-09-04T02:00:00.000Z" });
    expect(updated.status).toBe("current");
    expect(updated.action).toBe("updated");
    expect(readFileSync(skillMd(root), "utf8")).toContain("name: comfy-workflows");
  });

  it("refuses to overwrite a user-edited skill without --force", () => {
    const root = project();
    installAgentSkill({ projectRoot: root, pkgRoot: repoRoot });
    writeFileSync(skillMd(root), "# my local edits\n");
    expect(inspectAgentSkill({ projectRoot: root, pkgRoot: repoRoot }).status).toBe("modified");
    try {
      installAgentSkill({ projectRoot: root, pkgRoot: repoRoot });
      throw new Error("expected E_AGENT_SKILL_MODIFIED");
    } catch (e) {
      expect(e).toBeInstanceOf(ComfyError);
      expect((e as ComfyError).code).toBe("E_AGENT_SKILL_MODIFIED");
    }
    expect(readFileSync(skillMd(root), "utf8")).toBe("# my local edits\n");
  });

  it("--force replaces a modified copy", () => {
    const root = project();
    installAgentSkill({ projectRoot: root, pkgRoot: repoRoot });
    writeFileSync(skillMd(root), "# my local edits\n");
    const forced = installAgentSkill({ projectRoot: root, pkgRoot: repoRoot, force: true });
    expect(forced.status).toBe("current");
    expect(forced.action).toBe("forced");
    expect(readFileSync(skillMd(root), "utf8")).toContain("name: comfy-workflows");
  });

  it("works when the project path contains spaces", () => {
    const parent = mkdtempSync(join(tmpdir(), "cwf-"));
    const root = join(parent, "My Project");
    mkdirSync(root);
    const report = installAgentSkill({ projectRoot: root, pkgRoot: repoRoot });
    expect(report.status).toBe("current");
    expect(existsSync(skillMd(root))).toBe(true);
  });

  it("check reports missing before install", () => {
    const root = project();
    const report = inspectAgentSkill({ projectRoot: root, pkgRoot: repoRoot });
    expect(report.installed).toBe(false);
    expect(report.status).toBe("missing");
    expect(report.installedVersion).toBeNull();
  });
});

describe("cwf agent CLI", () => {
  async function cwf(args: string[]) {
    const entry = join(repoRoot, "src", "cli", "bin.ts");
    try {
      const { stdout, stderr } = await run(
        "node",
        ["--import", "jiti/register", entry, ...args],
        { cwd: repoRoot },
      );
      return { stdout, stderr, code: 0 };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? 1 };
    }
  }

  it("install --json and check --json are structured", async () => {
    const root = project();
    const inst = await cwf(["agent", "install", "--project", root, "--json"]);
    expect(inst.code).toBe(0);
    const body = JSON.parse(inst.stdout.slice(inst.stdout.indexOf("{"))) as {
      ok: boolean;
      status: string;
      coreVersion: string;
      skill: string;
    };
    expect(body.ok).toBe(true);
    expect(body.skill).toBe("comfy-workflows");
    expect(body.status).toBe("current");
    const check = await cwf(["agent", "check", "--project", root, "--json"]);
    expect(check.code).toBe(0);
    const st = JSON.parse(check.stdout.slice(check.stdout.indexOf("{"))) as {
      status: string;
      installed: boolean;
    };
    expect(st.installed).toBe(true);
    expect(st.status).toBe("current");
  });

  it("help lists cwf agent", async () => {
    const { stdout, code } = await cwf(["help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("cwf agent install");
    expect(stdout).toContain("cwf agent check");
  });

  it("modified skill fails with JSON error on stderr without --force", async () => {
    const root = project();
    await cwf(["agent", "install", "--project", root, "--json"]);
    writeFileSync(skillMd(root), "# edited\n");
    const again = await cwf(["agent", "install", "--project", root, "--json"]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("E_AGENT_SKILL_MODIFIED");
  });
});
