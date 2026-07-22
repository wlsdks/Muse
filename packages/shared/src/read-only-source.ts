import { promises as fs } from "node:fs";

export type ReadOnlySourceFailure = {
  readonly result: "absent" | "corrupt" | "unreadable";
  readonly errorCode: "missing" | "invalid-json" | "invalid-schema" | "permission-denied" | "io-error";
};

export type ReadOnlySourceInspection<T> =
  | { readonly result: "available"; readonly value: T }
  | ReadOnlySourceFailure;

function ioFailure(cause: unknown): ReadOnlySourceFailure {
  const code = cause && typeof cause === "object" ? (cause as { readonly code?: unknown }).code : undefined;
  if (code === "ENOENT") return { errorCode: "missing", result: "absent" };
  if (code === "EACCES" || code === "EPERM") return { errorCode: "permission-denied", result: "unreadable" };
  return { errorCode: "io-error", result: "unreadable" };
}

/** Read and validate JSON without quarantine, repair, rename, chmod, or any other write. */
export async function inspectReadOnlyJsonSource<T>(
  file: string,
  parse: (value: unknown) => T | undefined
): Promise<ReadOnlySourceInspection<T>> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (cause) {
    return ioFailure(cause);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    return { errorCode: "invalid-json", result: "corrupt" };
  }
  let value: T | undefined;
  try {
    value = parse(decoded);
  } catch {
    return { errorCode: "invalid-schema", result: "corrupt" };
  }
  return value === undefined
    ? { errorCode: "invalid-schema", result: "corrupt" }
    : { result: "available", value };
}
