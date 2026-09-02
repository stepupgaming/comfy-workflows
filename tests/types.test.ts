import { expectTypeOf } from "expect-type";
import { describe, it } from "vitest";
import { workflow } from "../src/builder/builder.js";
import { unsafe } from "../src/builder/types.js";
import type { NodeOutput } from "../src/builder/types.js";
import * as n from "./specs.js";

describe("builder type safety (compile-time)", () => {
  it("NodeOutput brands carry their socket type", () => {
    const g = workflow("t");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    expectTypeOf(ckpt.MODEL).toEqualTypeOf<NodeOutput<"MODEL">>();
    expectTypeOf(ckpt.CLIP).toEqualTypeOf<NodeOutput<"CLIP">>();
    expectTypeOf(ckpt.slots[2]).toEqualTypeOf<NodeOutput<"VAE">>();
    void g;
  });

  it("rejects a MODEL output wired into a CLIP input", () => {
    const g = workflow("t2");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    // @ts-expect-error MODEL into CLIP must be a type error
    g.add(n.CLIPTextEncode, { text: "x", clip: ckpt.MODEL });
    void g;
  });

  it("rejects unknown params and wrong literal types", () => {
    const g = workflow("t3");
    // @ts-expect-error unknown param name
    g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1, bogus: 1 });
    // @ts-expect-error string into an int widget
    g.add(n.EmptyLatentImage, { width: "512", height: 512, batch_size: 1 });
    void g;
  });

  it("accepts bigint for int widgets and rejects it for floats", () => {
    const g = workflow("t4");
    const latent = g.add(n.EmptyLatentImage, { width: 512n, height: 512, batch_size: 1 });
    expectTypeOf(latent.slots[0]).toEqualTypeOf<NodeOutput<"LATENT">>();
    void latent;
  });

  it("unsafe() widens any output to any input", () => {
    const g = workflow("t5");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    g.add(n.CLIPTextEncode, { text: "x", clip: unsafe<"CLIP">(ckpt.MODEL) });
    void g;
  });

  it("raw node outputs are assignable anywhere (never brand)", () => {
    const g = workflow("t6");
    const raw = g.rawNode(
      "MysterySource",
      {},
      { outputs: [{ name: "WHATEVER", type: "WEIRD_TYPE" }] },
    );
    g.add(n.CLIPTextEncode, { text: "x", clip: raw.slots[0] });
    void g;
  });
});
