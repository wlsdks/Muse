/**
 * Serialize async operations per key so callers touching the same resource are
 * strictly sequenced, while different keys run independently.
 *
 * The returned promise is always the operation result, including rejections from
 * the scheduled operation. Rejections from prior queued work are absorbed so one
 * failing operation does not block the queue for the same key.
 */
export function serializePerKey<T>(inFlight: Map<string, Promise<unknown>>, key: string, operation: () => Promise<T>): Promise<T> {
  const prior = inFlight.get(key) ?? Promise.resolve();
  const next = (async (): Promise<T> => {
    await prior.catch(() => undefined);
    return operation();
  })();

  inFlight.set(key, next.then(() => undefined).catch(() => undefined));
  return next;
}

