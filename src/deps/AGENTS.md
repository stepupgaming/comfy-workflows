# Agent notes for `src/deps/`

This directory maps workflow `class_type` names to Comfy Registry packs and plans local Comfy setup. It does not install anything by itself. Installation is `cwf setup` / `applySetupPlan`.

## Do not guess

- Do not infer pack ownership from GitHub repo names, class-name prefixes, or README prose.
- Registry search is a hint. A pack is accepted only after the **selected version's** node definitions list the class.
- Author `source: "registry"` is a claim, not proof.

## Resolution kinds

| Kind | Meaning |
| ---- | ------- |
| `core` | Built-in Comfy class |
| `resolved_custom` | One verified Registry owner |
| `ambiguous` | Multiple verified candidates. Report, do not auto-pick |
| `unknown` | Unverified or no owner |

`UNKNOWN` is not `CUSTOM`. Do not install unknown classes.

## Install boundary

- `inspect` / `run` / `init` never install Python.
- Only a verified setup plan is eligible for `cwf setup`.
- Default confirmation is No. `--yes` approves that verified plan, not arbitrary git/pip URLs.
- Manifest `repository` is informational. Never clone it automatically.
- Live `/object_info` is availability, not ownership. Do not treat "the class exists on this machine" as Registry proof.

See `docs/guide/custom-nodes.md` and `docs/product/security.md`.
