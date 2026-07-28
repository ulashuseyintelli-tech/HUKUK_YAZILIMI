/**
 * UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01 — governance artefakt validasyonu
 *
 * Bu görev **AUTHORITY MATERIALIZATION**'dır: runtime implementasyonu NOT AUTHORIZED.
 * Bu yüzden burada bir mapping modülü sınanmaz — **governance artefaktının kendisi**
 * deterministik olarak ayrıştırılır ve GA-01…GA-10 değişmezleri doğrulanır.
 *
 * Artefakt: `project/docs/blueprint/UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01-v1.0.md`
 *
 * Kasıtlı olarak YOK: yeni serializer davranışı, mapping fonksiyonu, `RATIFIED_*`
 * tablolarının doldurulması. Ratifiye satırlar yalnız belgede yaşar; koda bağlanmaları
 * ayrı bir implementasyon görevi gerektirir.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  OFFICIAL_ALACAK_KALEMI_PARENTS,
  OFFICIAL_MAHIYET_KODU_SET,
  OFFICIAL_TAKIP_TURU_SET,
  resolveOfficialMahiyetKodu,
  resolveOfficialTakipTuru,
} from '../official-codelist-registry';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const REPO_ROOT = path.resolve(API_ROOT, '../../..');
const DOC = path.join(
  REPO_ROOT,
  'project/docs/blueprint/UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01-v1.0.md',
);

const doc = fs.readFileSync(DOC, 'utf8');

/** Markdown pipe-tablo satırlarını hücrelere ayırır. */
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/**
 * Bir matrisi BAŞLIK-DUYARLI ayrıştırır: `id` sütunu `<prefix>-NN` ile başlayan satırlar
 * bulunur ve hemen üstlerindeki başlık satırından sütun adı → indeks haritası çıkarılır.
 * Sütun sırası tablodan tabloya değiştiği için sabit ofset KULLANILMAZ.
 */
interface Matrix {
  readonly header: string[];
  readonly rows: string[][];
  /** Adı verilen alt dizeyi İÇEREN ilk sütunun değeri; yoksa `''`. */
  col(row: string[], nameFragment: string): string;
}

