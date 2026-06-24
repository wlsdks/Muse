/**
 * TX-11 — classify a failed `run_command` result into a stable KIND so the
 * model reads "why" (permission, not_found, timeout, network, …) instead of
 * staring at a raw stderr blob. On a small local model a one-word category
 * is the difference between a useful next step (fix the path / retry the
 * network call) and a blind repeat. Deterministic keyword match on
 * stderr/error; a SUCCESSFUL result classifies to `undefined` (no noise on
 * the happy path).
 */

export type RunnerFailureKind =
  | "permission"
  | "not_found"
  | "timeout"
  | "network"
  | "out_of_memory"
  | "generic";

export interface RunnerFailureSignal {
  readonly status: number | null;
  readonly stderr: string;
  readonly timedOut?: boolean;
  readonly error?: string | null;
}

export function classifyRunnerFailure(signal: RunnerFailureSignal): RunnerFailureKind | undefined {
  const failed = signal.timedOut === true || Boolean(signal.error) || (signal.status !== 0 && signal.status !== null);
  if (!failed) {
    return undefined;
  }
  if (signal.timedOut === true) {
    return "timeout";
  }
  const text = `${signal.stderr} ${signal.error ?? ""}`.toLowerCase();
  if (/permission denied|operation not permitted|\beacces\b|\beperm\b/u.test(text)) {
    return "permission";
  }
  if (/command not found|no such file|\bnot found\b|\benoent\b/u.test(text)) {
    return "not_found";
  }
  if (/timed out|\betimedout\b|\btimeout\b/u.test(text)) {
    return "timeout";
  }
  if (/econnrefused|enotfound|getaddrinfo|could not resolve|network is unreachable|\bdns\b/u.test(text)) {
    return "network";
  }
  if (/out of memory|cannot allocate memory|\boom\b|killed/u.test(text)) {
    return "out_of_memory";
  }
  return "generic";
}
