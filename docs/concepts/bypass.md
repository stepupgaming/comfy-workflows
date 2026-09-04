# Bypass and mute

Modes: `active` (default), `bypassed`, `muted`.

## Bypass

A bypassed node is a pass-through. The compiler rewires consumers only when you set an explicit `bypassMap`: output index → input name whose connection should continue.

No map → `E_UNRESOLVED_BYPASS`. The SDK will not guess by matching types. Imported graphs that relied on frontend implicit pass-through need you to write the map.

```ts
g.setMode(node.id, "bypassed");
g.setBypassMap(node.id, { 0: "model" });
```

## Mute

A muted node is off. If anything still connects to it → `E_MUTED_CONSUMED`. Dead-subgraph deletion is your choice, not an automatic rewrite.
