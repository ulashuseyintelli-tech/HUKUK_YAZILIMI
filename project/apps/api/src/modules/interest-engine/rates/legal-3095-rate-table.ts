/**
 * 3095 sayılı Kanun md. 1 — kanuni faiz oranı satırları, kaynak ve kanıtıyla (owner GO-COMPLETE 12.11.2026, MEŞE pilot:
 * "dönemleri resmî kaynaklarla doğrula; mevcut oran yükleme mekanizmasını kullanarak yerel hedefe yükle. Kaynak,
 * geçerlilik tarihi ve oran türünü kaydet.").
 *
 * YALNIZ VERİ: çalışma zamanı bu dosyayı okumaz. Tüketici `scripts/seed-interest-rates.ts` (`rate_schedule` yükleme).
 * Kapanan satırlar `validTo` taşır (açık uçlu eski satır kalmaz). Son satır da kapalıdır: 7589 sonrası oran her yıl
 * önceki yılın 31 Aralık reeskont oranından yeniden belirlenir; yeni yılın satırı doğrulanmadan eklenmez ve motor o
 * tarihten sonrası için oran kapsamı yok der (fail-closed), eski oranı sessizce sürdürmez.
 *
 * Hukuki okuma avukat teyidi yerine geçmez. `UNVERIFIED` satır bu turda resmî kaynakla yeniden doğrulanmadı (önceki
 * başlangıç verisinden aynen taşındı; yalnız bitiş tarihi bir sonraki satırın başlangıcından türetildi).
 */
export type LegalRateVerification = "VERIFIED_OFFICIAL" | "UNVERIFIED";

export interface LegalRateEvidence {
  url: string;
  /** İndirilen dosyanın SHA-256 özeti. */
  sha256: string;
  retrievedAtUtc: string;
  /** Dosyada doğrulanan ifade (kısa). */
  finding: string;
}

export interface LegalRateTableRow {
  /** ISO gün, dahil. */
  validFrom: string;
  /** ISO gün, dahil (motor `validTo` gününü kapsar). */
  validTo: string;
  /** Kesir: 0.24 = yıllık %24. */
  annualRate: number;
  /** `rate_schedule.source` (RateSource). */
  source: "RESMI_GAZETE";
  /** `rate_schedule.sourceRef`: kaynağın izlenebilir kısa adı. */
  sourceRef: string;
  verification: LegalRateVerification;
  evidence: readonly LegalRateEvidence[];
}

export const LEGAL_3095_INTEREST_TYPE = "LEGAL_3095";

/** 7589 md. 10 ile 3095 md. 1: önceki yılın 31 Aralık kısa vadeli reeskont oranının yüzde sekseni. */
export const LEGAL_RATE_REESKONT_FACTOR = 0.8;
/** TCMB reeskont tablosu: 20.12.2025'ten itibaren %38,75; 2026 içinde değişiklik girişi yok (31.12.2025 ve 30.06.2026 aynı). */
export const TCMB_REESKONT_2025_12_31 = 0.3875;

export const LEGAL_3095_RATE_TABLE: readonly LegalRateTableRow[] = [
  {
    validFrom: "2006-01-01",
    validTo: "2024-05-31",
    annualRate: 0.09,
    source: "RESMI_GAZETE",
    sourceRef: "Resmi Gazete",
    verification: "UNVERIFIED",
    evidence: [],
  },
  {
    validFrom: "2024-06-01",
    validTo: "2026-07-30",
    annualRate: 0.24,
    source: "RESMI_GAZETE",
    sourceRef: "CB Karari 8485, RG 21.05.2024 sayi 32552 (1.6.2024'ten gecerli yillik %24)",
    verification: "VERIFIED_OFFICIAL",
    evidence: [
      {
        url: "https://www.resmigazete.gov.tr/eskiler/2024/05/20240521.htm",
        sha256: "34218de0dde0c7282a862c6d5beef6d84febf4cb17c2f4491eacc3ee6d3ee762",
        retrievedAtUtc: "2026-11-11T22:05:00Z",
        finding: "3095 md. 1 kanuni faiz oranının 1/6/2024'ten geçerli yıllık %24 uygulanması; Karar Sayısı 8485",
      },
      {
        url: "https://www.resmigazete.gov.tr/eskiler/2024/05/20240521-23.pdf",
        sha256: "92ab134101e1398b2091c9d80bc8d4fbb0c0e6edcbf602b453464f1d6e2453a2",
        retrievedAtUtc: "2026-11-11T22:06:00Z",
        finding: "Karar Sayısı 8485, karar tarihi 20 Mayıs 2024, RG 21 Mayıs 2024 sayı 32552",
      },
    ],
  },
  {
    validFrom: "2026-07-31",
    validTo: "2026-12-31",
    annualRate: 0.31,
    source: "RESMI_GAZETE",
    sourceRef: "7589 s.K. md.10 (RG 31.07.2026 sayi 33326, yururluk md.26/1-c): TCMB 31.12.2025 reeskont %38,75 x 0,80",
    verification: "VERIFIED_OFFICIAL",
    evidence: [
      {
        url: "https://www.resmigazete.gov.tr/eskiler/2026/07/20260731-1.htm",
        sha256: "b9ee9b03725d2d3426f4ac24efed01874f6032dc0b3d9f293bcb94b257e7e16a",
        retrievedAtUtc: "2026-11-11T22:05:00Z",
        finding: "7589 md. 10: 3095 md. 1 — önceki yılın 31 Aralık kısa vadeli reeskont oranının yüzde sekseni; md. 26/1-c yayımı tarihinde yürürlük",
      },
      {
        url: "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari",
        sha256: "bf647f3cd80826dd42bb32b735cb78755a3118624061f0d1ca571c6cd0256e57",
        retrievedAtUtc: "2026-11-11T22:06:00Z",
        finding: "Reeskont 20.12.2025'ten %38,75; 2026 içinde giriş yok → 30.06.2026 farkı 0 puan (5 puan eşiğinin altında)",
      },
    ],
  },
];
