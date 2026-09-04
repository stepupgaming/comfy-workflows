/**
 * Delegate custom-node installation to official ComfyUI-Manager cm-cli.
 *
 * Registered packs only, exact resolved versions only. Arbitrary git URLs
 * and pip specs are refused. Subprocess uses argument arrays, never a
 * shell string. Target Python must be the Comfy environment's interpreter.
 */

import { spawn } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { ComfyError, ErrorCodes } from "../errors.js";
import { findInstalledPack, listInstalledPacks } from "./installed.js";
import type { ComfyTarget } from "./target.js";
import type { SetupPlan, SetupPlanPack } from "./plan.js";

export interface InstallerResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export interface ApplySetupOptions {
  plan: SetupPlan;
  target: ComfyTarget;
  /** Confirm the generated plan. Does not relax source policy. */
  yes: boolean;
  dryRun?: boolean;
  /** Injected spawn for tests. */
  run?: typeof runCmCli;
  pythonPath?: string;
}

const ID_OK = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;
const VER_OK = /^\d+\.\d+\.\d+$/;

function assertSafeId(id: string): void {
  if (!ID_OK.test(id) || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new ComfyError({
      code: ErrorCodes.InvalidNodePack,
      message: `Refusing to install pack id ${JSON.stringify(id)}`,
      hint: "Registry ids must be alphanumeric with . _ - only.",
    });
  }
}

function installSpec(pack: SetupPlanPack): string {
  assertSafeId(pack.id);
  const ver = pack.resolvedVersion;
  if (ver === undefined || !VER_OK.test(ver)) {
    throw new ComfyError({
      code: ErrorCodes.NodePackVersionUnsatisfied,
      message: `Cannot install ${pack.id}: no exact resolved Registry version`,
      hint: `requested ${pack.requestedVersion ?? "(any)"}; resolve against the Registry before setup.`,
      details: { id: pack.id, requestedVersion: pack.requestedVersion },
    });
  }
  return `${pack.id}@${ver}`;
}

export function managerCliPath(target: ComfyTarget): string | undefined {
  if (!target.managerDir) return undefined;
  return join(target.managerDir, "cm-cli.py");
}

