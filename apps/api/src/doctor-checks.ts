/**
 * Deterministic self-diagnosis for the "why is Muse not answering?"
 * class of breakage. Pure: takes observed state, returns checks the
 * web console renders with one-click fixes. No model, no I/O — every
 * verdict must be reproducible from the input snapshot alone.
 */

export type DoctorSeverity = "ok" | "warn" | "error";

export interface DoctorFix {
  /** Allowlisted fix id the POST /api/doctor/fix route accepts. */
  readonly id: string;
  readonly label: string;
}

export interface DoctorCheck {
  readonly id: string;
  readonly severity: DoctorSeverity;
  readonly title: string;
  readonly detail: string;
  readonly fix?: DoctorFix;
}

export interface DoctorFlagSnapshot {
  readonly key: string;
  readonly enabled: boolean;
  readonly running?: boolean;
  readonly lastError?: string;
  readonly lastErrorAtIso?: string;
}

export interface DoctorInput {
  readonly flags: readonly DoctorFlagSnapshot[];
  /** Channel providers live in the messaging registry (i.e. actually connected). */
  readonly connectedChannels: readonly string[];
  /** undefined = probe not attempted (no local model configured). */
  readonly ollamaReachable?: boolean;
  /** Inbox messages the reply daemon has not answered yet. */
  readonly unrepliedCount: number;
  /** Evaluation time — injected so verdicts stay reproducible. */
  readonly nowIso: string;
}

/** lastError never clears on later successful polls, so age-gate it: a
 * multi-instance conflict repeats every long-poll cycle while it is real
 * — an error older than this is a resolved incident, not a live one. */
const ERROR_FRESH_MS = 3 * 60_000;

const isFreshError = (flag: DoctorFlagSnapshot, nowIso: string): boolean => {
  if (!flag.lastErrorAtIso) {
    return true;
  }
  const at = Date.parse(flag.lastErrorAtIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(at) || Number.isNaN(now)) {
    return true;
  }
  return now - at <= ERROR_FRESH_MS;
};

const flagOf = (
  input: DoctorInput,
  key: string
): DoctorFlagSnapshot | undefined => input.flags.find((flag) => flag.key === key);

/** running is the truth when present; the bare flag only says intent. */
const isLive = (flag: DoctorFlagSnapshot | undefined): boolean =>
  flag !== undefined && (flag.running ?? flag.enabled);

export function computeDoctorChecks(input: DoctorInput): readonly DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const telegramConnected = input.connectedChannels.includes("telegram");
  const poll = flagOf(input, "MUSE_TELEGRAM_POLL_ENABLED");
  const reply = flagOf(input, "MUSE_INBOUND_REPLY_ENABLED");

  if (telegramConnected && !isLive(poll)) {
    checks.push({
      detail: "채널은 연결됐지만 수신 데몬이 꺼져 있어 메시지가 아예 도착하지 않습니다.",
      fix: { id: "enable-telegram-poll", label: "수신 켜기" },
      id: "telegram-poll-off",
      severity: "error",
      title: "Telegram 수신이 꺼져 있어요"
    });
  }

  if (telegramConnected && isLive(poll) && !isLive(reply)) {
    const backlog = input.unrepliedCount > 0
      ? ` 답장을 기다리는 메시지가 ${input.unrepliedCount.toString()}개 쌓여 있습니다.`
      : "";
    checks.push({
      detail: `메시지를 읽기만 하고(👀) 답하지 않는 상태입니다 — 답장 데몬이 꺼져 있습니다.${backlog}`,
      fix: { id: "enable-inbound-reply", label: "답장 켜기" },
      id: "inbound-reply-off",
      severity: "error",
      title: "채널 답장이 꺼져 있어요"
    });
  }

  for (const flag of input.flags) {
    if (!flag.lastError || !isFreshError(flag, input.nowIso)) {
      continue;
    }
    if (/conflict/iu.test(flag.lastError)) {
      checks.push({
        detail:
          "같은 봇 토큰을 다른 Muse 서버 인스턴스도 폴링하고 있습니다. 데스크톱 앱을 완전히 종료 후 다시 열면 정리됩니다 (남은 옛 서버 프로세스가 원인).",
        id: `${flag.key}-conflict`,
        severity: "warn",
        title: "봇을 여러 서버가 동시에 받고 있어요"
      });
    } else {
      checks.push({
        detail: flag.lastError,
        id: `${flag.key}-error`,
        severity: "warn",
        title: `데몬 오류 (${flag.key})`
      });
    }
  }

  if (input.ollamaReachable === false) {
    checks.push({
      detail:
        "로컬 모델 서버(Ollama)에 연결할 수 없어 답변 생성이 전부 실패합니다. Ollama 앱을 실행해 주세요.",
      id: "ollama-unreachable",
      severity: "error",
      title: "Ollama가 꺼져 있어요"
    });
  }

  if (checks.length === 0) {
    checks.push({
      detail: "수신·답장 데몬과 로컬 모델이 모두 정상입니다.",
      id: "all-clear",
      severity: "ok",
      title: "모든 진단 통과"
    });
  }

  return checks;
}

/** fix id → daemon flag it enables. The ONLY fixes the route may apply. */
export const DOCTOR_FIXES: Readonly<Record<string, string>> = {
  "enable-inbound-reply": "MUSE_INBOUND_REPLY_ENABLED",
  "enable-telegram-poll": "MUSE_TELEGRAM_POLL_ENABLED"
};
