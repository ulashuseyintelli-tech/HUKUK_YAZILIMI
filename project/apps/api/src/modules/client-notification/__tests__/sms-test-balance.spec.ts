/**
 * SMS bağlantı testi dürüstlüğü — bakiye yanıt ayrıştırıcı testleri.
 * Bug: testSmsConnection gerçek test yapmadan {success:true} dönüyordu (yanıltıcı yeşil).
 * Fix: NETGSM/ILETI_MERKEZI bakiye ucu çağrılır (SMS gönderilmez); yanıt bu saf
 * fonksiyonlarla yorumlanır → verified / error / belirsiz ayrımı yapılır.
 */

import {
  parseNetGsmBalance,
  parseIletiMerkeziBalance,
} from "../client-notification.service";

describe("parseNetGsmBalance", () => {
  it("sayısal bakiye → ok", () => {
    expect(parseNetGsmBalance("12.34")).toEqual({ ok: true, balance: "12.34" });
    expect(parseNetGsmBalance("1500")).toEqual({ ok: true, balance: "1500" });
  });

  it("virgüllü bakiye → ok", () => {
    expect(parseNetGsmBalance("23,5")).toEqual({ ok: true, balance: "23,5" });
  });

  it("kod 30 (geçersiz kimlik) → kesin hata (definite)", () => {
    const r = parseNetGsmBalance("30");
    expect(r.ok).toBe(false);
    expect(r.definite).toBe(true);
    expect(r.error).toMatch(/kullanıcı|şifre/i);
  });

  it("kod 40 (başlık tanımsız) → kesin hata", () => {
    const r = parseNetGsmBalance("40");
    expect(r.ok).toBe(false);
    expect(r.definite).toBe(true);
  });

  it("boş yanıt → belirsiz (definite=false)", () => {
    expect(parseNetGsmBalance("")).toEqual({ ok: false, error: "Boş yanıt", definite: false });
  });

  it("anlamsız metin → belirsiz", () => {
    const r = parseNetGsmBalance("beklenmeyen birşey");
    expect(r.ok).toBe(false);
    expect(r.definite).toBe(false);
  });
});

describe("parseIletiMerkeziBalance", () => {
  const okXml =
    "<response><status><code>200</code><message>İşlem başarılı</message></status><balance><amount>45.20</amount></balance></response>";

  it("code 200 + amount → ok (bakiye)", () => {
    expect(parseIletiMerkeziBalance(okXml)).toEqual({ ok: true, balance: "45.20" });
  });

  it("code 200 ama amount yok → ok (bakiyesiz)", () => {
    const xml = "<response><status><code>200</code></status></response>";
    expect(parseIletiMerkeziBalance(xml)).toEqual({ ok: true, balance: undefined });
  });

  it("code 401 (yetkisiz) → kesin hata + mesaj", () => {
    const xml =
      "<response><status><code>401</code><message>Kullanıcı adı veya şifre hatalı</message></status></response>";
    const r = parseIletiMerkeziBalance(xml);
    expect(r.ok).toBe(false);
    expect(r.definite).toBe(true);
    expect(r.error).toMatch(/şifre/i);
  });

  it("boş yanıt → belirsiz", () => {
    expect(parseIletiMerkeziBalance("")).toEqual({ ok: false, error: "Boş yanıt", definite: false });
  });

  it("kod yok / beklenmeyen yanıt → belirsiz (definite=false)", () => {
    const r = parseIletiMerkeziBalance("<html>bakım</html>");
    expect(r.ok).toBe(false);
    expect(r.definite).toBe(false);
  });
});
