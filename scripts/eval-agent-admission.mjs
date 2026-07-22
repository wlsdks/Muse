import { availableParallelism, freemem, loadavg } from "node:os";

const MEBIBYTE = 1024 * 1024;

export const CAPABILITY_ADMISSION_VERSION = 1;
export const CAPABILITY_MIN_FREE_MEMORY_MB = 2048;
export const CAPABILITY_MAX_LOAD_PER_CORE = 0.5;

/** Lightweight, local-only counters for deciding whether a costly evaluation may start. */
export function readCapabilityResourceSnapshot() {
  return {
    cpuCount: availableParallelism(),
    freeMemoryBytes: freemem(),
    load1: loadavg()[0] ?? Number.NaN,
  };
}

export function parseCapabilityExecutionRequest(args) {
  const budgetFlag = "--budget-minutes";
  const budgetIndex = args.indexOf(budgetFlag);
  const rawBudget = budgetIndex === -1 ? undefined : args[budgetIndex + 1];
  const duplicateBudget = args.filter((arg) => arg === budgetFlag).length > 1;
  const budgetMinutes = rawBudget === undefined ? undefined : Number(rawBudget);
  return {
    executionRequested: args.includes("--execute") || args.includes("--admit"),
    idleConfirmed: args.includes("--confirm-idle"),
    budgetMinutes: Number.isSafeInteger(budgetMinutes)
      ? budgetMinutes
      : undefined,
    invalidBudget: rawBudget !== undefined && !Number.isSafeInteger(budgetMinutes),
    duplicateBudget,
  };
}

function validSnapshot(snapshot) {
  return Number.isFinite(snapshot?.cpuCount) && snapshot.cpuCount >= 1
    && Number.isFinite(snapshot?.freeMemoryBytes) && snapshot.freeMemoryBytes >= 0
    && Number.isFinite(snapshot?.load1) && snapshot.load1 >= 0;
}

/**
 * Fail closed before a multi-hour local evaluation. Unlike the background
 * daemon, an unavailable OS counter is not allowed to start a model-heavy
 * foreground qualification run.
 */
export function createCapabilityExecutionAdmission({
  matrixId,
  requiredBudgetMinutes,
  request,
  snapshot,
}) {
  const reasons = [];
  if (!request.executionRequested) reasons.push("execution-intent-required");
  if (!request.idleConfirmed) reasons.push("owner-idle-confirmation-required");
  if (request.duplicateBudget || request.invalidBudget) reasons.push("invalid-owner-budget");
  else if (request.budgetMinutes === undefined) reasons.push("owner-budget-required");
  else if (request.budgetMinutes < requiredBudgetMinutes) reasons.push("insufficient-time-budget");

  if (!validSnapshot(snapshot)) {
    reasons.push("resource-observation-unavailable");
  } else {
    if (snapshot.freeMemoryBytes < CAPABILITY_MIN_FREE_MEMORY_MB * MEBIBYTE) reasons.push("low-free-memory");
    if (snapshot.load1 >= snapshot.cpuCount * CAPABILITY_MAX_LOAD_PER_CORE) reasons.push("cpu-load");
  }

  const observed = validSnapshot(snapshot)
    ? {
        cpuCount: snapshot.cpuCount,
        freeMemoryMb: Math.floor(snapshot.freeMemoryBytes / MEBIBYTE),
        load1: Number(snapshot.load1.toFixed(2)),
      }
    : "unavailable";
  return {
    version: CAPABILITY_ADMISSION_VERSION,
    matrixId,
    mode: "execution-admission",
    sideEffects: "none",
    status: reasons.length === 0 ? "admit" : "defer",
    reasons,
    requiredBudgetMinutes,
    owner: {
      idleConfirmed: request.idleConfirmed,
      ...(request.budgetMinutes === undefined ? {} : { budgetMinutes: request.budgetMinutes }),
    },
    resourcePolicy: {
      maxLoadPerCore: CAPABILITY_MAX_LOAD_PER_CORE,
      minFreeMemoryMb: CAPABILITY_MIN_FREE_MEMORY_MB,
    },
    observed,
  };
}

export function describeCapabilityExecutionAdmission(admission) {
  if (admission.status === "admit") {
    return "admitted — owner confirmed idle; " + admission.owner.budgetMinutes.toString()
      + " min budget covers the " + admission.requiredBudgetMinutes.toString()
      + " min worst-case plan; " + admission.observed.freeMemoryMb.toString()
      + " MiB free, load " + admission.observed.load1.toFixed(2)
      + "/" + admission.observed.cpuCount.toString() + " cores";
  }
  return "deferred — " + admission.reasons.join(", ");
}
