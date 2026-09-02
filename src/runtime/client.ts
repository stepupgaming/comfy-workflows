import { promises as fs } from "node:fs";
import path from "node:path";
import { ComfyError, ErrorCodes } from "../errors.js";
import { compile, type CompileResult } from "../compile/index.js";
import { instantiateTemplate } from "../ir/template.js";
import { graphHash } from "../ir/hash.js";
import type { Graph } from "../ir/index.js";
import { AssetRef } from "../ir/types.js";
import { serializeComfyJson, type ComfyApiObject } from "../json.js";
import { hashObjectInfo, parseObjectInfo } from "../defs/parse.js";
import { validateGraph, lowerBypass } from "../compile/index.js";
import type { NodeDefs } from "../defs/index.js";
import { defaultUploader, stageAssets, type AssetUploader, type UploadedAsset } from "./assets.js";

/**
 * Comfy runtime client: executes compiled workflows against a local or remote
 * ComfyUI instance over HTTP + WebSocket.
 *
 * The POST body to /prompt is always produced by the SDK's lossless
 * serializer — bigint values never pass through JS number serialization.
 * Inputs to `run` may be a template, a concrete graph, a compiled object, or
 * a pre-serialized JSON string; compiled artifacts never need to hit disk.
 */

export interface ClientOptions {
  /** Base URL, e.g. http://127.0.0.1:8188 */
  url: string;
  headers?: Record<string, string>;
  /**
   * Local node defs used to validate before submission. Server-side
   * validation remains authoritative; local defs give early, structured
   * errors. Per-call `RunOptions.defs` overrides this.
   */
  defs?: NodeDefs;
  /** Injectable fetch (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable WebSocket factory (tests). Defaults to globalThis.WebSocket. */
  wsFactory?: (url: string) => WebSocket;
  /** Run timeout in ms (default 600000 = 10 min). */
  timeoutMs?: number;
}

export interface RunEventBase {
  runId: string;
}

export type RunEvent =
  | (RunEventBase & { type: "submitted"; promptId: string })
  | (RunEventBase & { type: "progress"; value: number; max: number; nodeId?: string })
  | (RunEventBase & { type: "node-start"; nodeId: string; displayNode?: string })
  | (RunEventBase & { type: "node-end"; nodeId: string; displayNode?: string })
  | (RunEventBase & { type: "executing"; nodeId: string | null })
  | (RunEventBase & { type: "status"; queueRemaining: number })
  | (RunEventBase & { type: "completed" });

export interface Artifact {
  filename: string;
  subfolder: string;
  /** "output" folder type — temp outputs are downloaded but not saved. */
  type: string;
  /** MIME type as reported by /view. */
  contentType?: string;
  /** Saved file path (when outDir was configured). */
  savedPath?: string;
  bytes?: Uint8Array;
}

export interface RunResult {
  runId: string;
  /** Graph outputs, in declaration order. */
  artifacts: Artifact[];
  /** Full history entry from GET /history/{id}. */
  history: Record<string, unknown>;
  warnings?: ComfyError[];
  graphHash?: string;
}

export type RunInput =
  | {
      kind: "template";
      graph: Graph;
      params?: Record<string, unknown>;
      inputs?: Record<string, unknown>;
    }
  | { kind: "graph"; graph: Graph }
  | { kind: "compiled"; object: ComfyApiObject }
  | { kind: "wire"; json: string };

export interface RunOptions {
  /**
   * Directory for run artifacts and replay metadata. Layout:
   * `<outDir>/<runId>/run.json` + the run's output files beside it.
   */
  outDir?: string;
  /** Local defs for this run (overrides ClientOptions.defs). */
  defs?: NodeDefs;
  onEvent?: (event: RunEvent) => void;
  signal?: AbortSignal;
}

export interface ComfyClient {
  objectInfo(): Promise<Record<string, unknown>>;
  systemStats(): Promise<Record<string, unknown>>;
  /** Compile (if needed) and validate against the server; returns server response or errors. */
  validate(
    input: RunInput,
    defs?: NodeDefs,
  ): Promise<{
    ok: boolean;
    errors?: ComfyError[];
    warnings?: ComfyError[];
    serverResponse?: unknown;
  }>;
  run(input: RunInput, opts?: RunOptions): Promise<RunResult>;
  /** Run several inputs with a concurrency cap (sweeps, batch generation). */
  runAll(inputs: RunInput[], opts?: RunOptions & { concurrency?: number }): Promise<RunResult[]>;
}

