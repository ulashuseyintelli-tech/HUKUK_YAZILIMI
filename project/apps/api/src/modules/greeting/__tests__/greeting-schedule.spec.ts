/**
 * Otomatik tebrik scheduler karar mantığı testleri.
 * Bug: cron sabit "0 9 * * *" idi → Office.autoGreetingTime ayarı yok sayılıyordu.
 * Fix: scheduler her dakika çalışır; shouldRunGreetingNow() tenant'ın ayarladığı saati
 * (catch-up + aynı-gün guard ile) dikkate alır. parseGreetingTime() bozuk değerde 09:00'a düşer.
 */

import { parseGreetingTime, shouldRunGreetingNow } from "../greeting.service";

describe("parseGreetingTime", () => {
  it("geçerli 'HH:mm' → ayrıştırır", () => {
    expect(parseGreetingTime("14:30")).toEqual({ hour: 14, minute: 30, fallbackUsed: false });
    expect(parseGreetingTime("09:00")).toEqual({ hour: 9, minute: 0, fallbackUsed: false });
    expect(parseGreetingTime("00:00")).toEqual({ hour: 0, minute: 0, fallbackUsed: false });
    expect(parseGreetingTime("23:59")).toEqual({ hour: 23, minute: 59, fallbackUsed: false });
  });

  it("baştaki/sondaki boşlukları kırpar", () => {
    expect(parseGreetingTime("  08:15 ")).toEqual({ hour: 8, minute: 15, fallbackUsed: false });
  });

  it("null/undefined/boş → 09:00 fallback (fallbackUsed=true)", () => {
    expect(parseGreetingTime(null)).toEqual({ hour: 9, minute: 0, fallbackUsed: true });
    expect(parseGreetingTime(undefined)).toEqual({ hour: 9, minute: 0, fallbackUsed: true });
    expect(parseGreetingTime("")).toEqual({ hour: 9, minute: 0, fallbackUsed: true });
  });

  it("hatalı format → 09:00 fallback", () => {
    expect(parseGreetingTime("abc").fallbackUsed).toBe(true);
    expect(parseGreetingTime("9:5").fallbackUsed).toBe(true); // dakika 2 hane olmalı
    expect(parseGreetingTime("0900").fallbackUsed).toBe(true);
    expect(parseGreetingTime("09:00:00").fallbackUsed).toBe(true);
  });

  it("aralık dışı saat/dakika → 09:00 fallback", () => {
    expect(parseGreetingTime("25:00").fallbackUsed).toBe(true);
    expect(parseGreetingTime("12:60").fallbackUsed).toBe(true);
  });
});

describe("shouldRunGreetingNow", () => {
  const at = (h: number, m: number) => new Date(2026, 5, 15, h, m, 0, 0); // 15 Haz 2026
  const yesterday = (h: number, m: number) => new Date(2026, 5, 14, h, m, 0, 0);

  it("kapalı (enabled=false) → her zaman false", () => {
    expect(shouldRunGreetingNow(at(10, 0), "09:00", null, false)).toBe(false);
  });

  it("saat henüz gelmedi → false", () => {
    expect(shouldRunGreetingNow(at(8, 59), "09:00", null, true)).toBe(false);
  });

  it("saat tam geldi (now == planlanan) → true", () => {
    expect(shouldRunGreetingNow(at(9, 0), "09:00", null, true)).toBe(true);
  });

  it("saat geçti + bugün hiç çalışmadı (lastRun=null) → true", () => {
    expect(shouldRunGreetingNow(at(9, 1), "09:00", null, true)).toBe(true);
  });

  it("aynı-gün guard: bugün zaten çalıştı → false", () => {
    expect(shouldRunGreetingNow(at(9, 30), "09:00", at(9, 0), true)).toBe(false);
  });

  it("catch-up: lastRun dün, bugün saat geçti → true", () => {
    expect(shouldRunGreetingNow(at(9, 0), "09:00", yesterday(9, 0), true)).toBe(true);
  });

  it("restart catch-up: 09:00'da kapalıydı, 09:03'te açıldı, dün çalışmış → true", () => {
    expect(shouldRunGreetingNow(at(9, 3), "09:00", yesterday(9, 0), true)).toBe(true);
  });

  it("özel saat 14:30 dikkate alınır: 14:29 → false, 14:30 → true", () => {
    expect(shouldRunGreetingNow(at(14, 29), "14:30", null, true)).toBe(false);
    expect(shouldRunGreetingNow(at(14, 30), "14:30", null, true)).toBe(true);
  });

  it("bozuk autoGreetingTime → 09:00 fallback davranışı: 08:00 false, 09:30 true", () => {
    expect(shouldRunGreetingNow(at(8, 0), "bozuk", null, true)).toBe(false);
    expect(shouldRunGreetingNow(at(9, 30), "bozuk", null, true)).toBe(true);
  });

  it("null autoGreetingTime → 09:00 fallback ile çalışır", () => {
    expect(shouldRunGreetingNow(at(9, 0), null, null, true)).toBe(true);
    expect(shouldRunGreetingNow(at(8, 59), null, null, true)).toBe(false);
  });
});
