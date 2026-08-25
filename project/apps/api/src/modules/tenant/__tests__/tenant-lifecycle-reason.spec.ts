/**
 * C15-S1-MODIFIED PR-3 — `lifecycleReason` doğrulaması.
 *
 * Sınır beyanı testte de tekrarlanır: yasak-desen kümesi yapıştırma-kazası
 * guard'ıdır, genel PII/secret dedektörü DEĞİLDİR.
 */

import { InvalidLifecycleReasonError } from "../tenant-lifecycle-errors";
import {
  LIFECYCLE_REASON_MAX_LENGTH,
  validateLifecycleReason,
} from "../tenant-lifecycle-reason";

describe("C15-S1-MODIFIED PR-3 — lifecycleReason doğrulaması", () => {
  it("geçerli reason trim edilmiş olarak döner", () => {
    expect(validateLifecycleReason("  canary tenant kapanışa alındı  ")).toBe(
      "canary tenant kapanışa alındı",
    );
  });

  it("string olmayan girdi reddedilir", () => {
    for (const v of [undefined, null, 42, {}, []]) {
      expect(() => validateLifecycleReason(v)).toThrow(InvalidLifecycleReasonError);
    }
  });

  it("trim sonrası boş reddedilir", () => {
    for (const v of ["", "   ", "\t\n"]) {
      expect(() => validateLifecycleReason(v)).toThrow(InvalidLifecycleReasonError);
    }
  });

  it("üst sınır: tam 200 kabul, 201 red", () => {
    // "z" bilinçli: hex olmayan karakter, UZUN_HEX/UZUN_BASE64 guard'larına takılmaz
    // ("a".repeat(200) 32+ ardışık hex sayılır ve DOĞRU olarak reddedilirdi).
    const z = (n: number): string => Array.from({ length: n }, (_, i) => (i % 2 ? "z" : "ğ")).join("");
    expect(validateLifecycleReason(z(LIFECYCLE_REASON_MAX_LENGTH))).toHaveLength(200);
    expect(() => validateLifecycleReason(z(LIFECYCLE_REASON_MAX_LENGTH + 1))).toThrow(
      InvalidLifecycleReasonError,
    );
  });

  it("yapıştırma-kazası desenleri reddedilir", () => {
    const kotu = [
      "token eyJhbGciOiJIUzI1NiJ9abc",                       // JWT
      "Bearer abc123",                                        // bearer
      "password: hunter2",                                    // credential atama
      "api_key=xyz",                                          // credential atama
      "deadbeefdeadbeefdeadbeefdeadbeef00",                   // 34 hex
      "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqaw==", // uzun base64
    ];
    for (const v of kotu) {
      expect(() => validateLifecycleReason(v)).toThrow(InvalidLifecycleReasonError);
    }
  });

  it("hata mesajı reason İÇERİĞİNİ sızdırmaz", () => {
    try {
      validateLifecycleReason("password: cokgizlideger123");
      throw new Error("beklenen hata fırlatılmadı");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidLifecycleReasonError);
      expect((e as Error).message).not.toContain("cokgizlideger123");
    }
  });

  it("sıradan Türkçe operasyon metni yanlış pozitif üretmez", () => {
    const iyi = [
      "müşteri talebiyle askıya alma hazırlığı",
      "UYAP senkron hatası nedeniyle kapanış başlatıldı (destek kaydı 4821)",
      "yeniden aktivasyon: ödeme planı onaylandı",
    ];
    for (const v of iyi) expect(() => validateLifecycleReason(v)).not.toThrow();
  });
});
