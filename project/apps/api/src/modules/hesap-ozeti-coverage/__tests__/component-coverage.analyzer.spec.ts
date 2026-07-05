/**
 * ALC-AUTH-6: component-coverage.analyzer golden-file test harness.
 *
 * fixtures/ornek-icra-dosyasi-2026.ts içindeki gerçekçi legacy/canonical girdilerini
 * kullanarak buildComponentCoverageReport()'un beklenen coverageStatus'ları
 * ürettiğini doğrular. En kritik test FALSE-NEGATIVE GUARD'dır: legacy==canonical
 * sayısal eşleşmesinin TEK BAŞINA doğrulama sayılmadığını kod seviyesinde kanıtlar.
 */

import { buildComponentCoverageReport } from '../component-coverage.analyzer';
import { ComponentCoverageRow, SCENARIO_ARRAY } from '../component-coverage.types';
import {
  CANONICAL_BALANCE_FALSE_NEGATIVE_VARIANT,
  CANONICAL_BALANCE_ORNEK_ICRA_2026,
  GROUND_TRUTH_ORNEK_ICRA_2026,
  LEGACY_SUMMARY_ORNEK_ICRA_2026,
} from '../fixtures/ornek-icra-dosyasi-2026';

function findRow(rows: ComponentCoverageRow[], component: ComponentCoverageRow['component']): ComponentCoverageRow {
  const row = rows.find((r) => r.component === component);
  if (!row) {
    throw new Error(`Beklenen bileşen rapora eklenmemiş: ${component}`);
  }
  return row;
}

