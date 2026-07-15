/**
 * CLI i18n foundation (E4a): a flat EN/KO string catalog + a sync `t()`
 * lookup, mirroring `apps/web/src/i18n/strings.ts`'s pattern for the
 * terminal surface. Unlike the web (React state, per-render), the CLI
 * resolves its language ONCE per process (env > config > OS locale) via
 * `resolveCliLanguage`, caches it in a module-level variable, and every
 * subsequent `t()` call reads that cache synchronously — a prompt or
 * error-formatter never needs to be async just to translate a string.
 */

export type Lang = "en" | "ko";

const en = {
  "email.method.prompt": "How do you want to connect email?",
  "email.method.appPassword.label": "App Password (recommended)",
  "email.method.appPassword.hint": "2 minutes, Gmail or any other IMAP provider — no Google Cloud project",
  "email.method.oauth.label": "Google OAuth",
  "email.method.oauth.hint": "existing flow — needs a Google Cloud project + OAuth client",
  "email.setupCancelled": "Setup cancelled.",

  "email.gmail.appPasswordStep": "Opening the app-password page pinned to {email} (paste the 16 characters at the next step).\n  {appPasswordUrl}\nIf 2-Step Verification isn't on yet, enable it first:\n  {twoStepUrl}\n",
  "email.gmail.openBrowserConfirm": "Open the app-password page in your browser now?",
  "email.koWebmail.note": "{label}: in that provider's mail security settings, turn on IMAP access, enable 2-step verification, then generate an app password.",

  "email.prompt.email": "Email address:",
  "email.prompt.email.required": "Email is required",
  "email.prompt.email.invalidFormat": "That doesn't look like a valid email address",
  "email.prompt.appPassword": "App password (spaces are fine — they're stripped):",
  "email.prompt.appPassword.required": "App password is required",
  "email.prompt.host": "{label} host (leave blank to use the provider default):",

  "email.appPassword.connected": "✓ connected — inbox has {count} message(s)",
  "email.appPassword.verifyFailed": "muse setup email: could not connect — {detail}",

  "email.oauth.walkthrough": "Gmail setup — one-time browser consent, then it refreshes itself forever.\n\n  1. Open https://console.cloud.google.com/apis/library/gmail.googleapis.com\n     (create a project first if you don't have one) and click \"Enable\".\n  2. Open the Google Auth Platform: https://console.cloud.google.com/auth/overview\n     First time: click \"Get started\" and fill in the app name + your email\n     (this is the consent-screen \"Branding\" step). Choose \"External\".\n  3. Add yourself as a test user:\n     https://console.cloud.google.com/auth/audience → \"Test users\" → + Add users.\n  4. Create the client: https://console.cloud.google.com/auth/clients\n     \"+ Create client\" → Application type \"Desktop app\".\n  5. EASIEST: click ⬇ in the creation dialog to download the\n     client_secret_*.json and paste that file's PATH below — Muse reads the\n     ID + secret from it, so nothing can be mis-pasted or mismatched.\n     (Or copy the Client ID and Client Secret by hand as before.)\n\n  ⚠️  Google shows the Client Secret ONLY ONCE, in that creation dialog.\n      If you closed it, create a new client — the secret is not viewable later.\n  ⚠️  While the app's publishing status is \"Testing\", Google expires your\n      refresh token every 7 days (you'll re-run this wizard weekly). Publish\n      to \"Production\" on https://console.cloud.google.com/auth/audience to\n      avoid that — for personal use no verification review is needed.\n",
  "email.oauth.prompt.clientId": "Google OAuth Client ID (or path to the downloaded client_secret_*.json):",
  "email.oauth.prompt.clientSecret": "Google OAuth Client Secret:",
  "email.oauth.jsonRead.ok": "✓ Desktop-app client credentials read from the JSON",
  "email.oauth.jsonRead.fail": "muse setup email: could not read {path}",
  "email.oauth.jsonParse.fail": "muse setup email: could not use that JSON — {reason}",
  "email.oauth.authUrl": "Open this URL to authorize Gmail access:\n  {url}\n\nWaiting for the browser redirect on {redirectUri} ...",
  "email.oauth.connected": "✓ Gmail connected — the access token now refreshes itself automatically.",
  "email.oauth.connectedAs": "✓ connected as {email}",
  "email.oauth.verifySoftFail": "(saved, but couldn't verify with a live Gmail profile read — try `muse inbox` or `muse doctor` to confirm.)",
  "email.oauth.authFailed": "muse setup email: authorization failed — {reason}",

  "email.authError.appPasswordRequired": "You typed your regular Google sign-in password — this account needs a 16-character app password instead.",
  "email.authError.invalidCredentials": "Google rejected that app password — check it was created for this account and that it was pasted without extra spaces.",
  "email.authError.webLoginBlock": "Google is blocking this sign-in as a security precaution (not a wrong password) — open https://accounts.google.com/DisplayUnlockCaptcha, click Continue, then retry within a few minutes.",
  "email.authError.appPasswordUrlHint": "Create an app password here: {url}",
  "email.authError.serverDetail": "(server said: \"{detail}\")",

  "setup.status.language": "{lang} (via {source})"
} as const;

