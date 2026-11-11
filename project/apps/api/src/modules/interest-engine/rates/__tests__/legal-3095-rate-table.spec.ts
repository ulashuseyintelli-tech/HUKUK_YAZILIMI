import {
  LEGAL_3095_RATE_TABLE,
  LEGAL_RATE_REESKONT_FACTOR,
  TCMB_REESKONT_2025_12_31,
} from "../legal-3095-rate-table";

/**
 * Kanuni faiz (3095 md. 1) oran tablosu — kaynak / dönem bütünlüğü. Tablo `scripts/seed-interest-rates.ts` ile
 * `rate_schedule`'a yüklenir; motor `validTo` gününü dahil sayar ve çakışan açık uçlu satırda en geç başlayanı seçer.
 * Bu yüzden: boşluk yok, çakışma yok, açık uçlu satır yok, doğrulanmış satırın resmî kanıtı var.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("LEGAL_3095_RATE_TABLE", () => {
  it("satırlar sıralı, birbirine bitişik, çakışmasız ve hepsi kapalı (validTo dolu, validFrom ≤ validTo)", () => {
    for (const [i, row] of LEGAL_3095_RATE_TABLE.entries()) {
      expect(row.validTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day(row.validFrom)).toBeLessThanOrEqual(day(row.validTo));
      if (i > 0) expect(day(row.validFrom) - day(LEGAL_3095_RATE_TABLE[i - 1].validTo)).toBe(DAY_MS);
    }
  });

  it("doğrulanmış satırlarda resmî alan adından kanıt (https + SHA-256 + zaman) ve izlenebilir sourceRef var", () => {
    const verified = LEGAL_3095_RATE_TABLE.filter((r) => r.verification === "VERIFIED_OFFICIAL");
    expect(verified.length).toBeGreaterThan(0);
    for (const row of verified) {
      expect(row.sourceRef).not.toBe("Resmi Gazete");
      expect(row.evidence.length).toBeGreaterThan(0);
      for (const ev of row.evidence) {
        expect(new URL(ev.url).hostname).toMatch(/(^|\.)(resmigazete\.gov\.tr|tcmb\.gov\.tr)$/);
        expect(ev.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(Number.isNaN(Date.parse(ev.retrievedAtUtc))).toBe(false);
      }
    }
  });

  it("dönem değerleri: 1.6.2024'ten %24 (CB Kararı 8485); 31.7.2026'dan 31.12.2025 reeskontunun %80'i = %31", () => {
    const at = (iso: string) =>
      LEGAL_3095_RATE_TABLE.find((r) => day(r.validFrom) <= day(iso) && day(iso) <= day(r.validTo));
    expect(at("2024-06-01")?.annualRate).toBe(0.24);
    expect(at("2026-07-30")?.annualRate).toBe(0.24);
    expect(at("2026-07-31")?.annualRate).toBeCloseTo(TCMB_REESKONT_2025_12_31 * LEGAL_RATE_REESKONT_FACTOR, 10);
    expect(at("2026-07-31")?.annualRate).toBe(0.31);
    expect(at("2027-01-01")).toBeUndefined(); // yeni yıl satırı doğrulanmadan eklenmez (fail-closed)
  });

  it("dönem bölmesi (sentetik): 10.000 TL, 01.07.2026 → 10.08.2026, 365 gün esası = 30 gün %24 + 10 gün %31", () => {
    // Gün sayımı: başlangıç günü hariç, bitiş günü dahil (motorun segment kuralıyla aynı uzunluk = tarih farkı).
    const principal = 10_000;
    const segments = [
      { from: "2026-07-01", to: "2026-07-31" }, // 30 gün, %24
      { from: "2026-07-31", to: "2026-08-10" }, // 10 gün, %31
    ];
    const rateOn = (iso: string) => LEGAL_3095_RATE_TABLE.find((r) => day(r.validFrom) <= day(iso) && day(iso) <= day(r.validTo))!.annualRate;
    const interest = segments.reduce((sum, s) => sum + (principal * rateOn(s.from) * (day(s.to) - day(s.from))) / DAY_MS / 365, 0);
    expect(Math.round(interest * 100) / 100).toBe(282.19);
  });
});
