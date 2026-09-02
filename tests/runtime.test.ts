import { describe, expect, it } from "vitest";
import { createClient } from "../src/runtime/client.js";
import { workflow } from "../src/builder/builder.js";
import { textToImage } from "../src/recipes/textToImage.js";
import { instantiateTemplate } from "../src/ir/template.js";
import { AssetRef } from "../src/ir/types.js";
import * as n from "./specs.js";
import { coreDefs, coreObjectInfo } from "./helpers.js";
const coreObjectInfoLive = { KSampler: { input: { required: {} }, output: [] } };

/**
 * Mock Comfy: an in-process server (fetch + WebSocket) that verifies the
 * request body, replays a realistic WS event sequence, and serves /history
 * and /view. This is the behavioral contract the runtime depends on.
 */

interface CapturedRequest {
  url: string;
  method: string;
  body?: string;
  contentType?: string;
  headers: Record<string, string>;
}

function mockComfy(opts: { failNode?: boolean } = {}) {
  const requests: CapturedRequest[] = [];
  let wsHandler: ((send: (data: unknown) => void) => void) | undefined;

  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof FormData
          ? "FORM"
          : undefined;
    const contentType = (init?.headers as Record<string, string> | undefined)?.["Content-Type"];
    requests.push({
      url,
      method,
      body,
      contentType,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (url.endsWith("/prompt")) {
      const parsed = JSON.parse(String(init?.body)) as {
        prompt: Record<string, unknown>;
        client_id: string;
      };
      // BigInt literals must survive as raw JSON numbers — they arrive as
      // regular numbers here because JSON.parse can't produce bigint, but the
      // RAW body is what matters and is asserted separately.
      expect(Object.keys(parsed.prompt).length).toBeGreaterThan(0);
      if (opts.failNode) {
        return new Response(JSON.stringify({ error: { type: "invalid_prompt" } }), { status: 400 });
      }
      wsHandler = (send) => {
        const nodeId = Object.keys(parsed.prompt)[0];
        setTimeout(() => {
          send({ type: "status", data: { status: { exec_info: { queue_remaining: 1 } } } });
          send({ type: "execution_start", data: { prompt_id: "run-1" } });
          send({ type: "executing", data: { prompt_id: "run-1", node: nodeId } });
          send({ type: "progress", data: { prompt_id: "run-1", value: 5, max: 20, node: nodeId } });
          send({ type: "executing", data: { prompt_id: "run-1", node: null } });
        }, 10);
      };
      return new Response(JSON.stringify({ prompt_id: "run-1", number: 1 }), { status: 200 });
    }
    if (url.includes("/history/")) {
      return new Response(
        JSON.stringify({
          "run-1": {
            status: { status_str: "success", completed: true },
            outputs: {
              9: { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }] },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.startsWith("/view?")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    }
    if (url.endsWith("/upload/image")) {
      return new Response(JSON.stringify({ name: "staged_input.png", subfolder: "" }), {
        status: 200,
      });
    }
    if (url.endsWith("/object_info")) {
      return new Response(JSON.stringify(coreObjectInfo), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const wsFactory = (url: string): WebSocket => {
    const fake = {
      onmessage: null as ((ev: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      onclose: null as (() => void) | null,
      close() {},
    };
    const pump = () => {
      if (!wsHandler) return;
      wsHandler((data) => fake.onmessage?.({ data: JSON.stringify(data) } as MessageEvent));
    };
    setTimeout(pump, 5);
    return fake as unknown as WebSocket;
  };

  return { requests, fetchImpl, wsFactory };
}

describe("runtime client", () => {
  it("submits the lossless wire body with raw bigint literals", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const graph = instantiateTemplate(
      textToImage({
        checkpoint: "v1-5-pruned-emaonly.safetensors",
        positivePrompt: "x",
        seed: 18446744073709551615n,
      }),
    );
    const result = await client.run({ kind: "graph", graph });
    expect(result.runId).toBe("run-1");
    const promptCall = comfy.requests.find((r) => r.url.endsWith("/prompt"));
    expect(promptCall).toBeDefined();
    // The exact 2^64−1 literal reached the HTTP body — no precision loss, no $int tag.
    expect(promptCall?.body).toContain('"seed":18446744073709551615');
    expect(promptCall?.body).not.toContain("$int");
  });

  it("streams WS events, downloads artifacts to outDir", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const events: string[] = [];
    const graph = instantiateTemplate(
      textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed: 1n }),
    );
    const result = await client.run({ kind: "graph", graph }, { outDir: "out/test-run" });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].filename).toBe("ComfyUI_00001_.png");
    expect(result.artifacts[0].savedPath).toContain("ComfyUI_00001_.png");
  });

  it("throws E_NODE_EXECUTION_ERROR on server-side node failure", async () => {
    const client = createClient({
      url: "http://mock",
      fetchImpl: mockComfy().fetchImpl,
      wsFactory: (url) => {
        const fake = {
          onmessage: null as ((ev: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          onclose: null as (() => void) | null,
          close() {},
        };
        setTimeout(() => {
          fake.onmessage?.({
            data: JSON.stringify({
              type: "execution_error",
              data: {
                prompt_id: "run-1",
                node_id: "n5",
                node_type: "KSampler",
                exception_message: "CUDA out of memory",
              },
            }),
          } as MessageEvent);
        }, 5);
        return fake as unknown as WebSocket;
      },
    });
    const graph = instantiateTemplate(
      textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed: 1n }),
    );
    await expect(client.run({ kind: "graph", graph })).rejects.toMatchObject({
      code: "E_NODE_EXECUTION_ERROR",
      nodeId: "n5",
    });
  });

  it("stages AssetRef params via /upload/image without touching Content-Type, non-mutating, rerunnable", async () => {
    const comfy = mockComfy();
    const client = createClient({
      url: "http://mock",
      headers: { Authorization: "Bearer t" },
      ...comfy,
    });
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "comfy-sdk-"));
    const photo = join(dir, "photo.png");
    writeFileSync(photo, "fake-png-bytes");
    const g = workflow("assets");
    g.rawNode("LoadImage", { image: new AssetRef(photo) });
    const graph = g.toGraph();
    const graphBefore = JSON.stringify(graph, (_k, v) =>
      v instanceof AssetRef ? { $asset: v.path } : v,
    );

    // Run the SAME graph object twice — staging must not mutate it.
    for (let i = 0; i < 2; i++) {
      await client.run({ kind: "graph", graph });
      const prompt = comfy.requests.filter((r) => r.url.endsWith("/prompt"))[i];
      expect(prompt?.body).toContain("staged_input.png");
      expect(prompt?.body).not.toContain("photo.png");
    }

    // Upload request: auth header preserved, NO explicit Content-Type
    // (FormData must supply its own multipart boundary).
    const upload = comfy.requests.find((r) => r.url.endsWith("/upload/image"));
    expect(upload).toBeDefined();
    const uploadHeaders = upload?.headers ?? {};
    expect(uploadHeaders["Authorization"]).toBe("Bearer t");
    expect(Object.keys(uploadHeaders).some((k) => k.toLowerCase() === "content-type")).toBe(false);

    // The caller's Graph still carries its AssetRef (unchanged after both runs).
    const graphAfter = JSON.stringify(graph, (_k, v) =>
      v instanceof AssetRef ? { $asset: v.path } : v,
    );
    expect(graphAfter).toBe(graphBefore);
    expect((graph.nodes["n1"].params["image"] as AssetRef).path).toBe(photo);
  });

  it("accepts pre-serialized wire JSON without re-serialization drift", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const wire = `{"n1":{"class_type":"EmptyLatentImage","inputs":{"width":512,"height":512,"batch_size":1},"_meta":{"title":"Empty Latent Image"}}}`;
    const result = await client.run({ kind: "wire", json: wire });
    expect(result.runId).toBe("run-1");
    const prompt = comfy.requests.find((r) => r.url.endsWith("/prompt"));
    expect(prompt?.body).toContain('"width":512');
  });

  it("writes replay metadata to <outDir>/<runId>/run.json", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const outDir = mkdtempSync(join(tmpdir(), "comfy-run-"));
    const graph = instantiateTemplate(
      textToImage({
        checkpoint: "v1-5-pruned-emaonly.safetensors",
        positivePrompt: "replay me",
        seed: 18446744073709551615n,
      }),
    );
    const result = await client.run({ kind: "graph", graph }, { outDir, defs: coreDefs });
    const runJson = JSON.parse(readFileSync(join(outDir, result.runId, "run.json"), "utf8")) as {
      format: string;
      runId: string;
      graphHash?: string;
      defsHash?: string;
      compiledJson: string;
      artifacts: Array<{ filename: string }>;
    };
    expect(runJson.format).toBe("comfy-run");
    expect(runJson.runId).toBe("run-1");
    expect(runJson.graphHash).toBeTypeOf("string");
    expect(runJson.defsHash).toBeTypeOf("string");
    // Replayable: the exact wire body, bigint literal intact.
    expect(runJson.compiledJson).toContain('"seed":18446744073709551615');
    expect(runJson.artifacts[0].filename).toBe("ComfyUI_00001_.png");
    // No field anywhere in run.json may hold a precision-corrupted seed.
    expect(readFileSync(join(outDir, result.runId, "run.json"), "utf8")).not.toContain(
      "18446744073709552000",
    );
  });

  it("runAll executes a sweep with bounded concurrency", async () => {
    const comfy = mockComfy();
    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = {
      ...comfy,
      fetchImpl: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        if (String(input).endsWith("/prompt")) {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 10));
          inFlight--;
          // Delegate to the original mock so its WS event pump stays armed.
          return (comfy.fetchImpl as typeof fetch)(input, init);
        }
        return (comfy.fetchImpl as typeof fetch)(input, init);
      }) as typeof fetch,
    };
    const client = createClient({ url: "http://mock", ...tracked });
    const mk = (seed: bigint) =>
      instantiateTemplate(
        textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed }),
      );
    const results = await client.runAll(
      [1n, 2n, 3n, 4n, 5n].map((s) => ({ kind: "graph" as const, graph: mk(s) })),
      { concurrency: 2 },
    );
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.runId === "run-1")).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("validate() never submits /prompt — local check against LIVE defs only", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const graph = instantiateTemplate(
      textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed: 1n }),
    );
    const res = await client.validate({ kind: "graph", graph });
    expect(res.ok).toBe(true);
    // Validation fetches live /object_info but must NEVER queue execution.
    expect(comfy.requests.filter((r) => r.url.endsWith("/prompt"))).toHaveLength(0);
    expect(comfy.requests.some((r) => r.url.endsWith("/object_info"))).toBe(true);
    expect((res.serverResponse as { mode?: string }).mode).toBe("local-against-live-defs");
  });

  it("validate() reports def-level problems against the live universe", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    // KSampler whose sampler_name is invalid for the LIVE defs.
    const graph = instantiateTemplate(
      textToImage({
        checkpoint: "v1-5-pruned-emaonly.safetensors",
        positivePrompt: "x",
        seed: 1n,
        sampler: "definitely-not-a-real-sampler",
      }),
    );
    const res = await client.validate({ kind: "graph", graph });
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "E_BAD_COMBO")).toBe(true);
    expect(comfy.requests.filter((r) => r.url.endsWith("/prompt"))).toHaveLength(0);
  });

  it("requires the auth header on /object_info, /prompt, /history and /view", async () => {
    const AUTH = "Bearer secret-token";
    const requests: Array<{ url: string; auth?: string }> = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      requests.push({ url, auth });
      if (url.endsWith("/object_info")) {
        if (auth !== AUTH) return new Response("unauthorized", { status: 401 });
        return new Response(JSON.stringify(coreObjectInfoLive), { status: 200 });
      }
      if (url.endsWith("/prompt")) {
        if (auth !== AUTH) return new Response("unauthorized", { status: 401 });
        return new Response(JSON.stringify({ prompt_id: "auth-run" }), { status: 200 });
      }
      if (url.includes("/history/")) {
        if (auth !== AUTH) return new Response("unauthorized", { status: 401 });
        return new Response(
          JSON.stringify({
            "auth-run": {
              status: { status_str: "success" },
              outputs: { n7: { images: [{ filename: "out.png", subfolder: "", type: "output" }] } },
            },
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("/view")) {
        if (auth !== AUTH) return new Response("unauthorized", { status: 401 });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    // Native WebSocket cannot send arbitrary auth headers — the client falls
    // back to history polling when WS fails, and the docs require a custom
    // wsFactory for authenticated WS. Simulate an auth-less WS failing.
    const wsFactory = () => {
      const fake: {
        onmessage: ((ev: MessageEvent) => void) | null;
        onerror: (() => void) | null;
        onclose: (() => void) | null;
        close(): void;
      } = { onmessage: null, onerror: null, onclose: null, close() {} };
      setTimeout(() => fake.onerror?.(), 5);
      return fake as unknown as WebSocket;
    };
    const client = createClient({
      url: "http://mock",
      headers: { Authorization: AUTH },
      fetchImpl,
      wsFactory,
    });

    await client.objectInfo();
    const graph = instantiateTemplate(
      textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed: 1n }),
    );
    const result = await client.run({ kind: "graph", graph });

    expect(result.artifacts.length).toBe(1);
    for (const endpoint of ["/object_info", "/prompt", "/history/", "/view"]) {
      const hits = requests.filter((r) => r.url.includes(endpoint));
      expect(hits.length, `expected requests to ${endpoint}`).toBeGreaterThan(0);
      expect(
        hits.every((r) => r.auth === AUTH),
        `auth header missing on ${endpoint}`,
      ).toBe(true);
    }
  });

  it("normalizes server node_errors into structured ComfyError fields", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const graph = instantiateTemplate(
      textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors", positivePrompt: "x", seed: 1n }),
    );
    // Replace /prompt with ComfyUI's real validation-failure shape (captured
    // verbatim from a live run against VideoHelperSuite).
    let calls = 0;
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        calls++;
        return new Response(
          JSON.stringify({
            error: {
              type: "prompt_outputs_failed_validation",
              message: "Prompt outputs failed validation",
            },
            node_errors: {
              n1: {
                errors: [
                  {
                    type: "value_not_in_list",
                    message: "Value not in list",
                    details: "value: 'bad.ckpt' (ckpt_name)",
                    extra_info: { input_name: "ckpt_name" },
                  },
                ],
              },
            },
          }),
          { status: 400 },
        );
      }
      return (comfy.fetchImpl as typeof fetch)(input, init);
    }) as typeof fetch;
    const authClient = createClient({ url: "http://mock", fetchImpl });

    let caught: import("../src/errors.js").ComfyError | undefined;
    try {
      await authClient.run({ kind: "graph", graph });
    } catch (e) {
      caught = e as import("../src/errors.js").ComfyError;
    }
    expect(caught).toBeDefined();
    expect(caught?.code).toBe("E_SUBMIT_FAILED");
    // Structured fields from the server payload — not buried in details.
    expect(caught?.nodeId).toBe("n1");
    expect(caught?.nodeErrors).toHaveLength(1);
    const ne = caught?.nodeErrors?.[0].toJSON();
    expect(ne?.nodeId).toBe("n1");
    expect(ne?.input).toBe("ckpt_name");
    expect(ne?.got).toBe("bad.ckpt");
    expect(ne?.hint).toContain("bad.ckpt");
    expect(calls).toBe(1); // submit attempted exactly once, then structured failure
  });

  it("local defs produce structured errors before any network call", async () => {
    const comfy = mockComfy();
    const client = createClient({ url: "http://mock", ...comfy });
    const g = workflow("bad");
    const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    // Injected (not raw) KSampler without sampler/scheduler — locally detectable via defs.
    g.graph.nodes["n3"] = {
      type: "KSampler",
      params: { seed: 1n },
      inputs: { latent_image: { node: latent.id, out: 0 } },
    };
    g.graph.outputs.push({ node: "n3", out: 0 });
    await expect(
      client.run({ kind: "graph", graph: g.toGraph() }, { defs: coreDefs }),
    ).rejects.toMatchObject({
      code: "E_INVALID_GRAPH",
    });
    expect(comfy.requests.find((r) => r.url.endsWith("/prompt"))).toBeUndefined();
  });
});
