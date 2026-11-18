import { ConflictException } from '@nestjs/common';
import { CASE_DUE_CHANGE_APPROVAL_INTENT_VERSION } from '../../office-approval/office-approval-domain-sync.service';
import {
  CASE_DUE_CHANGE_INTENT_VERSION,
  CASE_DUE_CREATE_FIELDS,
  CASE_DUE_CREATE_OPERATION,
  buildCaseDueCreateIntent,
  caseDueCreateDtoFromIntent,
  caseDueCreateIdempotencyKey,
  isCaseDueChangeIntent,
  readCaseDueCreateIntent,
} from '../due-change-approval';
import { DueType } from '../dto/case.dto';

/**
 * Due ekleme talebinin kayıtlı niyeti — saf sözleşme (owner kararı 19.11.2026). Değerler SENTETİK.
 */
describe('Due ekleme talebi — kayıtlı niyet sözleşmesi', () => {
  const dto = { type: DueType.PRINCIPAL, amount: 1000, dueDate: '2025-01-15', description: 'Sentetik asıl alacak' } as any;
  const target = (intent: unknown, overrides: Record<string, unknown> = {}) => ({
    targetType: 'CLAIM_ITEM_CASE',
    targetRef: 'case-1',
    savedIntent: intent,
    ...overrides,
  });

  it('niyet sürümü onay altyapısındaki yerel sabitle AYNIDIR (iki modül birbirini içe aktarmaz)', () => {
    expect(CASE_DUE_CHANGE_INTENT_VERSION).toBe(CASE_DUE_CHANGE_APPROVAL_INTENT_VERSION);
    expect(CASE_DUE_CHANGE_INTENT_VERSION).toBe('CASE_DUE_CHANGE_V1');
  });

  it('niyet yalnız createDue\'nun okuduğu alanları taşır; para birimi çözülmüş değerdir; tanımsız alan girmez', () => {
    const intent = buildCaseDueCreateIntent(
      'case-1',
      { ...dto, isPrimary: true, ilamMahkeme: 'niyete girmemeli', kdvAmount: 12, interestRate: undefined },
      'TRY',
    );
    expect(intent).toEqual({
      version: 'CASE_DUE_CHANGE_V1',
      operation: CASE_DUE_CREATE_OPERATION,
      caseId: 'case-1',
      due: { type: 'PRINCIPAL', description: 'Sentetik asıl alacak', amount: 1000, dueDate: '2025-01-15', currency: 'TRY', isPrimary: true },
      reason: expect.stringContaining('iki kişi onayı'),
    });
    expect(Object.keys(intent.due).every((key) => (CASE_DUE_CREATE_FIELDS as readonly string[]).includes(key))).toBe(true);
    expect(isCaseDueChangeIntent(intent)).toBe(true);
  });

  it('açık null değer (ör. faiz türü yok) niyette KORUNUR; istek gövdesine aynen geri döner', () => {
    const intent = buildCaseDueCreateIntent('case-1', { ...dto, interestTypeCode: null, interestRate: null, interestAccrualStatus: 'NO_INTEREST', noInterestReason: 'sentetik gerekçe' }, 'TRY');
    expect(intent.due).toMatchObject({ interestTypeCode: null, interestRate: null, interestAccrualStatus: 'NO_INTEREST' });
    expect(caseDueCreateDtoFromIntent(intent)).toEqual(intent.due);
    expect(readCaseDueCreateIntent(target(intent))).toBe(intent);
  });

  it('skaler olmayan alan niyete alınmaz (talep açılmaz)', () => {
    expect(() => buildCaseDueCreateIntent('case-1', { ...dto, description: { $ne: null } }, 'TRY')).toThrow(ConflictException);
    expect(() => buildCaseDueCreateIntent('case-1', { ...dto, amount: Number.NaN }, 'TRY')).toThrow(ConflictException);
  });

  it('yinelenen talep anahtarı içerikle belirlenir: aynı içerik aynı anahtar, farklı içerik / dosya farklı anahtar', () => {
    const base = buildCaseDueCreateIntent('case-1', dto, 'TRY');
    const sameDifferentOrder = buildCaseDueCreateIntent('case-1', { description: dto.description, dueDate: dto.dueDate, amount: dto.amount, type: dto.type } as any, 'TRY');
    expect(caseDueCreateIdempotencyKey(sameDifferentOrder)).toBe(caseDueCreateIdempotencyKey(base));
    expect(caseDueCreateIdempotencyKey(base)).toMatch(/^case-due-create:case-1:[0-9a-f]{16,}$/);
    expect(caseDueCreateIdempotencyKey(buildCaseDueCreateIntent('case-1', { ...dto, amount: 1500 }, 'TRY'))).not.toBe(caseDueCreateIdempotencyKey(base));
    expect(caseDueCreateIdempotencyKey(buildCaseDueCreateIntent('case-2', dto, 'TRY'))).not.toBe(caseDueCreateIdempotencyKey(base));
  });

  it.each([
    ['başka sürüm', (i: any) => ({ ...i, version: 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1' }), {}],
    ['başka işlem', (i: any) => ({ ...i, operation: 'DUE_DELETE' }), {}],
    ['dosya yok', (i: any) => ({ ...i, caseId: '' }), {}],
    ['hedef başka dosya', (i: any) => i, { targetRef: 'case-2' }],
    ['hedef türü kalem', (i: any) => i, { targetType: 'CLAIM_ITEM' }],
    ['içerik yok', (i: any) => ({ ...i, due: null }), {}],
    ['içerik dizi', (i: any) => ({ ...i, due: [] }), {}],
    ['beklenmeyen alan', (i: any) => ({ ...i, due: { ...i.due, status: 'ACTIVE' } }), {}],
    ['skaler olmayan değer', (i: any) => ({ ...i, due: { ...i.due, description: { x: 1 } } }), {}],
    ['tür yok', (i: any) => ({ ...i, due: { ...i.due, type: '' } }), {}],
    ['tutar sayı değil', (i: any) => ({ ...i, due: { ...i.due, amount: '1000' } }), {}],
    ['vade yok', (i: any) => ({ ...i, due: { ...i.due, dueDate: null } }), {}],
    ['para birimi yok', (i: any) => ({ ...i, due: { ...i.due, currency: undefined } }), {}],
  ] as Array<[string, (intent: any) => unknown, Record<string, unknown>]>)(
    'onay yürütmesi bozuk niyeti reddeder (kapalı-hata): %s',
    (_label, mutate, overrides) => {
      const intent = buildCaseDueCreateIntent('case-1', dto, 'TRY');
      const error = (() => {
        try {
          readCaseDueCreateIntent(target(mutate(intent), overrides));
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(expect.objectContaining({ code: 'DUE_CREATE_INTENT_INVALID' }));
    },
  );

  it('başka niyet aileleri bu aileden sayılmaz', () => {
    for (const other of [null, undefined, 'x', {}, { version: 'CLAIM_ITEM_LIABILITY_SELECTION_V1' }, { version: 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1' }]) {
      expect(isCaseDueChangeIntent(other)).toBe(false);
    }
  });
});
