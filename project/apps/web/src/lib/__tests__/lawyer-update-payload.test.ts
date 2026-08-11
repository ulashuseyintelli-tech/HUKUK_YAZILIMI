import { describe, it, expect } from "vitest";
import { buildLawyerUpdatePayload } from "../lawyer-update-payload";

/**
 * PR-1.5 — güncelleme gövdesi yalnız DEĞİŞEN alanları taşır.
 *
 * Bu testlerin çekirdek amacı bir VERİ KAYBI regresyonunu kilitlemektir: sunucu kapsama
 * gereği bazı alanları taşımaz, form onları boş başlatır ve eski davranış boş değeri geri
 * yazıp kaydı SİLERDİ (istek 200 döndüğü için ekranda hiçbir hata görünmüyordu).
 */
describe("buildLawyerUpdatePayload", () => {
  it("hiçbir şey değişmediyse BOŞ gövde üretir", () => {
    const form = { name: "Ada", surname: "Lovelace", email: "ada@example.test" };
    expect(buildLawyerUpdatePayload(form, { ...form })).toEqual({});
  });

  it("yalnız değişen alanı taşır", () => {
    const initial = { name: "Ada", surname: "Lovelace", email: "ada@example.test" };
    const current = { ...initial, email: "ada2@example.test" };
    expect(buildLawyerUpdatePayload(initial, current)).toEqual({ email: "ada2@example.test" });
  });

  it("sunucudan GELMEYEN alan dokunulmadıysa gövdeye GİRMEZ (veri kaybı kilidi)", () => {
    // tckn/iban/bankName sunucudan hiç gelmediği için formda "" olarak başlar.
    const initial = { name: "Ada", surname: "Lovelace", tckn: "", iban: "", bankName: "" };
    const current = { ...initial, name: "Ada Nur" };
    const payload = buildLawyerUpdatePayload(initial, current);
    expect(payload).toEqual({ name: "Ada Nur" });
    expect("tckn" in payload).toBe(false);
    expect("iban" in payload).toBe(false);
    expect("bankName" in payload).toBe(false);
  });

  it("GÖRÜNÜR alanın kullanıcı tarafından boşaltılması gövdeye GİRER (temizleme çalışır)", () => {
    const initial = { email: "ada@example.test", phone: "02120000000" };
    const current = { email: "", phone: "02120000000" };
    expect(buildLawyerUpdatePayload(initial, current)).toEqual({ email: "" });
  });

  it("boolean bayrak yalnız gerçekten değiştiğinde gönderilir", () => {
    const initial = { canApproveOfficeActions: false, canSign: true };
    expect(buildLawyerUpdatePayload(initial, { ...initial })).toEqual({});
    expect(
      buildLawyerUpdatePayload(initial, { canApproveOfficeActions: true, canSign: true }),
    ).toEqual({ canApproveOfficeActions: true });
  });

  it("nesne alanı derin karşılaştırılır — aynı içerik gövdeye girmez", () => {
    const perms = { canEditCase: true, canViewFinance: false };
    const initial = { defaultPermissions: perms };
    const current = { defaultPermissions: { canViewFinance: false, canEditCase: true } };
    expect(buildLawyerUpdatePayload(initial, current)).toEqual({});
  });

  it("nesne alanı gerçekten değiştiyse gövdeye girer", () => {
    const initial = { defaultPermissions: { canEditCase: true } };
    const current = { defaultPermissions: { canEditCase: false } };
    expect(buildLawyerUpdatePayload(initial, current)).toEqual({
      defaultPermissions: { canEditCase: false },
    });
  });

  it("initial yoksa (yeni kayıt) tüm alanlar döner", () => {
    const form = { name: "Ada", surname: "Lovelace", email: "" };
    expect(buildLawyerUpdatePayload(null, form)).toEqual(form);
    expect(buildLawyerUpdatePayload(undefined, form)).toEqual(form);
  });

  it("dönen gövde girdi nesnesini MUTATE ETMEZ", () => {
    const initial = { name: "Ada", email: "ada@example.test" };
    const current = { name: "Ada Nur", email: "ada@example.test" };
    const snapshot = JSON.stringify({ initial, current });
    buildLawyerUpdatePayload(initial, current);
    expect(JSON.stringify({ initial, current })).toBe(snapshot);
  });

  it("gerçek senaryo: yalnız e-posta yazılınca diğer 12 alan KORUNUR", () => {
    // FATMA kaydının gerçek şekli: sunucu iletişim alanlarını taşımıyordu.
    const initial = {
      name: "FATMA", surname: "ULUCA TELLİ", email: "", phone: "", mobilePhone: "",
      whatsappPhone: "", fax: "", address: "", tckn: "", vergiNo: "", bankName: "",
      branchName: "", iban: "", lawyerRank: "PARTNER", canApproveOfficeActions: false,
    };
    const current = { ...initial, email: "fatmatest@tellihukuk.com", canApproveOfficeActions: true };
    const payload = buildLawyerUpdatePayload(initial, current);
    expect(payload).toEqual({
      email: "fatmatest@tellihukuk.com",
      canApproveOfficeActions: true,
    });
    // Rütbe dokunulmadığı için gövdeye girmez → yanlışlıkla düşürülemez.
    expect("lawyerRank" in payload).toBe(false);
  });
});
