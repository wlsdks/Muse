export async function serializePerFile<T>(queues: Map<string, Promise<unknown>>, file: string, op: () => Promise<T>): Promise<T> {
  const prior = queues.get(file) ?? Promise.resolve(undefined);
  const next = prior.catch(() => undefined).then(op);
  queues.set(file, next.then(() => undefined).catch(() => undefined));
  return next;
}
