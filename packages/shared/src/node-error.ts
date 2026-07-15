/**
 * Shared runtime guard for Node.js-style errors (for example
 * `fs/promises.readFile` failures). This keeps Node error-code handling
 * consistent across runtime and CLI modules while avoiding repeated
 * structural casts.
 *
 * `code` check is the single stable discriminator across Node versions
 * and transport layers in this codebase.
 */
export const NODE_ERROR_CODES = {
  ENOENT: "ENOENT",
  EACCES: "EACCES",
  EEXIST: "EEXIST",
  ELOOP: "ELOOP",
  EISDIR: "EISDIR",
  EPERM: "EPERM",
  EBUSY: "EBUSY"
} as const;

export type NodeErrorCode = (typeof NODE_ERROR_CODES)[keyof typeof NODE_ERROR_CODES];

export function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "code") === "string";
}

export function isNodeErrorCode(value: unknown, code: NodeErrorCode): value is NodeJS.ErrnoException {
  return isNodeError(value) && value.code === code;
}

export function hasNodeErrorCodeIn(value: unknown, ...codes: readonly NodeErrorCode[]): value is NodeJS.ErrnoException {
  if (!isNodeError(value)) return false;
  for (const code of codes) {
    if (value.code === code) return true;
  }
  return false;
}
