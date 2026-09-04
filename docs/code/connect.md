# Connect to Comfy

The SDK talks to Comfy over HTTP + WebSocket. Default docs URL:

```
http://127.0.0.1:8188
```

## From TypeScript

```ts
import { createClient } from "@stepupgaming/comfy-workflows";

const client = createClient({
  url: "http://127.0.0.1:8188",
  // headers: { Authorization: "Bearer …" },
  timeoutMs: 600_000,
});

const info = await client.objectInfo();
const stats = await client.systemStats();
```

`fetchImpl` and `wsFactory` are injectable for tests.

## From the CLI

Every command that needs a live instance takes `--url` / `-u`:

```sh
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf validate workflow.ts --url http://127.0.0.1:8188
cwf run workflow.ts --url http://127.0.0.1:8188
cwf inspect . --url http://127.0.0.1:8188
```

Defs resolution order for `compile` / `validate` / `run`:

1. `--defs` flag
2. live `/object_info` via `--url`
3. bundled core defs

If a live fetch was requested and failed, the CLI warns `E_LIVE_DEFS_UNAVAILABLE` and falls back to bundled defs. That warning is easy to miss. Prefer an explicit snapshot in CI.

## Remote Comfy

`--url https://some-host` is fine for snapshot, inspect, validate, and run (if that host accepts `/prompt`).

`cwf setup` **cannot** install custom nodes on a remote you do not have a filesystem for. `--url` without `--comfy` plans and stops. There is no remote shell. [Setup](/product/setup).
