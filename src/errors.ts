/**
 * Machine-readable error taxonomy. Every failure the SDK can produce carries a
 * stable `code` plus structured fields (node, input, expected/got, allowed
 * values, hint) so agents can branch on failures programmatically instead of
 * parsing prose.
 */

export const ErrorCodes = {
  /** Node class not present in the provided defs. */
  UnknownNodeType: "E_UNKNOWN_NODE_TYPE",
  /** Required input (connection or widget) has no value and no default. */
  MissingInput: "E_MISSING_INPUT",
  /** Connected output type does not match the input's declared type. */
  TypeMismatch: "E_TYPE_MISMATCH",
  /** Combo param value is not one of the allowed options. */
  BadCombo: "E_BAD_COMBO",
  /** Numeric param out of the declared [min, max] range. */
  Range: "E_RANGE",
  /** Param references an input the node def does not declare. */
  UnknownInput: "E_UNKNOWN_INPUT",
  /** Input key conflicts with the def (e.g. a widget name used as a connection). */
  InvalidInput: "E_INVALID_INPUT",
  /** Graph contains a cycle. */
  Cycle: "E_CYCLE",
  /** A muted node is still referenced by a consumer. */
  MutedConsumed: "E_MUTED_CONSUMED",
  /** A bypassed node's pass-through could not be resolved unambiguously. */
  UnresolvedBypass: "E_UNRESOLVED_BYPASS",
  /** Structural graph problem: dangling ref, out-of-range slot, malformed IR. */
  InvalidGraph: "E_INVALID_GRAPH",
  /** Param value present but not a valid value for its declared kind. */
  InvalidParam: "E_INVALID_PARAM",
  /** A template placeholder was never bound before compilation. */
  UnboundParam: "E_UNBOUND_PARAM",
  /** A template input port was never bound before compilation. */
  UnboundPort: "E_UNBOUND_PORT",
  /** An AssetRef reached compilation without being staged by a runtime. */
  AssetUnstaged: "E_ASSET_UNSTAGED",
  /** Asset upload to the server failed. */
  AssetStageFailed: "E_ASSET_STAGE_FAILED",
  /** HTTP submit failed (network, 4xx/5xx). */
  SubmitFailed: "E_SUBMIT_FAILED",
  /** ComfyUI reported a node-level execution error. */
  NodeExecutionError: "E_NODE_EXECUTION_ERROR",
  /** Run did not complete within the configured timeout. */
  Timeout: "E_TIMEOUT",
  /** Transport-level failure talking to the Comfy instance. */
  ConnectionFailed: "E_CONNECTION_FAILED",
  /** Imported workflow uses a construct the importer cannot represent yet. */
  UnsupportedFeature: "E_UNSUPPORTED_FEATURE",
  /** Multiple verified registry packs provide the same node class. */
  NodePackAmbiguous: "E_NODE_PACK_AMBIGUOUS",
  /** No verified registered pack could be identified for a node class. */
  NodePackUnknown: "E_NODE_PACK_UNKNOWN",
  /** Node-pack metadata in the manifest is invalid. */
  InvalidNodePack: "E_INVALID_NODE_PACK",
  /** Declared version range matches no active Registry version. */
  NodePackVersionUnsatisfied: "E_NODE_PACK_VERSION_UNSATISFIED",
  /** Target Comfy Python interpreter could not be established. */
  ComfyPythonUnknown: "E_COMFY_PYTHON_UNKNOWN",
  /** User declined the setup plan (or non-interactive without --yes). */
  SetupDeclined: "E_SETUP_DECLINED",
  /** Setup cannot be applied (remote URL, missing Comfy path, missing installer). */
  SetupNotApplicable: "E_SETUP_NOT_APPLICABLE",
  /** Official installer returned a failure. */
  SetupFailed: "E_SETUP_FAILED",
  /** Bundled skill is missing from the installed package. */
  AgentSkillMissing: "E_AGENT_SKILL_MISSING",
  /** Project skill copy has local edits; --force required to overwrite. */
  AgentSkillModified: "E_AGENT_SKILL_MODIFIED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ComfyErrorFields {
  code: ErrorCode;
  message: string;
  hint?: string;
  nodeId?: string;
  input?: string;
  expected?: string;
  got?: string;
  allowed?: string[];
  /** Original server/import payload, when applicable. */
  details?: unknown;
}

export class ComfyError extends Error {
  readonly code: ErrorCode;
  readonly nodeId?: string;
  readonly input?: string;
  readonly expected?: string;
  readonly got?: string;
  readonly allowed?: string[];
  readonly hint?: string;
  readonly details?: unknown;
  /** Per-node child errors (e.g. normalized ComfyUI /prompt node_errors). */
  readonly nodeErrors?: ComfyError[];

  constructor(fields: ComfyErrorFields & { nodeErrors?: ComfyError[] }) {
    super(fields.message);
    this.name = "ComfyError";
    this.code = fields.code;
    this.nodeId = fields.nodeId;
    this.input = fields.input;
    this.expected = fields.expected;
    this.got = fields.got;
    this.allowed = fields.allowed;
    this.hint = fields.hint;
    this.details = fields.details;
    this.nodeErrors = fields.nodeErrors;
  }

  /** Plain-object form, suitable for JSON logs and agent consumption. */
  toJSON(): ComfyErrorFields & { nodeErrors?: ComfyErrorFields[] } {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      nodeId: this.nodeId,
      input: this.input,
      expected: this.expected,
      got: this.got,
      allowed: this.allowed,
      details: this.details,
      ...(this.nodeErrors !== undefined
        ? { nodeErrors: this.nodeErrors.map((e) => e.toJSON()) }
        : {}),
    };
  }
}

export function isComfyError(e: unknown): e is ComfyError {
  return e instanceof ComfyError;
}
