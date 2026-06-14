/**
 * E-G1 testleri — Faiz Türü Kanonik Köprü (interest-type-bridge).
 * Kilitli kararlar: E1 (InterestTypeCode kanonik) · E2 (exhaustive, silent-default YASAK) ·
 * E5 (TS↔Prisma InterestTypeCode parity).
 */

import * as fs from 'fs';
import * as path from 'path';
import { InterestType as PrismaInterestType } from '@prisma/client';
import { InterestTypeCode } from '../../types/domain.types';

/**
 * Prisma `InterestTypeCode` enum'u hiçbir KOLON tarafından kullanılmadığından generated
 * client'a runtime export EDİLMEZ (Prisma kullanılmayan enum'u prune eder). Bu yüzden E5
 * parity'si kaynak-otoritesi olan schema.prisma'dan doğrulanır (drift kilidi).
 */
function readPrismaEnumValues(enumName: string): string[] {
  const schemaPath = path.resolve(__dirname, '../../../../../prisma/schema.prisma');
  const src = fs.readFileSync(schemaPath, 'utf8');
  const m = new RegExp(`enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`).exec(src);
  if (!m) throw new Error(`enum ${enumName} schema.prisma'da bulunamadı`);
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*/, '').trim()) // satır-içi yorumu şerit (CRLF-güvenli)
    .filter((l) => l.length > 0);
}
import {
  mapInterestType,
  mapInterestTypeString,
  tryMapInterestType,
  tryMapInterestTypeString,
  UnsupportedInterestTypeError,
} from '../interest-type-bridge';

describe('interest-type-bridge (E-G1)', () => {
  describe('mapInterestType — STRICT (Prisma enum yüzeyi)', () => {
    it('YASAL → LEGAL_3095', () => {
      expect(mapInterestType(PrismaInterestType.YASAL)).toBe(InterestTypeCode.LEGAL_3095);
    });

    it('TICARI → COMMERCIAL_AVANS_3095_2_2', () => {
      expect(mapInterestType(PrismaInterestType.TICARI)).toBe(
        InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      );
    });

    it('AVANS → COMMERCIAL_AVANS_3095_2_2', () => {
      expect(mapInterestType(PrismaInterestType.AVANS)).toBe(
        InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      );
    });

    it('TEMERRUT → TTK_1530', () => {
      expect(mapInterestType(PrismaInterestType.TEMERRUT)).toBe(InterestTypeCode.TTK_1530);
    });

    it('SABIT → COMMERCIAL_FIXED (sabit ORAN; sabit tutar değil)', () => {
      expect(mapInterestType(PrismaInterestType.SABIT)).toBe(InterestTypeCode.COMMERCIAL_FIXED);
    });

    it('YOKSUN → throw (UNSUPPORTED) ve SESSİZCE LEGAL_3095 OLMAZ', () => {
      expect(() => mapInterestType(PrismaInterestType.YOKSUN)).toThrow(
        UnsupportedInterestTypeError,
      );
      // Hukuki kritik: yoksun kalınan kâr ≠ faiz; default'a düşmediğini açıkça doğrula.
      let captured: unknown;
      try {
        mapInterestType(PrismaInterestType.YOKSUN);
      } catch (e) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(UnsupportedInterestTypeError);
      expect((captured as UnsupportedInterestTypeError).reason).toBe('UNSUPPORTED');
      expect((captured as UnsupportedInterestTypeError).input).toBe('YOKSUN');
    });

    it('Prisma InterestType enum 6 değerinin TAMAMI ele alınır (sessiz boşluk yok)', () => {
      const values = Object.values(PrismaInterestType);
      expect(values.sort()).toEqual(
        ['AVANS', 'SABIT', 'TEMERRUT', 'TICARI', 'YASAL', 'YOKSUN'].sort(),
      );
      // Her değer ya map'lenir ya da bilinçli throw eder — silent default yoktur.
      for (const v of values) {
        const r = tryMapInterestType(v);
        if (v === 'YOKSUN') {
          expect(r.ok).toBe(false);
        } else {
          expect(r.ok).toBe(true);
        }
      }
    });
  });

  describe('mapInterestTypeString — STRICT (string/Due yüzeyi)', () => {
    it('OZEL → CONTRACTUAL (yalnız string yüzeyi)', () => {
      expect(mapInterestTypeString('OZEL')).toBe(InterestTypeCode.CONTRACTUAL);
    });

    it('6 Prisma enum değeri string yoluyla da çalışır (case-insensitive + trim)', () => {
      expect(mapInterestTypeString(' yasal ')).toBe(InterestTypeCode.LEGAL_3095);
      expect(mapInterestTypeString('Ticari')).toBe(InterestTypeCode.COMMERCIAL_AVANS_3095_2_2);
      expect(mapInterestTypeString('SABIT')).toBe(InterestTypeCode.COMMERCIAL_FIXED);
    });

    it('YOKSUN string yolunda da throw (UNSUPPORTED)', () => {
      expect(() => mapInterestTypeString('YOKSUN')).toThrow(UnsupportedInterestTypeError);
    });

    it('bilinmeyen string → throw (UNKNOWN)', () => {
      expect(() => mapInterestTypeString('BILINMEYEN')).toThrow(UnsupportedInterestTypeError);
      expect(() => mapInterestTypeString('')).toThrow(UnsupportedInterestTypeError);
    });
  });

  describe('tryMap* — YUMUŞAK (diagnostic) yol', () => {
    it('geçerli değer → { ok: true, code }', () => {
      expect(tryMapInterestType(PrismaInterestType.YASAL)).toEqual({
        ok: true,
        code: InterestTypeCode.LEGAL_3095,
      });
    });

    it('YOKSUN → { ok: false, reason: UNSUPPORTED }', () => {
      expect(tryMapInterestType(PrismaInterestType.YOKSUN)).toEqual({
        ok: false,
        reason: 'UNSUPPORTED',
        input: 'YOKSUN',
      });
    });

    it('bilinmeyen string → { ok: false, reason: UNKNOWN }', () => {
      expect(tryMapInterestTypeString('XYZ')).toEqual({
        ok: false,
        reason: 'UNKNOWN',
        input: 'XYZ',
      });
    });

    it('OZEL string → { ok: true, CONTRACTUAL }', () => {
      expect(tryMapInterestTypeString('OZEL')).toEqual({
        ok: true,
        code: InterestTypeCode.CONTRACTUAL,
      });
    });
  });

  describe('E5 — TS ↔ Prisma InterestTypeCode parity (schema kaynağı, drift kilidi)', () => {
    it('iki enum değer kümesi BİREBİR eşittir (COMMERCIAL_FIXED dahil)', () => {
      const tsValues = Object.values(InterestTypeCode).sort();
      const prismaValues = readPrismaEnumValues('InterestTypeCode').sort();
      expect(tsValues).toEqual(prismaValues);
    });

    it('COMMERCIAL_FIXED her iki tarafta da vardır', () => {
      expect(Object.values(InterestTypeCode)).toContain('COMMERCIAL_FIXED');
      expect(readPrismaEnumValues('InterestTypeCode')).toContain('COMMERCIAL_FIXED');
    });
  });
});
