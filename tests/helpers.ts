import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseObjectInfo } from "../src/defs/parse.js";

const fixturePath = fileURLToPath(new URL("../fixtures/object_info/core.json", import.meta.url));

export const coreObjectInfo: Record<string, unknown> = JSON.parse(
  readFileSync(fixturePath, "utf8"),
);
export const coreDefs = parseObjectInfo(coreObjectInfo as never);
