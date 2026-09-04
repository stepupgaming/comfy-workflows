/**
 * Tiny non-Node-style binder. It only replaces {$param} placeholders in a
 * compiled prompt template. It does not invent nodes or rewrite topology.
 */
/** @param {any} template @param {Record<string, unknown>} params */
export function bindParams(template, params) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "$param") {
        const name = value.$param;
        if (!(name in params)) {
          throw new Error(`unbound parameter: ${name}`);
        }
        return params[name];
      }
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  return walk(template);
}
