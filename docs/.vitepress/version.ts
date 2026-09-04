import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };

/** Current core package version, read at docs build time. */
export const CORE_VERSION: string = pkg.version;
export const CORE_PACKAGE = "@stepupgaming/comfy-workflows";
