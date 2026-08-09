import { describe, it, expect, beforeEach } from "vitest";
import { apiClient } from "../client";
import { api } from "@/lib/api";

/**
 * CAD-C1-B03-AUTH-CONTINUITY-REMEDIATION-R01 — apiClient (client-compliance ve diğer yeni
 * yüzeylerin kullandığı client) token çözümlemesi TEK-KAYNAK: lib/api.ts'in `api` singleton'ına
 * delege eder (OFFICE-AUTH-P01: this.token ?? sessionStorage ?? localStorage).
 *
 * Kapatılan kök neden: apiClient YALNIZ localStorage okuyordu. OFFICE login "Beni hatırla" KAPALIYKEN
 * token YALNIZ sessionStorage'a yazıldığından apiClient token'ı bulamıyor; client-compliance
 * yüzeylerinin TÜM API çağrıları 401 dönüyordu (doğal soft-navigation akışında bile). Ana app
 * `api` (lib/api.ts) kullandığı için çalışıyor, compliance `apiClient` kullandığı için 401 —
 * aynı oturumda `/clients/:id/action-catalog` 200 (api) ↔ 401 (apiClient) ile kanıtlandı.
 */
describe("apiClient token single-source (CAD-C1-B03-AUTH-CONTINUITY-REMEDIATION-R01)", () => {
  beforeEach(() => {
    api.clearToken();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("[1] 'Beni hatırla' KAPALI (session-only) → apiClient token'ı ÇÖZER (regresyon: eskiden null → 401)", () => {
    api.setToken("session-only-token", false); // sessionStorage'a yazılır, localStorage boş
    expect(sessionStorage.getItem("token")).toBe("session-only-token");
    expect(localStorage.getItem("token")).toBeNull();
    expect(apiClient.getToken()).toBe("session-only-token");
  });

  it("[2] 'Beni hatırla' AÇIK (localStorage) → apiClient token'ı ÇÖZER", () => {
    api.setToken("persistent-token", true);
    expect(localStorage.getItem("token")).toBe("persistent-token");
    expect(apiClient.getToken()).toBe("persistent-token");
  });

  it("[3] token yokken apiClient null döner", () => {
    expect(apiClient.getToken()).toBeNull();
  });

  it("[4] apiClient.setToken/clearToken kanonik `api` kaynağına delege eder (tek-kaynak)", () => {
    apiClient.setToken("via-apiclient");
    expect(api.getToken()).toBe("via-apiclient");
    apiClient.clearToken();
    expect(api.getToken()).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
