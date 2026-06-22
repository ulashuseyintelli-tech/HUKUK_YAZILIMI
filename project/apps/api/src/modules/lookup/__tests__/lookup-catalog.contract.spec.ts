/**
 * LOOKUP CATALOG CONTRACT TEST.
 *
 * Frontend (apps/web) lookup-catalog.ts'i import ETMEZ (ayrı paket). Bunun yerine
 * frontend'in cases/new wizard akışında ARADIĞI kodlar burada açık literal (FRONTEND_CONTRACT)
 * olarak tutulur ve kanonik katalog ile hizalanır. Katalogdan bir kod düşerse / yeniden
 * adlandırılırsa bu test KIRMIZI olur → drift CI'da yakalanır (asıl regresyonun kök sebebi
 * "frontend'in aradığı kod katalogda yok" idi).
 *
 * KAYNAK (frontend'in aradığı kodlar):
 *   apps/web/src/app/(dashboard)/cases/new/page.tsx
 *     - documentSource effect: 348 (ILAMLI), 354 (KAMBIYO_CEK/KAMBIYO_SENET), 359 (ILAMSIZ_GENEL)
 *     - ILAM onComplete: 1177 (ILAMLI)
 *     - Kambiyo onComplete: 1202/1205 (KAMBIYO_CEK/KAMBIYO_SENET)
 *     - handleTakipTuruChange takipTuruMahiyetMap: 731-747
 *   apps/web/src/components/case/IlamsizWizard.tsx → result.takipTuruCode
 *     (ILAMSIZ_GENEL/ILAMSIZ_KIRA/ILAMSIZ_TAHLIYE/REHIN_TASINIR/REHIN_TASINMAZ/IFLAS_ADI ...)
 *
 * NOT (PR-D kapsamı): handleTakipTuruChange map'inde kanonik OLMAYAN ölü anahtarlar var
 *   (ILAMSIZ_KAMBIYO, ILAMSIZ_FATURA, KIRA, TAHLIYE). Bunlar takip türü kodu değildir;
 *   PR-D'de frontend map'ten kaldırılacaktır. Aşağıdaki DEAD_MAP_KEYS testi bu durumu kanıtlar.
 */
import {
  TAKIP_TURU_CATALOG,
  MAHIYET_TIPI_CATALOG,
  TAKIP_TURU_DEFAULTS,
} from '../lookup-catalog';

const FRONTEND_CONTRACT = {
  // Frontend'in çözmesi gereken takip türü kodları (hepsi katalogda OLMALI)
  takipTuru: [
    'ILAMLI',
    'KAMBIYO_CEK',
    'KAMBIYO_SENET',
    'ILAMSIZ_GENEL',
    'ILAMSIZ_KIRA',
    'ILAMSIZ_TAHLIYE',
    'REHIN_TASINIR',
    'REHIN_TASINMAZ',
    'IFLAS_ADI',
    'IFLAS_KAMBIYO',
    'NAFAKA',
  ],
  // Frontend'in set ettiği/aradığı mahiyet kodları (hepsi katalogda OLMALI)
  mahiyet: ['CEK', 'SENET', 'TAZMINAT', 'PARA', 'KIRA', 'TAHLIYE', 'FATURA', 'NAFAKA', 'REHIN', 'IPOTEK'],
  // handleTakipTuruChange takipTuruMahiyetMap'in KANONİK (geçerli) anahtarları (PR-D sonrası kalacak set)
  takipTuruMahiyetMapKeysCanonical: [
    'KAMBIYO_CEK',
    'KAMBIYO_SENET',
    'ILAMSIZ_GENEL',
    'ILAMSIZ_KIRA',
    'ILAMSIZ_TAHLIYE',
    'ILAMLI',
    'NAFAKA',
    'REHIN_TASINIR',
    'REHIN_TASINMAZ',
    'IFLAS_ADI',
    'IFLAS_KAMBIYO',
  ],
};

// Frontend map'inde ŞU AN bulunan ama kanonik OLMAYAN ölü anahtarlar (PR-D temizler).
const DEAD_MAP_KEYS_TO_REMOVE_IN_PR_D = ['ILAMSIZ_KAMBIYO', 'ILAMSIZ_FATURA', 'KIRA', 'TAHLIYE'];

const takipTuruCodes = new Set(TAKIP_TURU_CATALOG.map((t) => t.code));
const mahiyetCodes = new Set(MAHIYET_TIPI_CATALOG.map((m) => m.code));

describe('lookup-catalog contract', () => {
  describe('Katman 1 — frontend takipTuru kodları ⊆ katalog', () => {
    it.each(FRONTEND_CONTRACT.takipTuru)('katalog %s takip türünü içerir', (code) => {
      expect(takipTuruCodes.has(code)).toBe(true);
    });
  });

  describe('Katman 2 — frontend mahiyet kodları ⊆ katalog', () => {
    it.each(FRONTEND_CONTRACT.mahiyet)('katalog %s mahiyet tipini içerir', (code) => {
      expect(mahiyetCodes.has(code)).toBe(true);
    });
  });

  describe('Katman 3 — TAKIP_TURU_DEFAULTS bütünlüğü', () => {
    it('her default anahtarı geçerli bir takip türü kodudur', () => {
      for (const key of Object.keys(TAKIP_TURU_DEFAULTS)) {
        expect(takipTuruCodes.has(key)).toBe(true);
      }
    });

    it('her takip türünün bir default kaydı vardır (eksiksizlik)', () => {
      for (const code of takipTuruCodes) {
        expect(TAKIP_TURU_DEFAULTS[code]).toBeDefined();
      }
    });

    it('her default mahiyetKodu katalogda geçerlidir', () => {
      for (const def of Object.values(TAKIP_TURU_DEFAULTS)) {
        expect(mahiyetCodes.has(def.mahiyetKodu)).toBe(true);
      }
    });
  });

  describe('Katman 4 — frontend map anahtarları ⊆ katalog', () => {
    it.each(FRONTEND_CONTRACT.takipTuruMahiyetMapKeysCanonical)('kanonik map anahtarı %s katalogda', (code) => {
      expect(takipTuruCodes.has(code)).toBe(true);
    });

    it('ölü map anahtarları katalogda DEĞİLDİR (PR-D bunları frontend map\'ten kaldıracak)', () => {
      for (const dead of DEAD_MAP_KEYS_TO_REMOVE_IN_PR_D) {
        expect(takipTuruCodes.has(dead)).toBe(false);
      }
    });
  });

  describe('Katalog iç tutarlılık', () => {
    it('takip türü kodları benzersizdir', () => {
      expect(TAKIP_TURU_CATALOG.length).toBe(takipTuruCodes.size);
    });
    it('mahiyet kodları benzersizdir', () => {
      expect(MAHIYET_TIPI_CATALOG.length).toBe(mahiyetCodes.size);
    });
    it('beklenen kanonik sayılar: 11 takip türü, 18 mahiyet tipi', () => {
      expect(TAKIP_TURU_CATALOG.length).toBe(11);
      expect(MAHIYET_TIPI_CATALOG.length).toBe(18);
    });
  });
});
