# Generated artifacts

First-party code authoring:

```
ir.build.ts                 authored
    ↓
workflow.ir.json            generated
comfy.workflow.json         generated / derived
    ↓ compile
prompt / API JSON           generated
```

Environment:

```
/object_info
    ↓ snapshot
object_info.json            generated
    ↓ codegen
typed node wrappers         generated
comfy.lock.json             generated (on purpose)
```

Application runtime consumes generated output. It does not edit it.

Label generated files in the repo (`DO NOT HAND EDIT` in the header is what codegen already writes). [What do I edit?](/start/what-do-i-edit)

## Prompt templates

Some products emit a compiled graph that still contains `{$param}` placeholders so a non-JS binder can fill them without calling `instantiateTemplate`. That binder must not grow topology. If a parameter would change which nodes exist, you already split packages.

## Hashes

- `graphHash` — SHA-256 of canonical IR
- compile `hash` — SHA-256 of emitted API JSON
- `objectInfoHash` — snapshot fingerprint, stamped on generated nodes and recorded in the lock
