import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DUE_CHANGE_PENDING_CONFLICT,
  DUE_CHANGE_STALE,
  DueChangePendingConflictException,
  DueChangeStaleException,
  planDueOnlyEffectiveChange,
  type BoundClaimItemForCanonicalGuard,
  type DueRowForCanonicalGuard,
} from '../due-canonical-item-guard';
import {
  CASE_DUE_CHANGE_INTENT_VERSION,
  CASE_DUE_UPDATE_FIELDS,
  buildCaseDueDeleteIntent,
  buildCaseDueUpdateIntent,
  caseDueChangeOperation,
  caseDueDeleteIdempotencyKey,
  caseDueEffectiveSnapshot,
  caseDueStateDigest,
  caseDueUpdateComparable,
  caseDueUpdateIdempotencyKey,
  readCaseDueDeleteIntent,
  readCaseDueUpdateIntent,
} from '../due-change-approval';
import { DueType, type UpdateDueDto } from '../dto/case.dto';

/**
 * Kaleme ULAŞMAYAN ama Due satırından okuyan mali / hukuki çıktıyı değiştiren Due değişiklikleri — SAF karar kuralı ve
 * kayıtlı niyet sözleşmesi (owner kararı 19.11.2026). Değerler SENTETİK. HTTP + veritabanı davranışı:
 * due-change-approval.http.db-gated.integration.spec.ts (C ve D bölümleri).
 */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function due(overrides: Partial<DueRowForCanonicalGuard> = {}): DueRowForCanonicalGuard {
  return {
    type: DueType.PRINCIPAL,
    description: 'Sentetik asıl alacak',
    amount: new Prisma.Decimal('1000.00'),
    dueDate: d('2025-01-15'),
    currency: 'TRY',
    interestType: 'YASAL',
    interestTypeCode: 'LEGAL_3095',
    interestRate: null,
    interestStartDate: null,
    interestEndDate: null,
    sortOrder: 1,
    ...overrides,
  };
}

const boundItem = { id: 'claim-1', itemType: 'PRINCIPAL' } as unknown as BoundClaimItemForCanonicalGuard;
const plan = (
  request: Partial<UpdateDueDto>,
  options: { claimItem?: BoundClaimItemForCanonicalGuard | null; row?: DueRowForCanonicalGuard; interest?: Record<string, unknown> } = {},
) =>
  planDueOnlyEffectiveChange({
    due: options.row ?? due(),
    claimItem: options.claimItem === undefined ? boundItem : options.claimItem,
    request: request as UpdateDueDto,
    normalizedInterest: (options.interest ?? {}) as never,
  });