export function createClient(opts: ClientOptions): ComfyClient {
  const baseUrl = opts.url.replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const wsFactory = opts.wsFactory ?? ((url: string) => new WebSocket(url));
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const headers = opts.headers ?? {};

  async function http<T>(pathName: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${pathName}`, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      });
    } catch (e) {
      throw new ComfyError({
        code: ErrorCodes.ConnectionFailed,
        message: `Cannot reach Comfy at ${baseUrl}${pathName}`,
        hint: e instanceof Error ? e.message : String(e),
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ComfyError({
        code: ErrorCodes.SubmitFailed,
        message: `GET ${pathName} failed: HTTP ${res.status}`,
        details: body || undefined,
      });
    }
    return (await res.json()) as T;
  }

  async function toCompiled(input: RunInput, defs?: NodeDefs): Promise<CompileResult> {
    switch (input.kind) {
      case "template": {
        const graph = instantiateTemplate(input.graph, {
          params: input.params as never,
          inputs: input.inputs as never,
        });
        return compile(graph, defs);
      }
      case "graph":
        return compile(input.graph, defs);
      case "compiled":
        return {
          ok: true,
          object: input.object,
          json: serializeComfyJson(input.object),
          hash: "",
          warnings: [],
        };
      case "wire":
        return {
          ok: true,
          object: JSON.parse(input.json) as ComfyApiObject,
          json: input.json,
          hash: "",
          warnings: [],
        };
    }
  }

  async function prepareBody(input: RunInput, defs?: NodeDefs) {
    let compiled: CompileResult;
    let staged: UploadedAsset[] = [];
    if (input.kind === "graph" || input.kind === "template") {
      // Instantiate (pure) → stage assets on a CLONE, so the caller's Graph
      // keeps its AssetRefs and can be run again unchanged.
      const concrete =
        input.kind === "template"
          ? instantiateTemplate(input.graph, {
              params: input.params as never,
              inputs: input.inputs as never,
            })
          : input.graph;
      let graph = concrete;
      if (hasAssets(graph)) {
        const uploader: AssetUploader = defaultUploader(baseUrl, headers, fetchImpl);
        const result = await stageAssets(graph, uploader);
        graph = result.graph;
        staged = result.staged;
      }
      compiled = compile(graph, defs);
    } else {
      compiled = await toCompiled(input, defs);
    }
    if (!compiled.ok) {
      throw new ComfyError({
        code: ErrorCodes.InvalidGraph,
        message: `Compilation failed with ${compiled.errors.length} error(s)`,
        details: compiled.errors.map((e) => e.toJSON()),
      });
    }
    // The wire string is authoritative — send exactly this to /prompt.
    return { json: compiled.json, object: compiled.object, warnings: compiled.warnings, staged };
  }

  return {
    async objectInfo() {
      return http<Record<string, unknown>>("/object_info");
    },
    async systemStats() {
      return http<Record<string, unknown>>("/system_stats");
    },
    async validate(input, defs) {
      // Validation NEVER executes: no /prompt submission. The live check is
      // purely local — fetch the server's actual node universe, parse it into
      // defs, and compile/validate the graph against those LIVE defs. Only
      // run() may queue execution.
      const liveInfo = await http<Record<string, unknown>>("/object_info");
      const liveDefs = { ...(defs ?? {}), ...parseObjectInfo(liveInfo as never) };
      const validation = validateGraphForSubmit(input, liveDefs);
      return {
        ok: validation.ok,
        errors: validation.errors,
        warnings: validation.warnings,
        serverResponse: {
          mode: "local-against-live-defs",
          objectInfoHash: hashObjectInfo(liveInfo),
          liveNodeClasses: Object.keys(liveDefs).length,
        },
      };
    },
    async run(input: RunInput, runOpts: RunOptions = {}) {
      const defs = runOpts.defs ?? opts.defs;
      const graph = input.kind === "graph" ? input.graph : undefined;
      const prepared = await prepareBody(input, defs);
      // Submit. Body bytes are the lossless JSON string verbatim.
      const clientId = `comfy-sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // The submission envelope is assembled by string concatenation so the
      // prompt body (with raw bigint literals) is never parsed back into JS
      // values — parsing here would silently destroy >2^53 integers.
      const submitRes = await fetchImpl(`${baseUrl}/prompt`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: `{"prompt":${prepared.json},"client_id":${JSON.stringify(clientId)}}`,
      }).catch((e: unknown) => {
        throw new ComfyError({
          code: ErrorCodes.ConnectionFailed,
          message: "Cannot submit prompt",
          hint: e instanceof Error ? e.message : String(e),
        });
      });
      if (!submitRes.ok) {
        const body = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>;
        if (body["node_errors"]) {
          const normalized = normalizeNodeErrors(body);
          if (normalized.length > 0) {
            const first = normalized[0];
            throw new ComfyError({
              code: ErrorCodes.SubmitFailed,
              message:
                `Submit rejected: ${normalized.length} node error(s): ` +
                normalized.map((e) => e.message).join("; "),
              // Structured, per-node: every child carries nodeId/input/
              // hint extracted from the server payload.
              nodeErrors: normalized,
              // Top-level convenience fields from the first node error.
              nodeId: first.nodeId,
              ...(first.input !== undefined ? { input: first.input } : {}),
              ...(first.hint !== undefined ? { hint: first.hint } : {}),
              details: body,
            });
          }
          throw new ComfyError({
            code: ErrorCodes.SubmitFailed,
            message: `Submit rejected: ${JSON.stringify(body["error"] ?? "node errors")}`,
            details: body,
          });
        }
        // 5xx → retryable
        if (submitRes.status >= 500) {
          throw new ComfyError({
            code: ErrorCodes.SubmitFailed,
            message: `Submit failed: HTTP ${submitRes.status} (retryable)`,
            details: body,
          });
        }
        throw new ComfyError({
          code: ErrorCodes.SubmitFailed,
          message: `Submit failed: HTTP ${submitRes.status}`,
          details: body,
        });
      }
      const { prompt_id: runId } = (await submitRes.json()) as { prompt_id: string };
      runOpts.onEvent?.({ type: "submitted", runId, promptId: runId });

      // Watch progress over WS, then fetch history + artifacts.
      const events = watchProgress(
        wsFactory,
        baseUrl,
        clientId,
        runId,
        headers,
        fetchImpl,
        runOpts.onEvent,
        runOpts.signal,
        timeoutMs,
      );
      const history = await events;

      const outputs = collectArtifacts(history);
      const runDir = runOpts.outDir !== undefined ? path.join(runOpts.outDir, runId) : undefined;
      const artifacts = await downloadArtifacts(fetchImpl, baseUrl, headers, outputs, runDir);

      // Replay metadata: params, graph/defs hashes, compiled JSON, artifacts.
      // A run directory is self-auditing — re-submit run.json's promptBody to
      // reproduce the run exactly.
      if (runDir !== undefined) {
        await fs.mkdir(runDir, { recursive: true });
        const runJson = {
          format: "comfy-run",
          version: 1,
          runId,
          promptId: runId,
          url: baseUrl,
          capturedAt: new Date().toISOString(),
          graphHash:
            input.kind === "graph" || input.kind === "template"
              ? graphHash(input.graph)
              : undefined,
          defsHash: defs !== undefined ? defsHash(defs) : undefined,
          params: input.kind === "template" ? (input.params ?? {}) : undefined,
          // Exact string — never JSON.parse'd back, so >2^53 integers stay
          // byte-perfect in the replay record.
          compiledJson: prepared.json,
          artifacts: artifacts.map((a) => ({
            filename: a.filename,
            subfolder: a.subfolder,
            type: a.type,
            contentType: a.contentType,
            savedPath: a.savedPath,
          })),
          warnings: prepared.warnings.map((w) => w.toJSON()),
        };
        await fs.writeFile(
          path.join(runDir, "run.json"),
          JSON.stringify(runJson, null, 2) + "\n",
          "utf8",
        );
      }

      return {
        runId,
        artifacts,
        history,
        warnings: prepared.warnings,
        graphHash:
          input.kind === "graph" || input.kind === "template" ? graphHash(input.graph) : undefined,
      };
    },

    async runAll(inputs, runOpts = {}) {
      const concurrency = Math.max(1, runOpts.concurrency ?? 2);
      const results: RunResult[] = [];
      let next = 0;
      const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
        for (;;) {
          const i = next++;
          if (i >= inputs.length) return;
          results[i] = await this.run(inputs[i], runOpts);
        }
      });
      await Promise.all(workers);
      return results;
    },
  };
}

