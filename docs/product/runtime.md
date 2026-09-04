# Runtime integration

## TypeScript app

```ts
import { createClient, instantiateTemplate } from "@stepupgaming/comfy-workflows";
import { buildTemplate } from "./ir.build";

const client = createClient({ url: process.env.COMFY_URL! });
const graph = instantiateTemplate(buildTemplate(), {
  params: { prompt: req.body.prompt, seed: BigInt(req.body.seed) },
});
const result = await client.run({ kind: "graph", graph }, { outDir: "/tmp/runs" });
```

## Non-Node app

Load the generated prompt template or IR, bind declared params, POST `/prompt`, wait on WS or `/history`, download `/view`.

Keep a table of package name → artifact path. Product flags choose a **package**, not a nest of if-statements that rewrite `class_type`.

## Errors

Map `ComfyError.code` (and CLI stderr JSON) into your job record. Do not parse Comfy's HTML. [Errors](/reference/errors)

## Assets

Stage input images through Comfy's upload endpoints, or through `AssetRef` if you are on the TS client. Published packages must not embed `C:\Users\...`. [Assets](/guide/assets)