export async function runCmCli(opts: {
  python: string;
  cli: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveP, reject) => {
    const child = spawn(opts.python, [opts.cli, ...opts.args], {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveP({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function pickTargetPython(target: ComfyTarget, override?: string): string {
  if (override) return override;
  if (target.pythonCandidates.length > 0) return target.pythonCandidates[0]!;
  throw new ComfyError({
    code: ErrorCodes.ComfyPythonUnknown,
    message: `Cannot determine the Python interpreter for ${target.root}`,
    hint:
      target.layout === "portable-windows"
        ? "Expected python_embeded/python.exe next to (or inside) the portable Comfy tree."
        : "Expected a venv/.venv under the Comfy root, or python_embeded for portable Windows.",
  });
}

/**
 * Apply an already-approved setup plan via Manager `cm-cli.py install <id>@<exact>`.
 * Does not kill or restart Comfy. Sets restartRequired on the returned plan.
 */
export async function applySetupPlan(opts: ApplySetupOptions): Promise<{
  plan: SetupPlan;
  results: InstallerResult[];
}> {
  if (!opts.yes) {
    throw new ComfyError({
      code: ErrorCodes.SetupDeclined,
      message: "Setup requires explicit confirmation (--yes) or an interactive yes.",
    });
  }
  if (opts.plan.applyBlocked) {
    throw new ComfyError({
      code: ErrorCodes.SetupNotApplicable,
      message: opts.plan.applyBlocked,
    });
  }
  const toInstall = opts.plan.toInstall.filter((p) => p.optional !== true || p.action !== "skip");
  const results: InstallerResult[] = [];

  if (opts.dryRun) {
    const restartRequired = toInstall.length > 0 || opts.plan.restartRequired;
    return {
      plan: {
        ...opts.plan,
        restartRequired,
        ready: restartRequired ? false : opts.plan.ready,
      },
      results: toInstall.map((p) => ({
        id: p.id,
        ok: true,
        skipped: true,
        stdout: "",
        stderr: "",
        code: 0,
      })),
    };
  }

  if (opts.plan.ambiguous.length > 0) {
    throw new ComfyError({
      code: ErrorCodes.NodePackAmbiguous,
      message: `Cannot install while ${opts.plan.ambiguous.length} node class(es) have ambiguous owners.`,
      hint: "Disambiguate with `cwf node-pack add <id> --provides …` then re-run setup.",
      details: { ambiguous: opts.plan.ambiguous },
    });
  }
  if (opts.plan.unresolved.length > 0) {
    throw new ComfyError({
      code: ErrorCodes.NodePackUnknown,
      message: `Cannot install while ${opts.plan.unresolved.length} node class(es) are unresolved.`,
      hint: "Map them with `cwf node-pack map` or resolve-nodes --write after verification.",
      details: { unresolved: opts.plan.unresolved },
    });
  }

  const cli = managerCliPath(opts.target);
  if (cli === undefined) {
    throw new ComfyError({
      code: ErrorCodes.SetupNotApplicable,
      message: `ComfyUI-Manager (cm-cli.py) was not found under ${opts.target.customNodesDir}`,
      hint: "Install ComfyUI-Manager into custom_nodes, then re-run cwf setup.",
    });
  }

  const python =
    opts.pythonPath ??
    opts.target.pythonCandidates[0] ??
    (opts.run !== undefined
      ? process.platform === "win32"
        ? "python"
        : "python3"
      : pickTargetPython(opts.target, opts.pythonPath));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COMFYUI_PATH: opts.target.root,
  };
  const run = opts.run ?? runCmCli;
  const failed: SetupPlanPack[] = [];

  for (const pack of toInstall) {
    if (pack.source !== "registry" || pack.verified !== true) {
      failed.push(pack);
      results.push({
        id: pack.id,
        ok: false,
        stdout: "",
        stderr:
          pack.source !== "registry"
            ? "Unregistered packs are not auto-installed."
            : "Refusing to install an unverified registry pack (no positive per-version class evidence).",
        code: 1,
      });
      continue;
    }
    let spec: string;
    try {
      spec = installSpec(pack);
    } catch (e) {
      failed.push(pack);
      results.push({
        id: pack.id,
        ok: false,
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
        code: 1,
      });
      continue;
    }
    const { code, stdout, stderr } = await run({
      python,
      cli,
      args: ["install", spec, "--exit-on-fail"],
      env,
      cwd: opts.target.root,
    });
    const combined = `${stdout}\n${stderr}`;
    const crash =
      /Traceback \(most recent call last\)/.test(combined) || /ModuleNotFoundError/.test(combined);
    const claimed = /\[INSTALLED\]/.test(stdout);
    const present = findInstalledPack(listInstalledPacks(opts.target), pack.id) !== undefined;
    const ok = code === 0 && !crash && (claimed || present);
    results.push({ id: pack.id, ok, stdout, stderr, code: ok ? 0 : code === 0 ? 1 : code });
    if (!ok) failed.push(pack);
  }

  const stillToInstall = toInstall.filter((p) => failed.some((f) => f.id === p.id));
  const installedNow = toInstall.filter((p) => !failed.some((f) => f.id === p.id));
  // Installation success is not readiness. Classes remain unavailable until
  // the target Comfy instance is re-verified (typically after a restart).
  const restartRequired = installedNow.length > 0 || opts.plan.restartRequired;
  const ready =
    opts.plan.availabilityKnown === true &&
    failed.length === 0 &&
    stillToInstall.length === 0 &&
    opts.plan.unresolved.length === 0 &&
    opts.plan.ambiguous.length === 0 &&
    opts.plan.missingNodeClasses.length === 0 &&
    !restartRequired;
  const plan: SetupPlan = {
    ...opts.plan,
    alreadyInstalled: [
      ...opts.plan.alreadyInstalled,
      ...installedNow.map((p) => ({ ...p, action: "skip" as const })),
    ],
    toInstall: stillToInstall,
    failed,
    restartRequired,
    ready,
  };
  return { plan, results };
}

/** Guard: never treat a user-supplied path as relative escape. */
export function assertComfyPath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(p);
  return abs;
}