/**
 * Canonical hash for a defs table: reuse hashObjectInfo (canonical JSON →
 * sha256) over the normalized defs, so the same object_info always yields the
 * same defsHash.
 */
function defsHash(defs: NodeDefs): string {
  return hashObjectInfo(defs as unknown as Record<string, unknown>);
}

/**
 * Full local validation of a RunInput against the given defs: lower bypass,
 * instantiate templates, then validate. No network submission.
 */
function validateGraphForSubmit(input: RunInput, defs: NodeDefs): ReturnType<typeof validateGraph> {
  let graph: Graph;
  switch (input.kind) {
    case "template":
      graph = instantiateTemplate(input.graph, {
        params: input.params as never,
        inputs: input.inputs as never,
      });
      break;
    case "graph":
      graph = input.graph;
      break;
    case "compiled":
    case "wire":
      // Pre-compiled inputs have no IR to validate; treat as structurally OK.
      return { ok: true, errors: [], warnings: [] };
  }
  const lowered = lowerBypass(graph, defs);
  if (lowered.errors.length > 0) {
    return { ok: false, errors: lowered.errors, warnings: [] };
  }
  const validation = validateGraph(lowered.graph, defs);
  return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings };
}

/**
 * Normalize ComfyUI's /prompt validation failure into structured ComfyErrors.
 * The server payload looks like:
 *   { error: {type, message, details}, node_errors: { "<nodeId>": {
 *       errors: [{ type, message, details, extra_info: { input_name, ... } }] } } }
 * Each node error becomes a ComfyError with nodeId/input filled from the
 * payload; the raw server entry stays attached as details.
 */