describe('buildComponentCoverageReport (ALC-AUTH-6 golden-file harness)', () => {
  const report = buildComponentCoverageReport(
    'case-ornek-icra-2026',
    LEGACY_SUMMARY_ORNEK_ICRA_2026,
    CANONICAL_BALANCE_ORNEK_ICRA_2026,
    GROUND_TRUTH_ORNEK_ICRA_2026,
  );

  it('caseId ve satır sayısını (15+ bileşen) doğru üretir', () => {
    expect(report.caseId).toBe('case-ornek-icra-2026');
    expect(report.rows.length).toBeGreaterThanOrEqual(15);
  });

  describe('(a) faiz alanları: legacy=STUB, canonical=CANONICAL_COVERED (ters asimetri)', () => {
    it('TAKIP_ONCESI_FAIZ: legacy STUB_ZERO(0), canonical gerçek motor değeri → CANONICAL_COVERED', () => {
      const row = findRow(report.rows, 'TAKIP_ONCESI_FAIZ');
      expect(row.legacySource).toBe('STUB_ZERO');
      expect(row.legacyValue).toBe(0);
      expect(row.canonicalSource).toBe('TBK100_ENGINE');
      expect(row.canonicalValue).toBe(3250.75);
      expect(row.coverageStatus).toBe('CANONICAL_COVERED');
      // Asimetri: legacy ve canonical AYNI DEĞİL — bu beklenen ve doğru durumdur.
      expect(row.legacyValue).not.toBe(row.canonicalValue);
    });

    it('TAKIP_SONRASI_FAIZ: legacy STUB_ZERO(0), canonical gerçek motor değeri → CANONICAL_COVERED', () => {
      const row = findRow(report.rows, 'TAKIP_SONRASI_FAIZ');
      expect(row.legacySource).toBe('STUB_ZERO');
      expect(row.legacyValue).toBe(0);
      expect(row.canonicalSource).toBe('TBK100_ENGINE');
      expect(row.canonicalValue).toBe(3250.75);
      expect(row.coverageStatus).toBe('CANONICAL_COVERED');
    });
  });

  describe('(b) harç kalemleri: legacy=HARDCODED_CONSTANT + canonical=AGGREGATE_ONLY veya MISSING', () => {
    it('BASVURMA_HARCI: legacy sabit 738.50, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'BASVURMA_HARCI');
      expect(row.legacySource).toBe('HARDCODED_CONSTANT');
      expect(row.legacyValue).toBe(738.5);
      expect(row.canonicalSource).toBe('ABSENT');
      expect(row.canonicalValue).toBeNull();
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('VEKALET_HARCI: legacy sabit 105.00, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'VEKALET_HARCI');
      expect(row.legacySource).toBe('HARDCODED_CONSTANT');
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('DOSYA_GIDERI: legacy sabit, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'DOSYA_GIDERI');
      expect(row.legacySource).toBe('HARDCODED_CONSTANT');
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('VEKALET_PULU: legacy sabit, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'VEKALET_PULU');
      expect(row.legacySource).toBe('HARDCODED_CONSTANT');
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('TEBLIGAT_GIDERI: legacy sabit (252*debtorCount), canonical case-level toplu → AGGREGATE_ONLY', () => {
      const row = findRow(report.rows, 'TEBLIGAT_GIDERI');
      expect(row.legacySource).toBe('HARDCODED_CONSTANT');
      expect(row.canonicalSource).toBe('AGGREGATE_DERIVED');
      expect(row.canonicalValue).toBe(1862.6);
      expect(row.coverageStatus).toBe('AGGREGATE_ONLY');
    });

    it('ICRA_MASRAFLARI_AGGREGATE: legacy formül-toplamı, canonical case-level toplu → AGGREGATE_ONLY', () => {
      const row = findRow(report.rows, 'ICRA_MASRAFLARI_AGGREGATE');
      expect(row.canonicalSource).toBe('AGGREGATE_DERIVED');
      expect(row.coverageStatus).toBe('AGGREGATE_ONLY');
    });
  });

  describe('(c) tahsil harcı/oranı: legacy=STATUTORY_FORMULA_COVERED (COMPUTED_FORMULA) + canonical=MISSING', () => {
    it('TAHSIL_HARCI_PESIN_DAHIL: legacy gerçek statüter formül, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'TAHSIL_HARCI_PESIN_DAHIL');
      expect(row.legacySource).toBe('COMPUTED_FORMULA');
      expect(typeof row.legacyValue).toBe('number');
      expect(row.canonicalSource).toBe('ABSENT');
      expect(row.canonicalValue).toBeNull();
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('TAHSIL_HARCI_PESIN_HARIC: legacy gerçek statüter formül, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'TAHSIL_HARCI_PESIN_HARIC');
      expect(row.legacySource).toBe('COMPUTED_FORMULA');
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('TAHSIL_ORANI_SENARYOLARI: legacy senaryo dizisi, canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'TAHSIL_ORANI_SENARYOLARI');
      expect(row.legacyValue).toBe(SCENARIO_ARRAY);
      expect(row.canonicalSource).toBe('ABSENT');
      expect(row.coverageStatus).toBe('MISSING');
    });

    it('PESIN_HARC: legacy gerçek statüter formül (%0.5/min120), canonical hiç yok → MISSING', () => {
      const row = findRow(report.rows, 'PESIN_HARC');
      expect(row.legacySource).toBe('COMPUTED_FORMULA');
      expect(row.legacyValue).toBe(551.5);
      expect(row.coverageStatus).toBe('MISSING');
    });
  });

  describe('(d) FALSE-NEGATIVE GUARD — legacy===canonical eşleşmesi tek başına doğrulama SAYILMAZ', () => {
    it(
      'canonical motor da (yanlışlıkla) 0 dönerse legacy(0)===canonical(0) eşleşir ama ' +
        'analyzer bu eşleşmeyi TEK BAŞINA güvenli kanıt olarak KULLANMAZ: coverageStatus ' +
        'CANONICAL_COVERED\'a DÜŞMEZ, UNVERIFIED döner — çünkü canonicalValue===0 iken motorun ' +
        'gerçekten sıfır faiz mi ürettiği yoksa motorun de (legacy gibi) çalışmadığı mı ayırt ' +
        'edilemez. Bu, adversarial-verify turunda bulunan bir kör noktanın (ilk implementasyonda ' +
        'source===TBK100_ENGINE olduğu için canonicalValue===0 olsa BİLE körü körüne ' +
        'CANONICAL_COVERED üretilmesi) düzeltilmiş halidir: artık ne saf value-eşitliği ' +
        '(0===0 → "eşleşti, güvenli") ne de saf source-varlığı ("motor çağrıldı" → "motor güvenilir") ' +
        'tek başına COVERED saydırmaz; ikisi birlikte ancak canonicalValue!==0 olduğunda ' +
        'CANONICAL_COVERED\'a izin verir.',
      () => {
        const degenerateReport = buildComponentCoverageReport(
          'case-ornek-icra-2026-false-negative',
          LEGACY_SUMMARY_ORNEK_ICRA_2026,
          CANONICAL_BALANCE_FALSE_NEGATIVE_VARIANT,
          GROUND_TRUTH_ORNEK_ICRA_2026,
        );
        const row = findRow(degenerateReport.rows, 'TAKIP_ONCESI_FAIZ');

        // Sayısal olarak eşleşiyorlar (ikisi de 0) — saf "value diff" bazlı bir analiz
        // burayı hatalıca "sorunsuz/eşleşiyor" diye işaretlerdi.
        expect(row.legacyValue).toBe(0);
        expect(row.canonicalValue).toBe(0);
        expect(row.legacyValue).toBe(row.canonicalValue);

        // KANIT: source bilgisi (STUB_ZERO + TBK100_ENGINE) tek başına COVERED saydırmaya
        // YETMEZ — canonicalValue===0 olduğu için rapor bunu UNVERIFIED olarak işaretler,
        // "eşleşme var, güvenli" YANLIŞ GÜVENİNİ üretmez.
        expect(row.legacySource).toBe('STUB_ZERO');
        expect(row.canonicalSource).toBe('TBK100_ENGINE');
        expect(row.coverageStatus).toBe('UNVERIFIED');

        // Açık uyarı: notes alanı bu durumun kör noktasını insan-okunur şekilde işaretlemeli;
        // "0" veya "STUB" gibi ipuçları içermeli ki raporu okuyan kişi yalnız statüye güvenip
        // geçmesin.
        expect(row.notes.toUpperCase()).toEqual(expect.stringContaining('STUB'));
      },
    );

    it('normal (bozuk olmayan) senaryoda aynı bileşen için legacy!==canonical olduğunu doğrulayarak kontrast kurar', () => {
      const healthyRow = findRow(report.rows, 'TAKIP_ONCESI_FAIZ');
      expect(healthyRow.legacyValue).toBe(0);
      expect(healthyRow.canonicalValue).toBe(3250.75);
      expect(healthyRow.legacyValue).not.toBe(healthyRow.canonicalValue);
      expect(healthyRow.coverageStatus).toBe('CANONICAL_COVERED');
    });
  });

  describe('(e) summary sayaçlarının doğru toplandığı', () => {
    it('countByStatus, rows içindeki her coverageStatus için doğru sayıyı verir', () => {
      const manualCount: Record<string, number> = {};
      for (const row of report.rows) {
        manualCount[row.coverageStatus] = (manualCount[row.coverageStatus] ?? 0) + 1;
      }
      for (const [status, count] of Object.entries(manualCount)) {
        expect(report.summary.countByStatus[status as keyof typeof report.summary.countByStatus]).toBe(count);
      }
      // Toplam satır sayısı, tüm statülerin toplamına eşit olmalı (hiçbir satır sayılmadan atlanmamış).
      const totalFromSummary = Object.values(report.summary.countByStatus).reduce((a, b) => a + b, 0);
      expect(totalFromSummary).toBe(report.rows.length);
    });

    it('MISSING veya HIGH-risk HARDCODED_CONSTANT varsa b1ReadinessBlocked=true olur', () => {
      expect(report.summary.countByStatus.MISSING).toBeGreaterThan(0);
      expect(report.summary.b1ReadinessBlocked).toBe(true);
    });

    it('hiçbir MISSING/HIGH-risk HARDCODED_CONSTANT satır yoksa b1ReadinessBlocked=false olur (izole senaryo)', () => {
      // Yalnız CANONICAL_COVERED/AGGREGATE_ONLY üretecek, MISSING doğurmayacak sentetik bir senaryo
      // analyzer'ın 15+ bileşenlik sabit yapısı nedeniyle şu an mümkün değil (icra/harç kalemleri
      // yapısal olarak her zaman MISSING üretiyor) — bu yüzden bu test yalnız invariant'ın
      // KOŞULUNU (some() mantığının doğru çalıştığını) rows'u manuel filtreleyerek doğrular.
      const hasBlocker = report.rows.some(
        (r) =>
          r.coverageStatus === 'MISSING' ||
          r.coverageStatus === 'UNVERIFIED' ||
          (r.coverageStatus === 'HARDCODED_CONSTANT' && r.risk === 'HIGH'),
      );
      expect(hasBlocker).toBe(report.summary.b1ReadinessBlocked);
    });

    it('degenerate (canonical da 0 dönen) senaryoda UNVERIFIED satır tek başına b1ReadinessBlocked=true üretir', () => {
      const degenerateReport = buildComponentCoverageReport(
        'case-ornek-icra-2026-false-negative',
        LEGACY_SUMMARY_ORNEK_ICRA_2026,
        CANONICAL_BALANCE_FALSE_NEGATIVE_VARIANT,
        GROUND_TRUTH_ORNEK_ICRA_2026,
      );
      expect(degenerateReport.summary.countByStatus.UNVERIFIED).toBeGreaterThan(0);
      expect(degenerateReport.summary.b1ReadinessBlocked).toBe(true);
    });
  });

  describe('ground-truth alanları', () => {
    it('fixture ile sağlanan ground-truth değerleri satıra doğru işlenir', () => {
      const row = findRow(report.rows, 'BASVURMA_HARCI');
      expect(row.groundTruthValue).toBe(738.5);
      expect(row.groundTruthSource).toBe('STATUTORY_TARIFE_TABLE');
    });

    it('ground-truth sağlanmayan bileşenlerde NOT_PROVIDED döner', () => {
      const row = findRow(report.rows, 'TAHSIL_HARCI_PESIN_DAHIL');
      expect(row.groundTruthValue).toBeNull();
      expect(row.groundTruthSource).toBe('NOT_PROVIDED');
    });

    it('groundTruth parametresi hiç verilmezse tüm satırlar NOT_PROVIDED döner', () => {
      const reportWithoutGroundTruth = buildComponentCoverageReport(
        'case-ornek-icra-2026-no-gt',
        LEGACY_SUMMARY_ORNEK_ICRA_2026,
        CANONICAL_BALANCE_ORNEK_ICRA_2026,
      );
      expect(reportWithoutGroundTruth.rows.every((r) => r.groundTruthSource === 'NOT_PROVIDED')).toBe(true);
    });
  });

  describe('TOPLAM_TAHSILAT', () => {
    it('legacy DUE_DERIVED ve canonical AGGREGATE_DERIVED, ikisi de gerçek veri kaynağından → CANONICAL_COVERED', () => {
      const row = findRow(report.rows, 'TOPLAM_TAHSILAT');
      expect(row.legacySource).toBe('DUE_DERIVED');
      expect(row.canonicalSource).toBe('AGGREGATE_DERIVED');
      expect(row.coverageStatus).toBe('CANONICAL_COVERED');
    });
  });
});
