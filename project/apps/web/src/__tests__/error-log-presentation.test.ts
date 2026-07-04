import { describe, it, expect } from "vitest";
import { getErrorLogPresentation } from "@/lib/error-log-presentation";
import type { ErrorLogRecord } from "@/lib/api";

function log(over: Partial<ErrorLogRecord> = {}): ErrorLogRecord {
  return {
    id: "l1",
    level: "ERROR",
    source: "FRONTEND",
    message: "Unhandled promise rejection",
    isResolved: false,
    createdAt: "2026-06-28T00:00:00Z",
    occurrenceCount: 1,
    ...over,
  } as ErrorLogRecord;
}

describe("getErrorLogPresentation — humanized + remediation", () => {
  it("UNHANDLED_REJECTION → Türkçe başlık/özet/etki/çözüm döner", () => {
    const p = getErrorLogPresentation(log({ metadata: { safeErrorCode: "UNHANDLED_REJECTION" } }));
    expect(p.title).toBe("Arayüz İşlem Hatası");
    expect(p.summary).toMatch(/arka plan işlemi/i);
    expect(p.impact).toMatch(/yüklenmemiş/i);
    expect(p.userAction.length).toBeGreaterThan(0);
    expect(p.userAction[0]).toMatch(/yenile/i);
    expect(p.technicalAction.some((t) => /Promise rejection/i.test(t))).toBe(true);
  });

  it("WINDOW_ERROR → Türkçe başlık/çözüm döner", () => {
    const p = getErrorLogPresentation(log({ metadata: { safeErrorCode: "WINDOW_ERROR" } }));
    expect(p.title).toBe("Sayfa Çalışma Hatası");
    expect(p.technicalAction.some((t) => /runtime error/i.test(t))).toBe(true);
  });

  it("REACT_RENDER_CRASH → Türkçe başlık/çözüm döner (recon ile eklendi)", () => {
    const p = getErrorLogPresentation(log({ metadata: { safeErrorCode: "REACT_RENDER_CRASH" } }));
    expect(p.title).toBe("Ekran Görüntüleme Hatası");
    expect(p.technicalAction.some((t) => /component stack/i.test(t))).toBe(true);
  });

  it("NETWORK_ERROR → Türkçe başlık/çözüm döner", () => {
    const p = getErrorLogPresentation(log({ source: "API", metadata: { safeErrorCode: "NETWORK_ERROR" } }));
    expect(p.title).toBe("Bağlantı Hatası");
    expect(p.userAction.some((u) => u.includes("İnternet"))).toBe(true);
    expect(p.technicalAction.some((t) => /CORS|timeout/i.test(t))).toBe(true);
  });

  it("bilinmeyen safeErrorCode → fallback", () => {
    const p = getErrorLogPresentation(log({ metadata: { safeErrorCode: "WAT_IS_THIS" } }));
    expect(p.title).toBe("Beklenmeyen Sistem Hatası");
    expect(p.technicalCode).toBe("WAT_IS_THIS");
  });

  it("safeErrorCode YOK → fallback ama technicalCode '—'", () => {
    const p = getErrorLogPresentation(log({ metadata: { requestId: "r1" } }));
    expect(p.title).toBe("Beklenmeyen Sistem Hatası");
    expect(p.technicalCode).toBe("—");
  });

  it("level label Türkçeleşir (ERROR→Hata, WARN→Uyarı, DEBUG→Teknik)", () => {
    expect(getErrorLogPresentation(log({ level: "ERROR" })).levelLabel).toBe("Hata");
    expect(getErrorLogPresentation(log({ level: "WARN" })).levelLabel).toBe("Uyarı");
    expect(getErrorLogPresentation(log({ level: "DEBUG" })).levelLabel).toBe("Teknik");
  });

  it("source label Türkçeleşir (FRONTEND→Arayüz, API→Sunucu, unknown→Bilinmeyen Kaynak)", () => {
    expect(getErrorLogPresentation(log({ source: "FRONTEND" })).sourceLabel).toBe("Arayüz");
    expect(getErrorLogPresentation(log({ source: "API" })).sourceLabel).toBe("Sunucu");
    expect(getErrorLogPresentation(log({ source: "CRON" })).sourceLabel).toBe("Zamanlanmış Görev");
    expect(getErrorLogPresentation(log({ source: "WAT" })).sourceLabel).toBe("Bilinmeyen Kaynak");
  });

  it("ham teknik mesaj KAYBOLMAZ (technicalMessage = raw message)", () => {
    const p = getErrorLogPresentation(log({ message: "boom raw detail", metadata: { safeErrorCode: "UNHANDLED_REJECTION" } }));
    expect(p.technicalMessage).toBe("boom raw detail");
  });

  it("endpoint label Türkçeleşir, yol korunur", () => {
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /clients/x/accounting" })).endpointLabel)
      .toBe("Arayüz: yakalanmamış işlem /clients/x/accounting");
    expect(getErrorLogPresentation(log({ endpoint: "web:window /debtors" })).endpointLabel)
      .toBe("Arayüz: sayfa hatası /debtors");
    // tanınmayan endpoint → ham korunur
    expect(getErrorLogPresentation(log({ endpoint: "/api/cases" })).endpointLabel).toBe("/api/cases");
  });

  it("pageLabel: route → okunur Türkçe sayfa adı (cuid/sayısal id normalize)", () => {
    // cuid'li gerçek yol → eşleşir
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /clients/cmqp16a8f000rne1l4p0zjsft/accounting" })).pageLabel)
      .toBe("Müvekkil Muhasebe");
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /cases/cmqpl7tb300021zfni38hq9j8" })).pageLabel)
      .toBe("Takip detayı");
    // sayısal id de normalize olur
    expect(getErrorLogPresentation(log({ endpoint: "web:window /cases/123/edit" })).pageLabel)
      .toBe("Takip düzenleme");
    // id'siz sabit route
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /debtors" })).pageLabel).toBe("Borçlular");
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /settings/error-logs" })).pageLabel).toBe("Hata Logları");
  });

  it("pageLabel: tanınmayan/eksik route → undefined (ham yol UI'da korunur)", () => {
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /bilinmeyen/yol" })).pageLabel).toBeUndefined();
    expect(getErrorLogPresentation(log({ endpoint: "/api/cases" })).pageLabel).toBeUndefined();
    expect(getErrorLogPresentation(log({ endpoint: undefined })).pageLabel).toBeUndefined();
  });

  it("pageLabel: gerçek route kelimesi (notifications=13 harf) yanlışlıkla :id olmaz", () => {
    expect(getErrorLogPresentation(log({ endpoint: "web:rejection /settings/notifications" })).pageLabel)
      .toBe("Bildirim Merkezi");
  });
});
