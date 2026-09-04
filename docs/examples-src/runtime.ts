import { createClient, instantiateTemplate, textToImage } from "@stepupgaming/comfy-workflows";

export function makeClient(url = "http://127.0.0.1:8188") {
  return createClient({ url });
}

export async function runOnce(url = "http://127.0.0.1:8188") {
  const client = createClient({ url });
  const graph = instantiateTemplate(
    textToImage({
      checkpoint: "v1-5-pruned-emaonly.safetensors",
      positivePrompt: "a red cube on a table",
      seed: 42n,
    }),
  );
  return client.run({ kind: "graph", graph }, { outDir: "out" });
}
