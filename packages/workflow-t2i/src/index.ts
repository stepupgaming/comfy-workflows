import {
  graphFromPackageValue,
  instantiateTemplate,
  type Graph,
  type InstantiateBindings,
  type ParamValue,
} from "@stepupgaming/comfy-workflows";
import manifestJson from "../comfy.workflow.json" with { type: "json" };
import irJson from "../workflow.ir.json" with { type: "json" };

/**
 * `@stepupgaming/comfy-workflow-t2i` — text-to-image as an installable package.
 *
 * The canonical payload is the packaged `workflow.ir.json` (a template graph);
 * this module is a thin typed wrapper. Inspecting the package never executes
 * this file — `cwf inspect` reads the manifest + IR as pure data.
 */

export interface TextToImageParams {
  checkpoint: string;
  prompt: string;
  negative?: string;
  seed: number | bigint;
  width?: number;
  height?: number;
}

/** The packaged template graph (params unbound). */
export function template(): Graph {
  return graphFromPackageValue(irJson);
}

/** Bind parameters → concrete graph, ready to compile or run. */
export function textToImage(params: TextToImageParams): Graph {
  const bindings: InstantiateBindings = {
    params: {
      checkpoint: params.checkpoint,
      prompt: params.prompt,
      seed: params.seed as ParamValue,
      ...(params.negative !== undefined ? { negative: params.negative } : {}),
      ...(params.width !== undefined ? { width: params.width } : {}),
      ...(params.height !== undefined ? { height: params.height } : {}),
    },
  };
  return instantiateTemplate(template(), bindings);
}

/** The packaged manifest, as data. */
export const manifest = manifestJson;
