import bundledDefsJson from "../nodes/gen/defs.json" with { type: "json" };

/**
 * Node classes shipped with stock ComfyUI, according to this package's
 * committed defs snapshot. Custom-node classes are everything else.
 * Live `/object_info` remains authoritative for "is it installed".
 */

const gen = bundledDefsJson as { defs?: Record<string, unknown> };

export const CORE_NODE_CLASSES: ReadonlySet<string> = new Set(Object.keys(gen.defs ?? {}));

/**
 * Stock ComfyUI classes that post-date the bundled defs snapshot. Presence
 * here is known-core metadata, not a live inventory. Live `/object_info`
 * remains availability, not ownership.
 */
export const KNOWN_CORE_EXTRAS: ReadonlySet<string> = new Set([
  "CLIPLoader",
  "DualCLIPLoader",
  "TripleCLIPLoader",
  "UNETLoader",
  "VAELoader",
  "CLIPVisionLoader",
  "LoraLoaderModelOnly",
  "EmptySD3LatentImage",
  "BasicGuider",
  "BasicScheduler",
  "RandomNoise",
  "SamplerCustomAdvanced",
  "KSamplerSelect",
  "SplitSigmas",
  "ManualSigmas",
  "ConditioningZeroOut",
  "ImageToMask",
  "MaskToImage",
  "LoadVideo",
  "SaveVideo",
  "CreateVideo",
  "GetVideoComponents",
  "LoadAudio",
  "SaveAudio",
  "VAEDecodeAudio",
]);

/**
 * Bundled defs are one core-evidence source, not the only one.
 * Extra names come from caller-supplied defs / known-core metadata.
 * Live `/object_info` is availability, not ownership — do not pass it here.
 */
export function isCoreNodeClass(className: string, extraCore?: Iterable<string>): boolean {
  if (CORE_NODE_CLASSES.has(className) || KNOWN_CORE_EXTRAS.has(className)) return true;
  if (extraCore === undefined) return false;
  if (extraCore instanceof Set) return extraCore.has(className);
  for (const name of extraCore) {
    if (name === className) return true;
  }
  return false;
}
