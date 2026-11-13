import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { ClaimItemType as PrismaClaimItemType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DueDto, DueType } from '../../case/dto/case.dto';
import { buildClaimItemData, mapDueTypeToClaimItemType } from '../../case/due-to-claim-item.mapper';
import {
  ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH,
  AttorneyFeeBasis,
  assertAttorneyFeeBasisMatchesItemType,
  effectiveField,
} from '../attorney-fee-basis';
import { CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS, CLAIM_ITEM_LOW_IMPACT_USER_FIELDS } from '../claim-item-approval.constants';
import { CreateClaimItemDto, UpdateClaimItemDto } from '../dto/claim-item.dto';

/**
 * Vekâlet ücretinin hukuki kaynağı — yapısal ayrım (owner K1, 13.11.2026). SAF testler (DB yok).
 * Tutarlar SENTETİK.
 */
describe('attorneyFeeBasis — tür güvenli, açık, yalnız ATTORNEY_FEE', () => {
  const expectMismatch = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ code: ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH });
      return;
    }
    throw new Error('400 bekleniyordu');
  };

  it('ATTORNEY_FEE kalemde iki değer ve boş kabul; başka türde dolu değer 400', () => {
    for (const basis of [AttorneyFeeBasis.JUDGMENT_AWARDED, AttorneyFeeBasis.ENFORCEMENT_TARIFF, null, undefined]) {
      expect(() => assertAttorneyFeeBasisMatchesItemType('ATTORNEY_FEE', basis)).not.toThrow();
    }
    for (const itemType of ['PRINCIPAL', 'EXPENSE', 'FEE', 'YARGILAMA_GIDERI', 'OTHER', null, undefined]) {
      expect(() => assertAttorneyFeeBasisMatchesItemType(itemType, null)).not.toThrow();
      expectMismatch(() => assertAttorneyFeeBasisMatchesItemType(itemType, AttorneyFeeBasis.JUDGMENT_AWARDED));
    }
  });

  it('etkin değer: yamadaki alan (null dahil) mevcut kaydı ezer; yoksa mevcut kalır', () => {
    const current = { itemType: 'ATTORNEY_FEE', attorneyFeeBasis: 'JUDGMENT_AWARDED' };
    expect(effectiveField({}, current, 'attorneyFeeBasis')).toBe('JUDGMENT_AWARDED');
    expect(effectiveField({ attorneyFeeBasis: null }, current, 'attorneyFeeBasis')).toBeNull();
    expect(effectiveField({ itemType: 'EXPENSE' }, current, 'itemType')).toBe('EXPENSE');
    // Tür değişip kaynak kalırsa uyumsuzluk yakalanır
    expectMismatch(() => assertAttorneyFeeBasisMatchesItemType(
      effectiveField({ itemType: 'EXPENSE' }, current, 'itemType'),
      effectiveField({ itemType: 'EXPENSE' }, current, 'attorneyFeeBasis'),
    ));
  });

  it('TS enum değerleri Prisma şemasıyla aynı (sözlük kayması yok)', () => {
    expect(Object.values(AttorneyFeeBasis).sort()).toEqual(['ENFORCEMENT_TARIFF', 'JUDGMENT_AWARDED']);
    expect(PrismaClaimItemType.ATTORNEY_FEE).toBe('ATTORNEY_FEE');
  });

  it('yüksek etkili alan: kullanıcı yolunda onay kapısına gider (düşük etkili DEĞİL)', () => {
    expect(CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS).toContain('attorneyFeeBasis');
    expect(CLAIM_ITEM_LOW_IMPACT_USER_FIELDS).not.toContain('attorneyFeeBasis');
  });

  it('DTO sınırı: geçerli değer kabul, bilinmeyen değer 400 (create / update / Due)', async () => {
    const errors = async (cls: new () => object, body: Record<string, unknown>) =>
      (await validate(plainToInstance(cls, body) as object)).map((e) => e.property);

    const create = { caseId: 'c1', itemType: 'ATTORNEY_FEE', amount: 1000 };
    expect(await errors(CreateClaimItemDto, { ...create, attorneyFeeBasis: 'JUDGMENT_AWARDED' })).toEqual([]);
    expect(await errors(CreateClaimItemDto, { ...create, attorneyFeeBasis: 'ILAM' })).toEqual(['attorneyFeeBasis']);
    expect(await errors(UpdateClaimItemDto, { attorneyFeeBasis: 'ENFORCEMENT_TARIFF' })).toEqual([]);
    expect(await errors(UpdateClaimItemDto, { attorneyFeeBasis: null })).toEqual([]);
    expect(await errors(UpdateClaimItemDto, { attorneyFeeBasis: 'judgment_awarded' })).toEqual(['attorneyFeeBasis']);
    const due = { type: 'VEKALET_UCRETI', amount: 1000, dueDate: '2025-01-10' };
    expect(await errors(DueDto, { ...due, attorneyFeeBasis: 'JUDGMENT_AWARDED' })).toEqual([]);
    expect(await errors(DueDto, { ...due, attorneyFeeBasis: 'TAKIP' })).toEqual(['attorneyFeeBasis']);
  });

  it('Due → ClaimItem: VEKALET_UCRETI açık değerle taşınır; verilmezse alan YOK (NULL); başka türde 400', () => {
    const vu: DueDto = { type: DueType.VEKALET_UCRETI, amount: 1000, dueDate: '2025-01-10', description: 'İLAM VEKALET ÜCRETİ' };
    const vuType = mapDueTypeToClaimItemType(DueType.VEKALET_UCRETI)!;
    expect(vuType).toBe('ATTORNEY_FEE');

    expect(buildClaimItemData('t1', 'c1', { ...vu, attorneyFeeBasis: AttorneyFeeBasis.JUDGMENT_AWARDED }, vuType))
      .toMatchObject({ itemType: 'ATTORNEY_FEE', attorneyFeeBasis: 'JUDGMENT_AWARDED' });
    // Açıklama "İLAM …" dese de kaynak çıkarılmaz
    expect(buildClaimItemData('t1', 'c1', vu, vuType)).not.toHaveProperty('attorneyFeeBasis');

    const yg: DueDto = { type: DueType.YARGILAMA_GIDERI, amount: 250, dueDate: '2025-01-10' };
    const ygType = mapDueTypeToClaimItemType(DueType.YARGILAMA_GIDERI)!;
    expect(buildClaimItemData('t1', 'c1', yg, ygType)).not.toHaveProperty('attorneyFeeBasis');
    expectMismatch(() => buildClaimItemData('t1', 'c1', { ...yg, attorneyFeeBasis: AttorneyFeeBasis.JUDGMENT_AWARDED }, ygType));
  });
});
