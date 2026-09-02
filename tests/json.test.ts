import { describe, expect, it } from "vitest";
import { parseIrJson, serializeComfyJson, serializeIrJson } from "../src/json.js";

describe("lossless JSON layer", () => {
  it("round-trips bigints through the tagged IR form", () => {
    const value = { seed: 18446744073709551615n, small: 42, nested: { list: [1n, -7n] } };
    const text = serializeIrJson(value as never);
    expect(text).toContain('"$int":"18446744073709551615"');
    const parsed = parseIrJson(text) as { seed: bigint; small: number; nested: { list: bigint[] } };
    expect(parsed.seed).toBe(18446744073709551615n);
    expect(parsed.small).toBe(42);
    expect(parsed.nested.list).toEqual([1n, -7n]);
  });

  it("is safe under ordinary JSON.parse — no precision corruption", () => {
    const text = serializeIrJson({ seed: 18446744073709551615n });
    const naive = JSON.parse(text) as { seed: { $int: string } };
    // The tag survives even in tooling that mangles big numbers.
    expect(naive.seed.$int).toBe("18446744073709551615");
    // Plain JSON numbers are NOT tagged: they are exactly representable.
    const plain = JSON.parse(serializeIrJson({ small: 42 }));
    expect((plain as { small: number }).small).toBe(42);
  });

  it("emits raw numeric literals for Comfy JSON", () => {
    const obj = {
      n3: {
        class_type: "KSampler",
        inputs: { seed: 18446744073709551615n, cfg: 8, model: ["n1", 0] },
        _meta: { title: "KSampler" },
      },
    };
    const text = serializeComfyJson(obj);
    expect(text).toContain('"seed":18446744073709551615');
    expect(text).not.toContain('"$int"');
    // Round-trips through Python-style semantics: digits preserved exactly.
    expect(text).toMatch(/"seed":18446744073709551615(,|})/);
  });

  it("rejects non-finite numbers and undefined", () => {
    expect(() => serializeComfyJson({ a: Number.NaN })).toThrow();
    expect(() => serializeComfyJson({ a: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => serializeComfyJson({ a: undefined })).toThrow();
  });

  it("formats pretty output deterministically", () => {
    const obj = { b: { a: 1 }, a: [1n, { k: "v" }] };
    expect(serializeComfyJson(obj, 2)).toBe(serializeComfyJson(obj, 2));
    expect(serializeComfyJson(obj, 2)).toContain('\n  "b"');
  });
});