export type CliStringKey = keyof typeof en;
type CliStrings = Record<CliStringKey, string>;

const ko: CliStrings = {
  "email.method.prompt": "이메일을 어떻게 연결할까요?",
  "email.method.appPassword.label": "앱 비밀번호 (추천)",
  "email.method.appPassword.hint": "2분이면 끝 — Gmail이나 다른 IMAP 제공자, Google Cloud 프로젝트 불필요",
  "email.method.oauth.label": "구글 OAuth",
  "email.method.oauth.hint": "기존 방식 — Google Cloud 프로젝트 + OAuth 클라이언트가 필요해요",
  "email.setupCancelled": "설정이 취소됐어요.",

  "email.gmail.appPasswordStep": "{email} 계정으로 고정된 앱 비밀번호 생성 페이지를 엽니다 (16자리 비밀번호를 다음 단계에서 붙여넣으세요).\n  {appPasswordUrl}\n2단계 인증이 꺼져 있다면 먼저 켜세요:\n  {twoStepUrl}\n",
  "email.gmail.openBrowserConfirm": "지금 브라우저에서 앱 비밀번호 페이지를 열까요?",
  "email.koWebmail.note": "{label}: 메일 설정에서 IMAP 사용을 켜고, 2단계 인증을 켠 뒤 앱 비밀번호를 발급하세요.",

  "email.prompt.email": "이메일 주소:",
  "email.prompt.email.required": "이메일을 입력해 주세요",
  "email.prompt.email.invalidFormat": "올바른 이메일 주소가 아니에요",
  "email.prompt.appPassword": "앱 비밀번호 (공백은 자동으로 제거돼요):",
  "email.prompt.appPassword.required": "앱 비밀번호를 입력해 주세요",
  "email.prompt.host": "{label} 호스트 (비워두면 제공자 기본값 사용):",

  "email.appPassword.connected": "✓ 연결됨 — 받은편지함에 메시지 {count}개",
  "email.appPassword.verifyFailed": "muse setup email: 연결할 수 없어요 — {detail}",

  "email.oauth.walkthrough": "Gmail 설정 — 브라우저 동의는 한 번만, 이후로는 자동으로 갱신돼요.\n\n  1. https://console.cloud.google.com/apis/library/gmail.googleapis.com 을 열고\n     (프로젝트가 없다면 먼저 만드세요) \"Enable\"을 클릭하세요.\n  2. Google Auth Platform을 여세요: https://console.cloud.google.com/auth/overview\n     처음이라면 \"Get started\"를 클릭하고 앱 이름 + 이메일을 입력하세요\n     (동의 화면의 \"Branding\" 단계예요). \"External\"을 선택하세요.\n  3. 테스트 사용자로 본인을 추가하세요:\n     https://console.cloud.google.com/auth/audience → \"Test users\" → + Add users.\n  4. 클라이언트를 생성하세요: https://console.cloud.google.com/auth/clients\n     \"+ Create client\" → Application type \"Desktop app\".\n  5. 가장 쉬운 방법: 생성 대화상자에서 ⬇를 클릭해\n     client_secret_*.json을 내려받고, 그 파일의 경로를 아래에 붙여넣으세요 — 뮤즈가\n     ID + 비밀키를 파일에서 직접 읽으므로 잘못 붙여넣거나 섞일 일이 없어요.\n     (또는 예전처럼 Client ID와 Client Secret을 직접 복사해도 됩니다.)\n\n  ⚠️  구글은 Client Secret을 그 생성 대화상자에서 딱 한 번만 보여줘요.\n      닫아버렸다면 새 클라이언트를 만드세요 — 나중에는 다시 볼 수 없어요.\n  ⚠️  앱의 게시 상태가 \"Testing\"인 동안은 구글이 refresh token을 7일마다\n      만료시켜요 (이 마법사를 매주 다시 실행해야 해요). 개인용이라면 심사 없이\n      https://console.cloud.google.com/auth/audience 에서 \"Production\"으로\n      게시해서 이를 피할 수 있어요.\n",
  "email.oauth.prompt.clientId": "구글 OAuth Client ID (또는 내려받은 client_secret_*.json 파일 경로):",
  "email.oauth.prompt.clientSecret": "구글 OAuth Client Secret:",
  "email.oauth.jsonRead.ok": "✓ Desktop-app 클라이언트 자격증명을 JSON에서 읽었어요",
  "email.oauth.jsonRead.fail": "muse setup email: {path}을(를) 읽을 수 없어요",
  "email.oauth.jsonParse.fail": "muse setup email: 그 JSON을 쓸 수 없어요 — {reason}",
  "email.oauth.authUrl": "이 URL을 열어 Gmail 접근을 승인하세요:\n  {url}\n\n{redirectUri}로의 브라우저 리디렉션을 기다리는 중...",
  "email.oauth.connected": "✓ Gmail 연결됨 — 액세스 토큰이 이제 자동으로 갱신됩니다.",
  "email.oauth.connectedAs": "✓ {email}(으)로 연결됨",
  "email.oauth.verifySoftFail": "(저장은 됐지만 실제 Gmail 프로필로 검증하지는 못했어요 — `muse inbox` 또는 `muse doctor`로 확인해 보세요.)",
  "email.oauth.authFailed": "muse setup email: 인증 실패 — {reason}",

  "email.authError.appPasswordRequired": "일반 로그인 비밀번호를 입력하셨어요 — 이 계정은 16자리 앱 비밀번호가 필요해요.",
  "email.authError.invalidCredentials": "구글이 그 앱 비밀번호를 거부했어요 — 이 계정용으로 만든 비밀번호가 맞는지, 공백 없이 붙여넣었는지 확인하세요.",
  "email.authError.webLoginBlock": "구글이 보안상의 이유로 이 로그인을 막고 있어요 (비밀번호가 틀린 게 아니에요) — https://accounts.google.com/DisplayUnlockCaptcha 를 열어 Continue를 클릭한 뒤, 몇 분 안에 다시 시도하세요.",
  "email.authError.appPasswordUrlHint": "여기서 앱 비밀번호를 만드세요: {url}",
  "email.authError.serverDetail": "(서버 응답: \"{detail}\")",

  "setup.status.language": "{lang} ({source} 기준)"
};

