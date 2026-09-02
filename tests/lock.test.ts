import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureLock, lockDrift, readLock, writeLock } from "../src/lock/lock.js";
import { hashObjectInfo } from "../src/defs/parse.js";
import { coreObjectInfo } from "./helpers.js";

describe("comfy.lock.json", () => {
  it("captures the environment fingerprint and round-trips", async () => {
    const lock = await captureLock({
      objectInfo: coreObjectInfo,
      systemStats: { system: { comfyui_version: "0.3.45" } },
      nodePacks: { "ComfyUI-VideoHelperSuite": { version: "1.5.1", commit: "abc1234" } },
    });
    expect(lock.comfyuiVersion).toBe("0.3.45");
    expect(lock.objectInfoHash).toBe(hashObjectInfo(coreObjectInfo));
    expect(lock.nodePacks["ComfyUI-VideoHelperSuite"]?.commit).toBe("abc1234");

    const dir = mkdtempSync(join(tmpdir(), "comfy-lock-"));
    await writeLock(dir, lock);
    const back = await readLock(dir);
    expect(back?.objectInfoHash).toBe(lock.objectInfoHash);
  });

  it("reports drift when the node universe changes", async () => {
    const lock = await captureLock({ objectInfo: coreObjectInfo });
    expect(lockDrift(lock, lock.objectInfoHash)).toBeUndefined();
    expect(lockDrift(lock, "deadbeef")).toContain("Environment drift");
  });
});