export function normalizeNodeErrors(body: Record<string, unknown>): ComfyError[] {
  const errors: ComfyError[] = [];
  const nodeErrors = body["node_errors"] as
    Record<string, { errors?: Array<Record<string, unknown>> }> | undefined;
  if (nodeErrors !== undefined) {
    for (const nodeId of Object.keys(nodeErrors).sort()) {
      const entries = nodeErrors[nodeId]?.errors ?? [];
      if (entries.length === 0) {
        errors.push(
          new ComfyError({
            code: ErrorCodes.NodeExecutionError,
            message: `Node ${nodeId} failed server validation`,
            nodeId,
            details: nodeErrors[nodeId],
          }),
        );
        continue;
      }
      for (const entry of entries) {
        const extraInfo = (entry["extra_info"] ?? {}) as Record<string, unknown>;
        const inputName =
          typeof extraInfo["input_name"] === "string" ? extraInfo["input_name"] : undefined;
        // Server validation messages often embed the actionable part; pull
        // well-known fields out of details when the server provides them.
        const detailsText = typeof entry["details"] === "string" ? entry["details"] : undefined;
        // "value: 'bad.ckpt' (ckpt_name)" — the rejected value is parseable.
        const gotMatch: string | undefined =
          detailsText !== undefined
            ? (/value: '([^']*)'/.exec(detailsText)?.[1] ?? undefined)
            : undefined;
        errors.push(
          new ComfyError({
            code: ErrorCodes.SubmitFailed,
            message: `Node ${nodeId}${inputName !== undefined ? ` input "${inputName}"` : ""}: ${
              typeof entry["message"] === "string" ? entry["message"] : "failed server validation"
            }${detailsText !== undefined && detailsText !== "" ? ` — ${detailsText}` : ""}`,
            nodeId,
            ...(inputName !== undefined ? { input: inputName } : {}),
            ...(gotMatch !== undefined ? { got: gotMatch } : {}),
            hint: detailsText !== undefined && detailsText !== "" ? detailsText : undefined,
            details: { serverError: entry, nodeError: nodeErrors[nodeId] },
          }),
        );
      }
    }
  }
  return errors;
}

