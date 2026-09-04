# Templates / ParamRef

A template is a Graph whose params hold `{ $param: "name" }` plus a `params` table (and optional `ports`).

`instantiateTemplate(tpl, { params, inputs })` substitutes, binds ports, and renumbers deterministically.

Recipe composition preserves placeholders. `hiresFix(withLora(tpl, …))` is still a template until you bind.

Package manifests restate the same parameters so `cwf inspect` / `cwf run --param` work without executing JS.

[Parameters guide](/code/parameters) · [Product integration](/product/build-time-vs-runtime)
