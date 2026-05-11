/**
 * Attachment-context surface (D10).
 *
 * Personal-assistant front-ends (web upload, CLI file pin, voice
 * mode screenshot) declare attachments via
 * `AgentRunInput.metadata.attachments` — a JSON-friendly array of
 * `{ name, mimeType?, size?, description?, ref? }`. The runtime
 * surfaces them as an `[Attached Files]` block in the system
 * prompt so the agent can plan around them without first calling a
 * file tool. Actual binary upload to a vision-capable provider
 * (Gemini inline data, OpenAI image_url) is a separate adapter
 * concern — this surface is text-only on purpose so it works
 * across every provider.
 */

import type { AgentRunContext, AgentRunInput } from "./types.js";
import { appendSystemSection } from "./runtime-helpers.js";

export interface AttachmentHint {
  readonly name: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly description?: string;
  /** Opaque reference id (e.g. ContextReferenceStore id) for tools that expand on demand. */
  readonly ref?: string;
}

export function parseAttachmentsFromMetadata(metadata: unknown): readonly AttachmentHint[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const raw = (metadata as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AttachmentHint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name.length === 0) {
      continue;
    }
    out.push({
      ...(typeof record.description === "string" && record.description.trim().length > 0
        ? { description: record.description.trim() }
        : {}),
      ...(typeof record.mimeType === "string" && record.mimeType.trim().length > 0
        ? { mimeType: record.mimeType.trim() }
        : {}),
      name,
      ...(typeof record.ref === "string" && record.ref.trim().length > 0 ? { ref: record.ref.trim() } : {}),
      ...(typeof record.size === "number" && Number.isFinite(record.size) && record.size >= 0
        ? { size: record.size }
        : {})
    });
  }
  return out;
}

export function renderAttachmentSection(attachments: readonly AttachmentHint[]): string | undefined {
  if (attachments.length === 0) {
    return undefined;
  }
  const lines: string[] = ["[Attached Files]"];
  lines.push("Files the user attached to this turn. Treat as primary source material when relevant.");
  for (const entry of attachments.slice(0, 16)) {
    const parts: string[] = [entry.name];
    if (entry.mimeType) {
      parts.push(entry.mimeType);
    }
    if (entry.size !== undefined) {
      parts.push(formatSize(entry.size));
    }
    if (entry.ref) {
      parts.push(`ref=${entry.ref}`);
    }
    const header = `- ${parts.join(" · ")}`;
    if (entry.description) {
      lines.push(`${header}\n    ${entry.description}`);
    } else {
      lines.push(header);
    }
  }
  return lines.join("\n");
}

export function applyAttachmentContext(context: AgentRunContext): AgentRunInput {
  const attachments = parseAttachmentsFromMetadata(context.input.metadata);
  const rendered = renderAttachmentSection(attachments);
  if (!rendered) {
    return context.input;
  }
  return {
    ...context.input,
    messages: appendSystemSection(context.input.messages, rendered, "attachment-context"),
    metadata: {
      ...context.input.metadata,
      attachmentContextApplied: true,
      attachmentContextCount: attachments.length
    }
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toString()}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
