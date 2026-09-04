# Security model

Short version. The dedicated page is [Project: Security](/project/security).

- Workflow packages are inspected as pure data (`package.json`, manifest, IR).
- Package JavaScript is not executed during inspect or package discovery for `run`.
- Custom nodes **are** executable Python. Installing them is a trust decision.
- Only `cwf setup` installs, after a printed plan and approval (default No).
- Registry verification is per pack **version** definitions, not a publisher claim.
- Manifests have no `install` / `script` / `shell` / `pip` / `git` command fields.
- Manager is invoked with an argument array, not a concatenated shell string.
- `repository` URLs are informational. Never cloned automatically.
- Remote `--url` without `--comfy` cannot apply setup.
- `rawNode` names a class. It does not download or exec code by itself.

Models are **not** auto-downloaded. [Models](/guide/models)
