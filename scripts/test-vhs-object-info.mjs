#!/usr/bin/env node
/**
 * Post-install Comfy /object_info proof for the disposable VHS tree.
 *
 * Starts the same Python that setup targeted, waits until Comfy is healthy,
 * asserts VHS_LoadVideo (and VHS_VideoCombine) are actually imported, then
 * shuts the process down. Directory presence is not enough.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root =
  process.env["CWF_DISPOSABLE_COMFY"] ?? join(tmpdir(), "cwf-disposable-comfy");
const python =
  process.env["CWF_DISPOSABLE_PYTHON"] ??
  (process.platform === "win32"
    ? join(root, "venv", "Scripts", "python.exe")
    : join(root, "venv", "bin", "python"));
const port = Number(process.env["CWF_DISPOSABLE_PORT"] ?? 18791);
const host = "127.0.0.1";
const url = `http://${host}:${port}`;
const required = ["VHS_LoadVideo", "VHS_VideoCombine"];

if (!existsSync(join(root, "main.py"))) {
  throw new Error(`disposable Comfy root missing main.py: ${root}`);
}
if (!existsSync(python)) {
  throw new Error(`target Python missing: ${python}`);
}
if (!existsSync(join(root, "custom_nodes", "comfyui-videohelpersuite"))) {
  throw new Error(`VHS pack is not on disk under ${root}`);
}

function killTree(child) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

const child = spawn(
  python,
  [
    "main.py",
    "--cpu",
    "--listen",
    host,
    "--port",
    String(port),
    "--disable-auto-launch",
    "--disable-manager-ui",
  ],
  {
    cwd: root,
    env: { ...process.env, COMFYUI_PATH: root },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  },
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (b) => {
  stdout += b.toString("utf8");
});
child.stderr.on("data", (b) => {
  stderr += b.toString("utf8");
});

const deadline = Date.now() + Number(process.env["CWF_DISPOSABLE_TIMEOUT_MS"] ?? 180_000);

async function waitHealthy() {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Comfy exited ${child.exitCode} before becoming healthy\n${stdout}\n${stderr}`,
      );
    }
    try {
      const res = await fetch(`${url}/system_stats`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Comfy did not become healthy at ${url}\n${stdout}\n${stderr}`);
}

let failed = false;
try {
  await waitHealthy();
  const res = await fetch(`${url}/object_info`);
  if (!res.ok) throw new Error(`/object_info HTTP ${res.status}`);
  const info = await res.json();
  const classes = Object.keys(info);
  const missing = required.filter((c) => !classes.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `VHS classes missing from /object_info after restart: ${missing.join(", ")} (have ${classes.length} classes)`,
    );
  }
  console.log(`VHS_OBJECT_INFO_OK ${required.join(",")} (${classes.length} classes)`);
} catch (e) {
  failed = true;
  console.error(e instanceof Error ? e.message : e);
} finally {
  killTree(child);
  await new Promise((r) => setTimeout(r, 1500));
}

if (failed) process.exit(1);
