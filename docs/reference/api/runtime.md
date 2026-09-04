# Runtime API

`@stepupgaming/comfy-workflows/runtime` and root `createClient`.

## `createClient(opts)`

```ts
{
  url: string;
  headers?: Record<string, string>;
  defs?: NodeDefs;
  fetchImpl?: typeof fetch;
  wsFactory?: (url: string) => WebSocket;
  timeoutMs?: number; // default 600_000
}
```

## `ComfyClient`

| Method | Purpose |
| ------ | ------- |
| `objectInfo()` | GET `/object_info` |
| `systemStats()` | GET `/system_stats` |
| `validate(input, defs?)` | Compile/check; never queues |
| `run(input, opts?)` | Submit, wait, download |
| `runAll(inputs, opts?)` | Bounded concurrency |

`RunInput`: `{ kind: "template" | "graph" | "compiled" | "wire", ... }`.

`RunOptions`: `outDir`, `defs`, `onEvent`, `signal`.

`RunResult`: `runId`, `artifacts`, `history`, `warnings?`, `graphHash?`.

[Run guide](/code/run)
