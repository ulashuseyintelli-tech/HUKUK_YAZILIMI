// PR-4: Frontend error reporter. SADECE client-side crash / global runtime / unhandledrejection /
// GERÇEK network failure raporlar. HTTP response hataları (4xx/5xx) RAPORLANMAZ → backend PR-2a
// ExceptionFilter zaten loglar (duplicate önlenir).
//
// Davranış sözleşmesi: best-effort · fire-and-forget · swallow · no retry · no throw ·
// token yoksa skip · server'da no-op · /error-logs/log'un kendi hatasını raporlama (loop guard) ·
// rate-limit + session dedupe · payload cap · PII taşıyan body/query value YOK.
//
// KRİTİK: RAW fetch kullanır (api client DEĞİL) → reporter/interceptor loop önlenir.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const LOG_PATH = "/error-logs/log";

const MESSAGE_MAX = 500;
const STACK_MAX = 8000;
const ENDPOINT_MAX = 300;
const DEDUPE_WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 20;
const SEEN_MAX = 200;

export type ClientLevel = "ERROR" | "WARN";

export interface ClientErrorReport {
  level?: ClientLevel;
  message: string;
  stack?: string;
  endpoint?: string;
  metadata?: Record<string, unknown>;
}

// Backend whitelist ile birebir. React component stack BURAYA değil, stack alanına eklenir.
const METADATA_WHITELIST = [
  "route",
  "method",
  "statusCode",
  "requestId",
  "queryKeys",
  "paramKeys",
  "bodyKeys",
  "safeErrorCode",
  "durationMs",
  "retryCount",
  "externalStatusCode",
] as const;

const seen = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

/** test-only: modül-içi rate-limit/dedupe durumunu sıfırla. */
export function __resetReporterStateForTest(): void {
  seen.clear();
  windowStart = 0;
  windowCount = 0;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("token");
  } catch {
    return null;
  }
}

function cap(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function pickMetadata(md?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!md) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of METADATA_WHITELIST) {
    const v = md[k];
    if (v != null) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function fingerprint(i: ClientErrorReport): string {
  return [
    i.level ?? "ERROR",
    (i.message || "").slice(0, 120),
    (i.stack || "").split("\n")[0] ?? "",
    i.endpoint ?? "",
  ].join("|");
}

/** Gerçek ağ hatası mı? HTTP response geldiyse (err.status set) → false (backend loglar). */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.status != null) return false; // HTTP yanıtı var → network DEĞİL
  const name = String(err.name ?? "");
  const msg = String(err.message ?? "");
  if (name === "AbortError") return false; // abort → raporlama (kullanıcı/timeout ayrımı belirsiz)
  return (
    (name === "TypeError" && /failed to fetch|networkerror|load failed/i.test(msg)) ||
    /ECONNREFUSED|ERR_NETWORK|ERR_CONNECTION|NetworkError|Failed to fetch/i.test(msg)
  );
}

function isLogEndpoint(endpoint: string | undefined): boolean {
  return !!endpoint && endpoint.includes(LOG_PATH);
}

/** Network hook kararı: self-skip (loop) + yalnız gerçek ağ hatası. */
export function shouldReportNetworkError(err: any, endpoint: string | undefined): boolean {
  if (isLogEndpoint(endpoint)) return false;
  return isNetworkError(err);
}

/** best-effort; ASLA throw etmez, ASLA api client kullanmaz. */
export function reportClientError(input: ClientErrorReport): void {
  try {
    if (typeof window === "undefined") return; // SSR no-op
    const token = getToken();
    if (!token) return; // auth yoksa skip → 401 loop önle

    const t = Date.now();
    if (t - windowStart > DEDUPE_WINDOW_MS) {
      windowStart = t;
      windowCount = 0;
    }
    if (windowCount >= MAX_PER_WINDOW) return; // rate-limit

    const fp = fingerprint(input);
    const last = seen.get(fp);
    if (last !== undefined && t - last < DEDUPE_WINDOW_MS) return; // session dedupe
    if (seen.size >= SEEN_MAX) seen.clear();
    seen.set(fp, t);
    windowCount++;

    const body = {
      level: input.level === "WARN" ? "WARN" : "ERROR",
      message: cap(input.message, MESSAGE_MAX) || "(no message)",
      stack: cap(input.stack, STACK_MAX),
      endpoint: cap(input.endpoint, ENDPOINT_MAX),
      metadata: pickMetadata(input.metadata),
    };

    void fetch(`${API_URL}/api${LOG_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).catch(() => undefined); // kendi hatasını SWALLOW → loop yok
  } catch {
    // ASLA throw etme.
  }
}
