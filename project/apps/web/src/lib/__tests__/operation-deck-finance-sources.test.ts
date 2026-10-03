import { describe, expect, it } from "vitest";
import {
  deriveFinanceSourceStatus,
  financeSourceContextKey,
  resolveFinanceSourceView,
  type FinanceSourceReadState,
} from "@/lib/operation-deck-finance-sources";

/**
 * OperationDeck "Finans" sekmesinin bağlı kaynakları — durum türetme kuralları.
 *
 * Kural (owner kararı 2026-10-02): ilk okuma tamamlanmadan READY / boş / 0 kabul edilmez; son başarılı veri yalnız AYNI
 * dosya ve AYNI para birimi bağlamında, durumu yazılarak gösterilebilir; başka dosyanın verisi gösterilmez.
 */

const KEY = financeSourceContextKey("case-1", "TRY") as string;
const OTHER_CASE = financeSourceContextKey("case-2", "TRY") as string;
const OTHER_CURRENCY = financeSourceContextKey("case-1", "USD") as string;

const state = (patch: Partial<FinanceSourceReadState>): FinanceSourceReadState => ({
  contextKey: KEY,
  loadedKey: null,
  attemptKey: null,
  loading: false,
  failed: false,
  ...patch,
});

describe("deriveFinanceSourceStatus — ilk okuma", () => {
  it("okuma henüz BAŞLAMADI (bayraklar ilk hâlinde): READY değil, LOADING", () => {
    expect(deriveFinanceSourceStatus(state({}))).toBe("LOADING");
  });

  it("ilk okuma sürüyor: LOADING", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loading: true }))).toBe("LOADING");
  });

  it("ilk okuma düştü: ERROR", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, failed: true }))).toBe("ERROR");
  });

  it("ilk okuma düştü, yeniden deneniyor (eski hata bayrağı dursa da): LOADING", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loading: true, failed: true }))).toBe("LOADING");
  });

  it("ilk okuma başarıyla bitti: READY", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loadedKey: KEY }))).toBe("READY");
  });

  it("bağlam henüz belli değil (dosya yüklenmedi): eldeki hiçbir veri READY sayılmaz", () => {
    expect(deriveFinanceSourceStatus(state({ contextKey: null, attemptKey: KEY, loadedKey: KEY }))).toBe("LOADING");
    expect(deriveFinanceSourceStatus(state({ contextKey: null, attemptKey: null, loadedKey: null, failed: true }))).toBe("LOADING");
  });
});

describe("deriveFinanceSourceStatus — son başarılı veri ekrandayken yenileme", () => {
  it("yenileme sürüyor: REFRESHING", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loadedKey: KEY, loading: true }))).toBe("REFRESHING");
  });

  it("yenileme düştü: REFRESH_FAILED (READY değil — eski veri hatasızmış gibi sunulmaz)", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loadedKey: KEY, failed: true }))).toBe("REFRESH_FAILED");
  });

  it("yenileme düştü, yeniden deneniyor: REFRESHING", () => {
    expect(deriveFinanceSourceStatus(state({ attemptKey: KEY, loadedKey: KEY, loading: true, failed: true }))).toBe("REFRESHING");
  });
});

