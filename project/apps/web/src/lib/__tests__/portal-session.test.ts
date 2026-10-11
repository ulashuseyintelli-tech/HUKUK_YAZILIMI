import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PORTAL_SESSION_REJECTED_EVENT,
  PORTAL_TOKEN_STORAGE_KEY,
  PORTAL_USER_STORAGE_KEY,
  handlePortalSessionRejection,
  newerPortalSessionToken,
} from "@/lib/portal-session";

/**
 * Portal oturum reddi — ortak kuralın birim testleri.
 *
 * Kural: yalnız 401 oturum reddidir; ret yalnız isteğin GÖNDERİLDİĞİ işaret hâlâ tarayıcıdaysa
 * işlenir (gecikmiş ret yeni oturumu temizlemez); aynı oturum için olay bir kez üretilir.
 */
describe("handlePortalSessionRejection", () => {
  const onRejected = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    onRejected.mockClear();
    window.addEventListener(PORTAL_SESSION_REJECTED_EVENT, onRejected);
  });
  afterEach(() => {
    window.removeEventListener(PORTAL_SESSION_REJECTED_EVENT, onRejected);
    localStorage.clear();
  });

  const openSession = (token: string) => {
    localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(PORTAL_USER_STORAGE_KEY, JSON.stringify({ clientName: "Test" }));
  };

  it("[1] 401 + aynı işaret → işaret ve kullanıcı bilgisi silinir, olay BİR kez üretilir", () => {
    openSession("T1");
    expect(handlePortalSessionRejection({ status: 401, sentToken: "T1" })).toBe("REJECTED");
    expect(localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PORTAL_USER_STORAGE_KEY)).toBeNull();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it.each([200, 201, 204, 400, 403, 404, 409, 429, 500, 502, 503])(
    "[2] %i oturum reddi DEĞİLDİR: oturum korunur, olay yok",
    (status) => {
      openSession("T1");
      expect(handlePortalSessionRejection({ status, sentToken: "T1" })).toBe("NOT_REJECTED");
      expect(localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBe("T1");
      expect(localStorage.getItem(PORTAL_USER_STORAGE_KEY)).not.toBeNull();
      expect(onRejected).not.toHaveBeenCalled();
    },
  );

  it("[3] GECİKMİŞ RET: istek T1 ile gitti, tarayıcıda artık T2 var → yeni oturum TEMİZLENMEZ, olay yok", () => {
    openSession("T2");
    expect(handlePortalSessionRejection({ status: 401, sentToken: "T1" })).toBe("STALE");
    expect(localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBe("T2");
    expect(localStorage.getItem(PORTAL_USER_STORAGE_KEY)).not.toBeNull();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("[4] EŞZAMANLI RETLER: aynı oturumun üç reddi → olay TAM bir kez", () => {
    openSession("T1");
    const outcomes = [1, 2, 3].map(() => handlePortalSessionRejection({ status: 401, sentToken: "T1" }));
    expect(outcomes).toEqual(["REJECTED", "STALE", "STALE"]);
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, ""])("[5] işaretsiz gönderilmiş isteğin reddi (%s) olay üretmez", (sentToken) => {
    expect(handlePortalSessionRejection({ status: 401, sentToken })).toBe("STALE");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("[6] newerPortalSessionToken: yalnız gönderilenden FARKLI bir işaret varsa onu döndürür", () => {
    expect(newerPortalSessionToken("T1")).toBeNull(); // oturum yok
    openSession("T1");
    expect(newerPortalSessionToken("T1")).toBeNull(); // aynı oturum
    openSession("T2");
    expect(newerPortalSessionToken("T1")).toBe("T2"); // bu arada yeni oturum açılmış
    expect(newerPortalSessionToken(null)).toBe("T2");
  });
});