function hasAssets(g: Graph): boolean {
  return Object.values(g.nodes).some((n) => Object.values(n.params).some((v) => containsAsset(v)));
}

function containsAsset(v: unknown): boolean {
  if (v instanceof AssetRef) return true;
  if (Array.isArray(v)) return v.some(containsAsset);
  return false;
}

/** Resolve node outputs from a history entry: {outputs: {nodeId: {images|videos|audio: [...]}}} */
function collectArtifacts(
  history: Record<string, unknown>,
): Array<{ nodeId: string; file: { filename: string; subfolder?: string; type?: string } }> {
  const result: Array<{
    nodeId: string;
    file: { filename: string; subfolder?: string; type?: string };
  }> = [];
  const outputs = history["outputs"] as Record<string, Record<string, unknown>> | undefined;
  if (!outputs) return result;
  for (const nodeId of Object.keys(outputs).sort()) {
    const nodeOut = outputs[nodeId];
    for (const key of ["images", "videos", "audio", "gifs"]) {
      const list = nodeOut[key];
      if (Array.isArray(list)) {
        for (const f of list) {
          if (f && typeof f === "object" && "filename" in f) {
            result.push({
              nodeId,
              file: f as { filename: string; subfolder?: string; type?: string },
            });
          }
        }
      }
    }
  }
  return result;
}

async function downloadArtifacts(
  fetchImpl: typeof fetch,
  baseUrl: string,
  headers: Record<string, string>,
  outputs: Array<{ nodeId: string; file: { filename: string; subfolder?: string; type?: string } }>,
  outDir?: string,
): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  for (const { nodeId, file } of outputs) {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder ?? "",
      type: file.type ?? "output",
    });
    const res = await fetchImpl(`${baseUrl}/view?${params}`, { headers });
    if (!res.ok) {
      throw new ComfyError({
        code: ErrorCodes.ConnectionFailed,
        message: `Failed to download artifact ${file.filename}: HTTP ${res.status}`,
      });
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let savedPath: string | undefined;
    if (outDir !== undefined) {
      await fs.mkdir(outDir, { recursive: true });
      savedPath = path.join(outDir, file.filename);
      await fs.writeFile(savedPath, bytes);
    }
    artifacts.push({
      filename: file.filename,
      subfolder: file.subfolder ?? "",
      type: file.type ?? "output",
      contentType: res.headers.get("content-type") ?? undefined,
      savedPath,
      bytes,
    });
  }
  return artifacts;
}

