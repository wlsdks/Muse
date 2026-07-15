import { serializePerKey } from "@muse/shared";

export function serializePerFile<T>(queues: Map<string, Promise<unknown>>, file: string, op: () => Promise<T>): Promise<T> {
  return serializePerKey(queues, file, op);
}
