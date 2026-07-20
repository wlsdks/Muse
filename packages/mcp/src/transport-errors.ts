/**
 * Stable, non-sensitive reason for a transport that the local-only posture
 * deliberately refuses. It never includes the configured URL, command,
 * headers, or token.
 */
export const MCP_EXTERNAL_TRANSPORT_BLOCKED = "MCP_EXTERNAL_TRANSPORT_BLOCKED" as const;

/** Raised by the direct SDK connector backstop when a caller bypasses McpManager. */
export class McpExternalTransportBlockedError extends Error {
  readonly code = MCP_EXTERNAL_TRANSPORT_BLOCKED;

  constructor() {
    super("External MCP transport is disabled by the local-only privacy posture");
    this.name = "McpExternalTransportBlockedError";
  }
}
