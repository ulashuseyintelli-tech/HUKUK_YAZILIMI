// Error Logs "Humanized Display + Remediation Guide" — SAF presentation katmanı.
// Teknik ErrorLog kaydını kullanıcı + destek ekibi için anlaşılır Türkçe gösterime çevirir:
// başlık · özet · muhtemel etki · kullanıcı aksiyonu · teknik ekip çözüm notu.
// KURAL: saklanan ham veri (message/stack/metadata/level/source) DEĞİŞMEZ; yalnız EKRANDA
// gösterilen dil değişir. Tanınmayan kod → fallback. Ham teknik mesaj ASLA kaybolmaz.
import type { ErrorLogRecord } from "@/lib/api";

export interface ErrorLogPresentation {
  levelLabel: string;
  sourceLabel: string;
  title: string;
  summary: string;
  impact: string;
  userAction: string[];
  technicalAction: string[];
  technicalMessage: string;
  technicalCode: string;
  endpointLabel: string;
}

const LEVEL_LABELS: Record<string, string> = {
  ERROR: "Hata",
  WARN: "Uyarı",
  INFO: "Bilgi",
  DEBUG: "Teknik",
};

const SOURCE_LABELS: Record<string, string> = {
  FRONTEND: "Arayüz",
  API: "Sunucu",
  UYAP: "UYAP",
  CRON: "Zamanlanmış Görev",
  OUTBOX: "Arka Plan Kuyruğu",
};

interface CodeEntry {
  title: string;
  summary: string;
  impact: string;
  userAction: string[];
  technicalAction: string[];
}

// Yalnız kodda GERÇEKTEN üretilen safeErrorCode'lar (recon ile doğrulandı):
// UNHANDLED_REJECTION·WINDOW_ERROR (GlobalErrorHandlers), NETWORK_ERROR (api.ts+client.ts),
// REACT_RENDER_CRASH (ErrorBoundary). Varsayım yok.
const CODE_MAP: Record<string, CodeEntry> = {
  UNHANDLED_REJECTION: {
    title: "Arayüz İşlem Hatası",
    summary: "Sayfada çalışan bir arka plan işlemi beklenmedik şekilde tamamlanamadı.",
    impact: "Bu sayfadaki bazı bilgiler yüklenmemiş olabilir veya işlem tamamlanmamış olabilir.",
    userAction: [
      "Sayfayı yenileyin.",
      "Aynı işlemi tekrar deneyin.",
      "Hata tekrar ederse işlem kimliğini teknik ekibe iletin.",
    ],
    technicalAction: [
      "İlgili route üzerindeki async işlemleri kontrol edin.",
      "Yakalanmamış Promise rejection kaynaklarını inceleyin.",
      "React Query, fetch veya mutation hata yönetimini kontrol edin.",
      "Abort/cancel edilen istekler gerçek hata gibi loglanıyorsa filtreleyin.",
    ],
  },
  WINDOW_ERROR: {
    title: "Sayfa Çalışma Hatası",
    summary: "Arayüzde beklenmeyen bir çalışma zamanı hatası oluştu.",
    impact: "Sayfanın bir bölümü düzgün çalışmamış olabilir.",
    userAction: [
      "Sayfayı yenileyin.",
      "İşlemi tekrar deneyin.",
      "Hata tekrar ederse işlem kimliğini teknik ekibe iletin.",
    ],
    technicalAction: [
      "İlgili component ve route üzerindeki runtime error kaynaklarını kontrol edin.",
      "ErrorBoundary tarafından yakalanan stack/component stack bilgisini inceleyin.",
      "Hatanın aynı route üzerinde tekrar edip etmediğini kontrol edin.",
    ],
  },
  REACT_RENDER_CRASH: {
    title: "Ekran Görüntüleme Hatası",
    summary: "Sayfanın bir bölümü ekrana çizilirken beklenmeyen bir hatayla durdu.",
    impact: "Sayfanın bir kısmı görüntülenememiş olabilir.",
    userAction: [
      "Sayfayı yenileyin.",
      "İşlemi tekrar deneyin.",
      "Hata tekrar ederse işlem kimliğini teknik ekibe iletin.",
    ],
    technicalAction: [
      "ErrorBoundary'nin yakaladığı component stack bilgisini inceleyin.",
      "İlgili component'in render sırasında fırlattığı hatayı kontrol edin.",
      "null/undefined veri erişimi veya eksik prop kontrolü yapın.",
    ],
  },
  NETWORK_ERROR: {
    title: "Bağlantı Hatası",
    summary: "Tarayıcı sunucuya ulaşamadı veya bağlantı yarıda kesildi.",
    impact: "Veriler yüklenmemiş veya işlem tamamlanmamış olabilir.",
    userAction: [
      "İnternet bağlantısını kontrol edin.",
      "Sayfayı yenileyin.",
      "İşlemi tekrar deneyin.",
    ],
    technicalAction: [
      "API servisinin çalıştığını kontrol edin.",
      "İlgili endpoint erişilebilirliğini kontrol edin.",
      "CORS, network timeout veya server restart kaynaklarını inceleyin.",
    ],
  },
};

const FALLBACK: CodeEntry = {
  title: "Beklenmeyen Sistem Hatası",
  summary: "Sistem beklenmeyen bir hata kaydetti.",
  impact: "İşlem tamamlanmamış olabilir.",
  userAction: [
    "İşlemi tekrar deneyin.",
    "Hata tekrar ederse işlem kimliğini teknik ekibe iletin.",
  ],
  technicalAction: [
    "Raw teknik mesajı, stack bilgisini ve metadata alanlarını inceleyin.",
    "Aynı hatanın tekrar edip etmediğini occurrenceCount üzerinden kontrol edin.",
  ],
};

function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level;
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? "Bilinmeyen Kaynak";
}

// Endpoint öneki (web:rejection/web:window) türkçeleşir; yol/path AYNEN korunur. Diğerleri ham.
function endpointLabel(endpoint?: string | null): string {
  if (!endpoint) return "";
  if (endpoint.startsWith("web:rejection")) {
    return endpoint.replace("web:rejection", "Arayüz: yakalanmamış işlem");
  }
  if (endpoint.startsWith("web:window")) {
    return endpoint.replace("web:window", "Arayüz: sayfa hatası");
  }
  return endpoint;
}

function safeErrorCodeOf(log: ErrorLogRecord): string | undefined {
  const md = log.metadata;
  if (md && typeof md === "object") {
    const code = (md as Record<string, unknown>).safeErrorCode;
    if (typeof code === "string" && code) return code;
  }
  return undefined;
}

export function getErrorLogPresentation(log: ErrorLogRecord): ErrorLogPresentation {
  const code = safeErrorCodeOf(log);
  const entry = (code && CODE_MAP[code]) || FALLBACK;
  return {
    levelLabel: levelLabel(log.level),
    sourceLabel: sourceLabel(log.source),
    title: entry.title,
    summary: entry.summary,
    impact: entry.impact,
    userAction: entry.userAction,
    technicalAction: entry.technicalAction,
    // Ham teknik mesaj ASLA kaybolmaz — teknik bölümde gösterilir.
    technicalMessage: log.message,
    technicalCode: code ?? "—",
    endpointLabel: endpointLabel(log.endpoint),
  };
}