const matrix = (prefix: string): Matrix => {
  const lines = doc.split('\n');
  const rowRe = new RegExp(`^\\|\\s*${prefix}-\\d+`);
  const rowIdx = lines.map((l, i) => (rowRe.test(l) ? i : -1)).filter((i) => i >= 0);
  if (rowIdx.length === 0) return { header: [], rows: [], col: () => '' };

  // Başlık = ilk veri satırından yukarı doğru ilk `| --- |` ayıracının üstündeki satır.
  let sep = rowIdx[0] - 1;
  while (sep > 0 && !/^\|\s*-{2,}/.test(lines[sep])) sep--;
  const header = cells(lines[sep - 1]).map((h) => h.replace(/[`*]/g, '').toLowerCase());

  const rows = rowIdx.map((i) => cells(lines[i]));
  const col = (row: string[], nameFragment: string): string => {
    const at = header.findIndex((h) => h.includes(nameFragment.toLowerCase()));
    return at >= 0 && at < row.length ? row[at] : '';
  };
  return { header, rows, col };
};

const T = matrix('T');
const W = matrix('W');
const M = matrix('M');
const R = matrix('R');

const T_ROWS = T.rows;
const W_ROWS = W.rows;
const M_ROWS = M.rows;
const R_ROWS = R.rows;

const clean = (s: string) => s.replace(/[*`]/g, '').trim();
/** Son sütun = OWNER RATIFIED; sondan ikinci = Disposition (üç matriste de böyle). */
const ratified = (r: string[]) => clean(r[r.length - 1]);
const disposition = (r: string[]) => clean(r[r.length - 2]);

const VALID_DISPOSITIONS = [
  'RATIFIED',
  'RATIFIED (koşullu)',
  'AUTHORITY_REQUIRED',
  'UNSUPPORTED',
  'UNRESOLVED / FAIL-CLOSED',
];
const isRatified = (r: string[]) => disposition(r).startsWith('RATIFIED');

// ============================================================================

describe('GA — governance artefakt değişmezleri', () => {
  it('artefakt mevcut ve üç matris de satır taşıyor', () => {
    expect(T_ROWS.length).toBeGreaterThan(0);
    expect(W_ROWS.length).toBeGreaterThan(0);
    expect(M_ROWS.length).toBeGreaterThan(0);
  });

  it('GA-01: her ratifiye satır kanıt taşır', () => {
    const withEvidence: Array<[Matrix, string]> = [
      [T, 'evidence'],
      [W, 'evidence'],
      [M, 'evidence'],
    ];
    let checked = 0;
    for (const [m, colName] of withEvidence) {
      for (const r of m.rows) {
        if (!isRatified(r)) continue;
        const evidence = clean(m.col(r, colName));
        expect(evidence.length).toBeGreaterThan(20);
        expect(evidence.toLowerCase()).not.toMatch(/^(yok|aday yok|—|-)$/);
        checked++;
      }
    }
    // Guard boşa geçmesin: en az bir ratifiye satır gerçekten denetlendi.
    expect(checked).toBeGreaterThanOrEqual(11);
  });

  it('GA-01b: ratifiye satırlar OWNER RATIFIED = YES, diğerleri NO', () => {
    for (const r of [...T_ROWS, ...W_ROWS, ...M_ROWS]) {
      expect(ratified(r)).toBe(isRatified(r) ? 'YES' : 'NO');
    }
  });

  it('GA-01c: her satırın dispozisyonu tanımlı kümededir', () => {
    for (const r of [...T_ROWS, ...W_ROWS, ...M_ROWS]) {
      const d = disposition(r);
      const known =
        VALID_DISPOSITIONS.some((v) => d.startsWith(v)) || d.startsWith('MODEL RESIDUAL');
      expect(known).toBe(true);
    }
  });

  it('GA-02: hiçbir legacy sayısal eşleme ratifiye edilmemiştir', () => {
    // Legacy sözlüğün anlamları ratifiye bir satırın KANITI olamaz.
    const legacyMeanings = [
      'Genel Haciz',
      'Fatura Alacağı',
      'Teminat Mektubu',
      'Sözleşme Alacağı',
      'Kredi Alacağı',
    ];
    for (const r of M_ROWS) {
      if (!isRatified(r)) continue;
      const evidence = clean(M.col(r, 'evidence'));
      for (const m of legacyMeanings) expect(evidence).not.toContain(m);
    }
    // Belge yasak zinciri açıkça reddediyor.
    expect(doc).toContain('LEGACY CODE → SAME NUMERIC OFFICIAL CODE');
    expect(doc).toContain('LEGACY NUMERIC CODES:            NOT AUTHORITY');
  });

  it('GA-02b: yasak çıkarım yöntemleri açıkça reddedilmiştir', () => {
    for (const forbidden of [
      'etiket tahmini',
      'magic default',
      'çağıran-verilen',
      'FATURA → 1045',
      'fallback',
    ]) {
      expect(doc).toContain(forbidden);
    }
  });

  it('GA-03: production-reachable her ProceedingType değeri dispozisyon taşır', () => {
    const enumValues = [
      'GENERAL_EXECUTION',
      'CAMBIO',
      'RENT',
      'EVICTION',
      'PLEDGE',
      'MORTGAGE',
      'BANKRUPTCY',
      'JUDGMENT_ENFORCEMENT',
      'PUBLIC_RECEIVABLE',
    ];
    const tableText = T_ROWS.map((r) => r.join(' | ')).join('\n');
    for (const v of enumValues) expect(tableText).toContain(v);
    // `null` (sınıflandırılmamış) hâli de kayıtlı olmalı — sessiz boşluk bırakılmaz.
    expect(tableText).toContain('proceedingType = null');
  });

  it('GA-03b: production-reachable her InstrumentType değeri dispozisyon taşır', () => {
    const tableText = W_ROWS.map((r) => r.join(' | ')).join('\n');
    for (const v of ['CEK', 'SENET', 'BONO', 'POLICE']) {
      expect(tableText).toContain(`InstrumentType.${v}`);
    }
  });

  it('GA-03c: resmî emit edilebilir 17 mahiyetKodu dispozisyon tablosunda geçer', () => {
    const tableText = M_ROWS.map((r) => r.join(' | ')).join('\n');
    expect(OFFICIAL_MAHIYET_KODU_SET.size).toBe(17);
    for (const code of OFFICIAL_MAHIYET_KODU_SET) expect(tableText).toContain(code);
  });

  it('GA-04: aynı resmî semantik değerin iki sahibi yok', () => {
    // Her wrapper en fazla bir kez RATIFIED kaynağa bağlanabilir — `senet` hariç:
    // SENET ve BONO bilinçli olarak aynı sarmalayıcıya düşer (R-07).
    const counts = new Map<string, number>();
    for (const r of W_ROWS.filter(isRatified)) {
      const key = clean(W.col(r, 'wrapper'));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(0);
    for (const [wrapper, n] of counts) {
      if (wrapper === 'senet') expect(n).toBe(2);
      else expect(n).toBe(1);
    }
    // Ratifiye edilen her wrapper resmî yetkili ebeveyn kümesindedir.
    for (const wrapper of counts.keys()) {
      expect(OFFICIAL_ALACAK_KALEMI_PARENTS).toContain(wrapper);
    }
  });

  it('GA-04b: ratifiye takipTuru değerleri resmî kümededir', () => {
    for (const r of T_ROWS.filter(isRatified)) {
      const official = clean(T.col(r, 'official value'));
      const code = /([01])/.exec(official)?.[1];
      expect(code).toBeDefined();
      expect(OFFICIAL_TAKIP_TURU_SET.has(code as string)).toBe(true);
    }
  });

  it('GA-05: 5045 yalnız dış teknik sorudur — ratifiye edilmez', () => {
    expect(doc).toContain('5045 STATUS: EXTERNAL TECHNICAL AUTHORITY REQUIRED');
    expect(doc).toContain('ratifiable kümesine **dâhil değildir**'.replace(/\*\*/g, ''));
    // Hiçbir matris satırı 5045'i ratifiye etmiyor.
    for (const r of M_ROWS) {
      if (r.join(' ').includes('5045')) expect(isRatified(r)).toBe(false);
    }
    // Kod tarafı da fail-closed kalıyor.
    expect(OFFICIAL_MAHIYET_KODU_SET.has('5045')).toBe(false);
  });

  it('GA-06: çözülmemiş eşlemeler emit edilebilir DEĞİL', () => {
    expect(doc).toContain('UNRATIFIED MAPPINGS:             NOT EMITTABLE');
    expect(doc).toContain('ABSENT OR AMBIGUOUS SEMANTICS:   FAIL-CLOSED');
    // Runtime hâlâ fail-closed: ratifikasyon belgede yaşıyor, koda bağlanmadı.
    expect(resolveOfficialMahiyetKodu('NAFAKA').kind).toBe('AUTHORITY_REQUIRED');
    expect(resolveOfficialTakipTuru('JUDGMENT_ENFORCEMENT').kind).toBe('AUTHORITY_REQUIRED');
  });

  it('GA-07: Canary-required subset eksiksiz ve senaryo boşluğu açıkça kayıtlı', () => {
    for (const field of [
      '`rolTur`',
      '`takipTuru`',
      '`alacakKalemi` wrapper',
      '`mahiyetKodu`',
      'legal basis source',
      'strict DTD',
    ]) {
      expect(doc).toContain(field);
    }
    expect(doc).toContain('CANARY SCENARIO CORPUS: NOT CANONICALLY DEFINED — EXACT BLOCKER');
    expect(doc).toContain('CANARY R02:                      NOT ELIGIBLE');
  });

  it('GA-08: orijinal P02B-R2 kapalı kalır', () => {
    expect(doc).toContain('DBP-P2-UYAP-CONTRACT-A-P02B-R2:  CLOSED / UNCHANGED');
    expect(doc).toContain('0b09ebbd');
    expect(doc).not.toMatch(/P02B-R2[^\n]{0,80}(REOPEN|yeniden aç)/i);
  });

  it('GA-09: PR #1825 follow-up remediation olarak kalır', () => {
    expect(doc).toContain('PR #1825:                        FOLLOW-UP TECHNICAL REMEDIATION');
    expect(doc).toContain('a0b45f0b');
  });

  it('GA-10: runtime implementasyon değişikliği yok', () => {
    expect(doc).toContain('RUNTIME IMPLEMENTATION:          NONE');
    // `RATIFIED_*` tabloları hâlâ boş — hiçbir eşleme koda bağlanmadı.
    const registry = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/official/official-codelist-registry.ts'),
      'utf8',
    );
    expect(registry).toMatch(
      /RATIFIED_MAHIYET_BY_DOMAIN[^=]*=\s*Object\.freeze\(\{\s*\}\)/,
    );
    expect(registry).toMatch(
      /RATIFIED_TAKIP_TURU_BY_DOMAIN[^=]*=\s*Object\.freeze\(\{\s*\}\)/,
    );
  });

  it('GA-11: model residual ları numaralı ve etkili', () => {
    expect(R_ROWS.length).toBeGreaterThanOrEqual(7);
    for (const r of R_ROWS) {
      expect(r[1].length).toBeGreaterThan(10); // residual açıklaması
      expect(r[2].length).toBeGreaterThan(5); // etkisi
    }
  });
});