describe("deriveFinanceSourceStatus — başka dosyanın / başka para birimi bağlamının verisi", () => {
  it("eldeki veri BAŞKA dosyaya aitse READY denmez: LOADING", () => {
    expect(deriveFinanceSourceStatus(state({ loadedKey: OTHER_CASE, attemptKey: OTHER_CASE }))).toBe("LOADING");
  });

  it("başka dosya için başlatılmış okumanın hatası bu dosyaya taşınmaz: ERROR değil, LOADING", () => {
    expect(deriveFinanceSourceStatus(state({ loadedKey: OTHER_CASE, attemptKey: OTHER_CASE, failed: true }))).toBe("LOADING");
  });

  it("eldeki veri aynı dosyanın BAŞKA para birimi bağlamında okunduysa son başarılı veri sayılmaz", () => {
    // yeni bağlamın okuması sürerken
    expect(deriveFinanceSourceStatus(state({ loadedKey: OTHER_CURRENCY, attemptKey: KEY, loading: true }))).toBe("LOADING");
    // yeni bağlamın okuması düştüğünde eski bağlamın verisi GÖSTERİLMEZ
    expect(deriveFinanceSourceStatus(state({ loadedKey: OTHER_CURRENCY, attemptKey: KEY, failed: true }))).toBe("ERROR");
  });

  it("bu bağlamın verisi eldeyken başka bağlam için süren / düşen okuma durumu değiştirmez: READY", () => {
    expect(deriveFinanceSourceStatus(state({ loadedKey: KEY, attemptKey: OTHER_CASE, loading: true }))).toBe("READY");
    expect(deriveFinanceSourceStatus(state({ loadedKey: KEY, attemptKey: OTHER_CASE, failed: true }))).toBe("READY");
  });

  it("DEĞİŞMEZ: veri gösteren durum (READY / REFRESHING / REFRESH_FAILED) yalnız veri BU bağlamda okunduysa döner", () => {
    const keys = [null, KEY, OTHER_CASE, OTHER_CURRENCY];
    let checked = 0;
    for (const contextKey of [KEY, null]) {
      for (const loadedKey of keys) {
        for (const attemptKey of keys) {
          for (const loading of [false, true]) {
            for (const failed of [false, true]) {
              const status = deriveFinanceSourceStatus({ contextKey, loadedKey, attemptKey, loading, failed });
              const showsData = resolveFinanceSourceView(status).hasData;
              expect(showsData, JSON.stringify({ contextKey, loadedKey, attemptKey, loading, failed, status })).toBe(
                contextKey !== null && loadedKey === contextKey,
              );
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(128);
  });
});

describe("resolveFinanceSourceView — yalnız tanınan üç durum veri gösterir", () => {
  it.each([
    ["READY", null],
    ["REFRESHING", "REFRESHING"],
    ["REFRESH_FAILED", "REFRESH_FAILED"],
  ] as const)("%s: veri gösterilir; yenileme notu %s", (status, refresh) => {
    expect(resolveFinanceSourceView(status)).toEqual({ status, hasData: true, unavailable: null, refresh });
  });

  it.each(["NOT_CONNECTED", "LOADING", "ERROR"] as const)("%s: veri gösterilmez", (status) => {
    expect(resolveFinanceSourceView(status)).toEqual({ status, hasData: false, unavailable: status, refresh: null });
  });

  it.each([[undefined], [null]])("durum verilmemişse (%s) NOT_CONNECTED sayılır — READY değil", (status) => {
    expect(resolveFinanceSourceView(status)).toEqual({
      status: "NOT_CONNECTED",
      hasData: false,
      unavailable: "NOT_CONNECTED",
      refresh: null,
    });
  });

  it.each([["ready"], [""], ["DONE"], [0], [1], [true], [{}], [["READY"]]])(
    "tanınmayan değer (%j) ERROR sayılır: veri gösterilmez, hata fırlatılmaz",
    (status) => {
      expect(resolveFinanceSourceView(status)).toEqual({ status: "ERROR", hasData: false, unavailable: "ERROR", refresh: null });
    },
  );

  it("türetilen her durum çözümleyicide kendisi olarak tanınır", () => {
    for (const loadedKey of [null, KEY]) {
      for (const loading of [false, true]) {
        for (const failed of [false, true]) {
          const status = deriveFinanceSourceStatus(state({ loadedKey, attemptKey: KEY, loading, failed }));
          expect(resolveFinanceSourceView(status).status).toBe(status);
        }
      }
    }
  });
});

describe("financeSourceContextKey — dosya + para birimi", () => {
  it.each([[undefined], [null], [""]])("dosya kimliği yoksa (%s) bağlam yoktur", (caseId) => {
    expect(financeSourceContextKey(caseId, "TRY")).toBeNull();
  });

  it("para birimi boşsa şema varsayılanı (TRY) sayılır; yazım farkı bağlamı değiştirmez", () => {
    expect(financeSourceContextKey("case-1", undefined)).toBe(KEY);
    expect(financeSourceContextKey("case-1", null)).toBe(KEY);
    expect(financeSourceContextKey("case-1", "")).toBe(KEY);
    expect(financeSourceContextKey("case-1", " try ")).toBe(KEY);
    expect(financeSourceContextKey("case-1", "usd")).toBe(OTHER_CURRENCY);
  });

  it("farklı dosya ya da farklı para birimi farklı bağlamdır", () => {
    expect(new Set([KEY, OTHER_CASE, OTHER_CURRENCY]).size).toBe(3);
  });

  it("ayraç çakışması yok: dosya kimliği ile para biriminin sınırı karışmaz", () => {
    expect(financeSourceContextKey('a","B', "C")).not.toBe(financeSourceContextKey("a", 'B","C'));
  });
});