describe('Kaleme ulaşmayan etkili Due değişikliği — karar kuralı', () => {
  it('tür değişikliği (alt tür) bağlı kalemli Due\'da da onaya tabidir; aynı tür değişiklik sayılmaz', () => {
    expect(plan({ type: DueType.KIRA })).toEqual(['type']);
    expect(plan({ type: DueType.PRIM })).toEqual(['type']);
    expect(plan({ type: DueType.PRINCIPAL })).toEqual([]);
  });

  it('bağlı kalemli Due\'da tür DIŞINDAKİ alanlar burada onaya bağlanmaz (kalem planı karar verir: yakınsama ya da 409)', () => {
    expect(plan({ amount: 1200, currency: 'USD', dueDate: '2025-02-02', interestStartDate: '2025-03-10', interestEndDate: '2025-12-31' }, { interest: { interestTypeCode: 'COMMERCIAL', interestType: 'TICARI', interestRate: 12 } })).toEqual([]);
  });

  it('bağlı kalemi OLMAYAN Due\'da tutar, para birimi, vade ve faiz alanları onaya tabidir', () => {
    const row = due({ type: DueType.NAFAKA, interestType: null, interestTypeCode: null });
    expect(plan({ amount: 1200 }, { claimItem: null, row })).toEqual(['amount']);
    expect(plan({ currency: 'USD' }, { claimItem: null, row })).toEqual(['currency']);
    expect(plan({ dueDate: '2025-02-02' }, { claimItem: null, row })).toEqual(['dueDate']);
    expect(plan({ interestStartDate: '2025-03-10', interestEndDate: '2025-12-31' }, { claimItem: null, row })).toEqual(['interestStartDate', 'interestEndDate']);
    expect(plan({}, { claimItem: null, row, interest: { interestTypeCode: 'LEGAL_3095', interestType: 'YASAL', interestRate: null } })).toEqual(['interestTypeCode', 'interestType']);
    expect(plan({}, { claimItem: null, row, interest: { interestRate: 9 } })).toEqual(['interestRate']);
  });

  it('aynı değerin gönderilmesi değişiklik sayılmaz (sayı / tarih biçimi); boş tarih "gönderilmedi"dir', () => {
    const row = due({ type: DueType.NAFAKA });
    expect(plan({ amount: 1000.0, currency: 'TRY', dueDate: '2025-01-15T00:00:00.000Z', interestStartDate: '', interestEndDate: undefined }, { claimItem: null, row })).toEqual([]);
    expect(plan({}, { claimItem: null, row, interest: { interestTypeCode: 'LEGAL_3095', interestType: 'YASAL', interestRate: null } })).toEqual([]);
  });

  it('açıklayıcı alanlar hiçbir durumda onaya bağlanmaz', () => {
    const descriptive = { description: 'yeni açıklama', sortOrder: 9, isPrimary: true, hasKdv: true, kdvRate: 20, isFinalized: true, finalizationDate: '2025-07-01', finalizationNote: 'not', sourceDocumentNo: 'SENTETIK-1' } as Partial<UpdateDueDto>;
    expect(plan(descriptive)).toEqual([]);
    expect(plan(descriptive, { claimItem: null, row: due({ type: DueType.NAFAKA }) })).toEqual([]);
  });

  it('ret sözleşmeleri: bekleyen farklı talep ve bayat talep 409 + kod', () => {
    const conflict = new DueChangePendingConflictException('due-1');
    expect([conflict.getStatus(), conflict.getResponse()]).toEqual([409, expect.objectContaining({ code: DUE_CHANGE_PENDING_CONFLICT, dueId: 'due-1', message: expect.stringContaining('Hiçbir kayıt değiştirilmedi.') })]);
    const stale = new DueChangeStaleException('due-1');
    expect([stale.getStatus(), stale.getResponse()]).toEqual([409, expect.objectContaining({ code: DUE_CHANGE_STALE, dueId: 'due-1', message: expect.stringContaining('yeniden talep edin') })]);
  });
});

