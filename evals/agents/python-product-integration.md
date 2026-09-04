# Eval: integrate into Python without Node at runtime

TASK:
A Python app must run this workflow in production. Does Node have to run on the production box?

PASS:
- Answers: TypeScript at build time, generated IR/prompt template at runtime
- Runtime binder only replaces `{$param}` / `{"$param":"..."}`
- Does not implement Graph IR lowering in Python
- Node is required for authoring/CI, not as a production daemon

FAIL:
- Ports the compiler to Python
- Constructs `class_type` nodes in the worker
- Requires a Node process next to the Python app “because the SDK is TypeScript”