/** Subscribe to /ws?clientId and resolve when the run completes (history available). */
async function watchProgress(
  wsFactory: (url: string) => WebSocket,
  baseUrl: string,
  clientId: string,
  runId: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  onEvent: ((event: RunEvent) => void) | undefined,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(clientId)}`;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new ComfyError({
          code: ErrorCodes.Timeout,
          message: `Run ${runId} timed out after ${timeoutMs}ms`,
        }),
      );
    }, timeoutMs);
    const onAbort = () => {
      cleanup();
      reject(new ComfyError({ code: ErrorCodes.SubmitFailed, message: "Run aborted" }));
    };
    signal?.addEventListener("abort", onAbort);

    const ws = wsFactory(wsUrl);
    let closed = false;
    let settled = false;

    function cleanup(): void {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      clearInterval(completionPoll);
      signal?.removeEventListener("abort", onAbort);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }

    function settleWithHistory(): void {
      if (settled || closed) return;
      settled = true;
      cleanup();
      resolveHistory().then(resolve, reject);
    }

    // Completion is driven by /history (an entry appears only when the prompt
    // finishes — successfully or not), independent of WS event naming that
    // varies across ComfyUI versions. The WS remains the fast event stream.
    const completionPoll = setInterval(() => {
      void (async () => {
        try {
          const history = await resolveHistory();
          if (history["status"] !== undefined || history["outputs"] !== undefined) {
            const status = history["status"] as { status_str?: string } | undefined;
            if (status?.status_str === "error") {
              if (settled || closed) return;
              settled = true;
              cleanup();
              reject(
                new ComfyError({
                  code: ErrorCodes.NodeExecutionError,
                  message: `Run ${runId} failed on the server`,
                  details: history,
                }),
              );
            } else {
              settleWithHistory();
            }
          }
        } catch {
          /* transient network errors — the next tick retries */
        }
      })();
    }, 1000);

    ws.onmessage = (msg: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(msg.data)) as Record<string, unknown>;
      } catch {
        return; // binary frames (previews) are ignored
      }
      const type = data["type"];
      const payload = (data["data"] ?? {}) as Record<string, unknown>;
      if (payload["prompt_id"] !== undefined && payload["prompt_id"] !== runId && type !== "status")
        return;
      switch (type) {
        case "status":
          onEvent?.({
            type: "status",
            runId,
            queueRemaining:
              (payload["status"] as { exec_info?: { queue_remaining?: number } })?.exec_info
                ?.queue_remaining ?? 0,
          });
          break;
        case "execution_start":
        case "execution_cached":
          break;
        case "executing": {
          const node = payload["node"] as string | null;
          onEvent?.({ type: "executing", runId, nodeId: node ?? "" });
          if (node === null) {
            // Legacy end-of-execution signal; the completion poll is the
            // authoritative resolver — this only accelerates it.
            settleWithHistory();
          }
          break;
        }
        case "progress":
          onEvent?.({
            type: "progress",
            runId,
            value: Number(payload["value"] ?? 0),
            max: Number(payload["max"] ?? 0),
            nodeId: payload["node"] as string | undefined,
          });
          break;
        case "execution_error": {
          cleanup();
          reject(
            new ComfyError({
              code: ErrorCodes.NodeExecutionError,
              message: `Node ${payload["node_id"]} (${payload["node_type"]}) failed: ${payload["exception_message"]}`,
              nodeId: String(payload["node_id"] ?? ""),
              details: payload,
            }),
          );
          break;
        }
        case "execution_success":
          break;
        default:
          break;
      }
    };
    ws.onerror = () => {
      // Fall back to polling: some setups refuse WS. The completion poll may
      // already be running — that is fine, it is idempotent.
      if (!closed) pollHistory().then(resolve, reject);
    };
    ws.onclose = () => {
      // If the run is still pending, fall back to polling.
      if (!closed && !settled) pollHistory().then(resolve, reject);
    };

    async function resolveHistory(): Promise<Record<string, unknown>> {
      // Use the configured client headers — authenticated servers reject
      // unauthenticated /history fetches.
      const res = await fetchImpl(`${baseUrl}/history/${runId}`, { headers });
      if (!res.ok)
        throw new ComfyError({
          code: ErrorCodes.ConnectionFailed,
          message: `GET /history/${runId} failed: HTTP ${res.status}`,
        });
      const body = (await res.json()) as Record<string, Record<string, unknown>>;
      return body[runId] ?? {};
    }

    async function pollHistory(): Promise<Record<string, unknown>> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (signal?.aborted)
          throw new ComfyError({ code: ErrorCodes.SubmitFailed, message: "Run aborted" });
        await new Promise((r) => setTimeout(r, 500));
        try {
          const history = await resolveHistory();
          if (history["status"] !== undefined || history["outputs"] !== undefined) {
            const status = history["status"] as { status_str?: string } | undefined;
            if (status?.status_str === "error") {
              throw new ComfyError({
                code: ErrorCodes.NodeExecutionError,
                message: `Run ${runId} failed on the server`,
                details: history,
              });
            }
            return history;
          }
        } catch (e) {
          if (e instanceof ComfyError) throw e;
          // transient network errors — keep polling
        }
      }
      throw new ComfyError({
        code: ErrorCodes.Timeout,
        message: `Run ${runId} timed out after ${timeoutMs}ms`,
      });
    }
  });
}

export { defaultUploader, stageAssets };
export type { AssetUploader, UploadedAsset };
