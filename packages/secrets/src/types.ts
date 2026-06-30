/**
 * A logical handle to a secret — never the value itself. The resolver maps a
 * ref to a real value on demand from a local source; the ref is what flows
 * through Muse's code (safe to log).
 */
export interface SecretRef {
  /** Logical name, e.g. "telegram-bot-token". Used for the redaction mask + scope check. */
  readonly name: string;
  /** Optional service/account qualifier the adapter uses to locate the item (e.g. "muse-calendar"). */
  readonly service?: string;
}

/**
 * A read-only reader of ONE local vault. `get` returns the secret value or
 * `undefined` when this source doesn't hold it (⇒ the resolver tries the next
 * source). A source MUST be `local: true` to be queried — the resolver refuses
 * a non-local source so a secret can't egress to a cloud vault API.
 */
export interface SecretSource {
  readonly id: string;
  readonly local: boolean;
  get(ref: SecretRef): Promise<string | undefined>;
}
