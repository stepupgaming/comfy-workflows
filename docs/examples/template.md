# Example: parameterized template

<<< @/examples-src/template.ts

```sh
cwf run workflow.ts --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a red cube" --param seed=42
```

[Parameters](/code/parameters)
