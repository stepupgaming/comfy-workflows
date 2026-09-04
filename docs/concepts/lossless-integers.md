# Lossless integers

JavaScript `number` is IEEE-754 float. Integers above 2^53 (9_007_199_254_740_991) cannot be represented exactly. Comfy seeds are 64-bit. `JSON.parse` / `JSON.stringify` will silently change them.

Journey:

```
JS bigint
    ↓
 Graph IR:  { "$int": "18446744073709551615" }
    ↓
 compiler
    ↓
 raw exact JSON numeric literal in the /prompt body
    ↓
 Comfy (Python)
```

IR stays safe under ordinary `JSON.parse` because of the tag. The wire form is assembled by string concatenation so bigints never pass through `JSON.stringify`.

Use `42n` in TypeScript. `cwf run --param seed=42` parses as integer; large seeds should be passed without going through JS `Number`.

`run.json.compiledJson` is stored as a **string** for this reason. Do not parse it if you need the seed intact.