describe('Due güncelleme / silme talebi — kayıtlı niyet sözleşmesi', () => {
  const row = { ...due(), id: 'due-1' };
  const target = (intent: unknown, overrides: Record<string, unknown> = {}) => ({ targetType: 'CLAIM_ITEM_CASE', targetRef: 'case-1', savedIntent: intent, ...overrides });

  it('durum özeti yalnız etkili sütunlardan hesaplanır: açıklayıcı alan değişince aynı, etkili alan değişince farklı', () => {
    const base = caseDueStateDigest(row);
    expect(caseDueStateDigest({ ...row, description: 'başka', sortOrder: 7 } as never)).toBe(base);
    expect(caseDueStateDigest({ ...row, amount: 1000 })).toBe(base); // Decimal 1000.00 ile sayı 1000 aynı durumdur
    for (const changed of [{ type: 'KIRA' }, { amount: 1200 }, { currency: 'USD' }, { dueDate: d('2025-02-02') }, { interestStartDate: d('2025-03-10') }, { interestTypeCode: null }]) {
      expect(caseDueStateDigest({ ...row, ...changed } as never)).not.toBe(base);
    }
    expect(caseDueEffectiveSnapshot(row)).toMatchObject({ type: 'PRINCIPAL', amount: '1000.00', currency: 'TRY', dueDate: '2025-01-15T00:00:00.000Z', interestStartDate: null });
  });

  it('güncelleme niyeti yalnız updateDue\'nun okuduğu alanları taşır; önceki durum ve onaya tabi alanlar kayıtlıdır', () => {
    const intent = buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { type: 'KIRA', description: 'yeni', attorneyFeeBasis: 'niyete girmemeli', amount: undefined }, effectiveFields: ['type'], due: row });
    expect(intent).toEqual({
      version: CASE_DUE_CHANGE_INTENT_VERSION,
      operation: 'DUE_UPDATE',
      caseId: 'case-1',
      dueId: 'due-1',
      patch: { type: 'KIRA', description: 'yeni' },
      effectiveFields: ['type'],
      stateDigest: caseDueStateDigest(row),
      before: caseDueEffectiveSnapshot(row),
      reason: expect.stringContaining('iki kişi onayı'),
    });
    expect(Object.keys(intent.patch).every((key) => (CASE_DUE_UPDATE_FIELDS as readonly string[]).includes(key))).toBe(true);
    expect(readCaseDueUpdateIntent(target(intent))).toBe(intent);
    expect(caseDueChangeOperation(intent)).toBe('DUE_UPDATE');
    expect(() => buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { description: { $ne: 1 } }, effectiveFields: ['type'], due: row })).toThrow(ConflictException);
  });

  it('bir Due için tek bekleyen güncelleme / silme anahtarı; içerik karşılaştırması durum görüntüsünden bağımsız', () => {
    expect([caseDueUpdateIdempotencyKey('due-1'), caseDueDeleteIdempotencyKey('due-1')]).toEqual(['case-due-update:due-1', 'case-due-delete:due-1']);
    const a = buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { type: 'KIRA' }, effectiveFields: ['type'], due: row });
    const sameLater = buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { type: 'KIRA' }, effectiveFields: ['type'], due: { ...row, amount: 1200 } });
    const other = buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { type: 'AIDAT' }, effectiveFields: ['type'], due: row });
    expect(caseDueUpdateComparable(sameLater)).toBe(caseDueUpdateComparable(a));
    expect(caseDueUpdateComparable(other)).not.toBe(caseDueUpdateComparable(a));
  });

  it('silme niyeti önceki durumu ve açıklamayı taşır', () => {
    const intent = buildCaseDueDeleteIntent({ caseId: 'case-1', dueId: 'due-1', due: row });
    expect(intent).toMatchObject({ operation: 'DUE_DELETE', dueId: 'due-1', stateDigest: caseDueStateDigest(row), before: expect.objectContaining({ type: 'PRINCIPAL', amount: '1000.00', description: 'Sentetik asıl alacak' }) });
    expect(readCaseDueDeleteIntent(target(intent))).toBe(intent);
    expect(caseDueChangeOperation(intent)).toBe('DUE_DELETE');
  });

  it.each([
    ['başka işlem', (i: any) => ({ ...i, operation: 'DUE_DELETE' }), {}],
    ['hedef başka dosya', (i: any) => i, { targetRef: 'case-2' }],
    ['hedef türü kalem', (i: any) => i, { targetType: 'CLAIM_ITEM' }],
    ['Due kimliği yok', (i: any) => ({ ...i, dueId: '' }), {}],
    ['durum özeti yok', (i: any) => ({ ...i, stateDigest: null }), {}],
    ['boş değişiklik', (i: any) => ({ ...i, patch: {} }), {}],
    ['beklenmeyen alan', (i: any) => ({ ...i, patch: { ...i.patch, status: 'CANCELLED' } }), {}],
    ['skaler olmayan değer', (i: any) => ({ ...i, patch: { type: { x: 1 } } }), {}],
    ['onaya tabi alan listesi yok', (i: any) => ({ ...i, effectiveFields: [] }), {}],
  ] as Array<[string, (intent: any) => unknown, Record<string, unknown>]>)(
    'onay yürütmesi bozuk güncelleme niyetini reddeder (kapalı-hata): %s',
    (_label, mutate, overrides) => {
      const intent = buildCaseDueUpdateIntent({ caseId: 'case-1', dueId: 'due-1', request: { type: 'KIRA' }, effectiveFields: ['type'], due: row });
      expect(() => readCaseDueUpdateIntent(target(mutate(intent), overrides))).toThrow(ConflictException);
    },
  );

  it('tanınmayan işlem reddedilir', () => {
    expect(() => caseDueChangeOperation({ version: CASE_DUE_CHANGE_INTENT_VERSION, operation: 'DUE_PURGE' })).toThrow(ConflictException);
    expect(() => caseDueChangeOperation(null)).toThrow(ConflictException);
  });
});
