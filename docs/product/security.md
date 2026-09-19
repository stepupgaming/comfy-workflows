# Security model

Short version. The dedicated page is [Project: Security](/project/security).

- Workflow packages are inspected as pure data (`package.json`, manifest, IR).
- Package JavaScript is not executed during inspect or package discovery for `run`.
- Custom nodes **are** executable Python. Installing them is a trust decision made with Comfy CLI / Manager, not this SDK.
- This SDK never installs Python.
- Manifests have no `install` / `script` / `shell` / `pip` / `git` command fields.
- `repository` URLs are informational. Never cloned automatically.
- `rawNode` names a class. It does not download or exec code by itself.

Models are **not** auto-downloaded. [Models](/guide/models)
