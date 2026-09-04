# Models

Comfy Workflows **reports** model requirements (`requires.models` in the manifest). It does **not** download checkpoints, LoRAs, VAEs, or anything else.

Why:

- Licensing differs per file
- Some sources need auth
- Files are huge
- Placement is Comfy-layout-specific (`models/checkpoints`, extra_model_paths, …)

`cwf setup` installs verified **node packs** (Python). It does not install models.

Pass checkpoint **filenames** as parameters. Put the files on the server yourself. A package that validates and then fails at queue time with "model not found" is a missing file, not a broken graph.
