# Reproducible runs

With `outDir` / `--out`:

```
out/<runId>/run.json     # params, graphHash, defsHash, exact /prompt body, artifacts, warnings
out/<runId>/<files>      # downloaded artifacts
```

`run.json.compiledJson` is the lossless JSON submitted to `/prompt`, stored as a string. POST it again with `{ kind: "wire", json }`.

Seeds must be explicit. Do not rely on Comfy's "randomize".

This reproduces the **request**. GPU bit-identical images are outside the SDK. [Determinism](/concepts/determinism)
