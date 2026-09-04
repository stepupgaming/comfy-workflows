# No second compiler

For non-JS integrations:

Do not reimplement Graph IR lowering in Python, Rust, Go, etc.

The Comfy Workflows compiler is the authority.

Other runtimes may consume compiled artifacts, generated templates, and narrow parameter binding. They should not fork bypass lowering, lossless integer emit, or slot identity.

If a flag needs different nodes, author another graph. If it needs a different number, bind a parameter.

This is the production rule that keeps 30+ workflows from growing a shadow compiler in the worker.
