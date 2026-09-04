# Asset handling

## `AssetRef`

A local file the runtime must upload before `/prompt`:

```ts
import { AssetRef } from "@stepupgaming/comfy-workflows";

const image = new AssetRef("C:/pics/input.png"); // kind defaults to "image"
const mask = new AssetRef("C:/pics/mask.png", "mask");
```

On disk: `{"$asset":"C:/pics/input.png"}`. The TS client uploads (`/upload/image`, `/upload/mask`) on a **clone** of the graph, then rewrites the ref to the server filename.

If an `AssetRef` reaches `compile` without staging → `E_ASSET_UNSTAGED`. Upload failure → `E_ASSET_STAGE_FAILED`.

Full asset management (sync, dedup, cleanup) is not built. The staging seam is.

## Paths in packages

Checkpoint **names** (`v1-5-pruned-emaonly.safetensors`) are portable parameters. Absolute machine paths are not.

`cwf pack` fails with `E_PACK_LOCAL_PATH` and a suggested `cwf expose`. Do not publish `C:\Users\Alice\Videos\input.mp4` as a default.

Windows and Unix paths with spaces are valid **on the machine that runs Comfy**. They are still not portable defaults.

[Models](/guide/models) · [Windows](/guide/windows)
