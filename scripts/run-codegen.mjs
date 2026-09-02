import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { parseObjectInfo } from "../src/defs/parse.ts";
import { generateNodeModules } from "../src/codegen/codegen.ts";
import { hashObjectInfo } from "../src/defs/parse.ts";

const raw = JSON.parse(readFileSync("fixtures/object_info/core.json", "utf8"));
const defs = parseObjectInfo(raw);
const hash = hashObjectInfo(raw);
const result = generateNodeModules({ defs, objectInfoHash: hash });
rmSync("src/nodes/gen", { recursive: true, force: true });
mkdirSync("src/nodes/gen", { recursive: true });
for (const f of result.files) writeFileSync(`src/nodes/gen/${f.path}`, f.content);
console.log("generated:", result.files.map((f) => f.path).join(", "));