export const CLI_DICTIONARIES: Record<Lang, CliStrings> = { en, ko };

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => (name in params ? String(params[name]) : match));
}

let currentLang: Lang = "en";

/** Direct setter — the real CLI startup calls this once via `resolveCliLanguage`; a test that wants a deterministic language without touching the async resolution path calls it directly. */
export function setCliLanguage(lang: Lang): void {
  currentLang = lang;
}

export function getCliLanguage(): Lang {
  return currentLang;
}

/** Sync lookup: missing key in the active language falls back to EN, then (never throwing, never printing "undefined") to the raw key itself. */
export function t(key: CliStringKey, params?: Record<string, string | number>): string {
  const template = CLI_DICTIONARIES[currentLang][key] ?? CLI_DICTIONARIES.en[key] ?? key;
  return fill(template, params);
}

function normalizeLang(value: string | undefined): Lang | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === "ko" || trimmed === "en" ? trimmed : undefined;
}

/** LANG/LC_ALL/LC_MESSAGES, in that precedence — a Korean-family locale (`ko`, `ko_KR.UTF-8`, …) resolves to `ko`; everything else (including unset) resolves to `en`. */
export function detectLangFromLocale(env: Readonly<Record<string, string | undefined>>): Lang {
  const locale = env.LANG ?? env.LC_ALL ?? env.LC_MESSAGES ?? "";
  return locale.trim().toLowerCase().startsWith("ko") ? "ko" : "en";
}

let cachedResolution: Lang | undefined;

/** Test seam — clears the per-process cache so a test can resolve again under different env/config inputs. */
export function resetCliLanguageCache(): void {
  cachedResolution = undefined;
}

/**
 * Resolution order (AC1): `MUSE_LANG` env > `language` config key > OS
 * locale auto-detect, defaulting to `en`. Resolved once per process and
 * cached — `configRead` (typically `() => readConfigStore(io)`) is only
 * ever awaited on the FIRST call; every call after that returns the
 * cached language synchronously-fast (still a Promise, but no I/O) and
 * `t()` itself stays a plain sync function reading the same cache.
 */
export async function resolveCliLanguage(
  env: Readonly<Record<string, string | undefined>>,
  configRead: () => Promise<{ readonly language?: string }>
): Promise<Lang> {
  // Keep `t()`'s active language in sync even on the cached fast-path — a
  // direct `setCliLanguage` call elsewhere in the process (e.g. a test)
  // must not leave `currentLang` out of step with what this resolver says
  // it resolved to.
  if (cachedResolution) {
    currentLang = cachedResolution;
    return cachedResolution;
  }
  const fromEnv = normalizeLang(env.MUSE_LANG);
  const resolved = fromEnv ?? normalizeLang((await configRead()).language) ?? detectLangFromLocale(env);
  cachedResolution = resolved;
  currentLang = resolved;
  return resolved;
}
