import { Prisma } from '@prisma/client';
import {
  DUE_BOUND_CLAIM_ITEM_CLOSED,
  DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL,
  DUE_CLAIM_ITEM_BUSY,
  DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL,
  DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL,
  DUE_WRITE_FORBIDDEN,
  DueBoundClaimItemClosedException,
  DueChangeRequiresClaimItemApprovalException,
  DueClaimItemBusyException,
  DueDeleteRequiresClaimItemCancelException,
  DueEditBlockedByPendingClaimItemApprovalException,
  DueWriteForbiddenException,
  describeDueHighImpactFields,
  isRowLockNotAvailable,
  planDueCanonicalUpdate,
  sameDecimal,
  sameInstant,
  type BoundClaimItemForCanonicalGuard,
  type DueRowForCanonicalGuard,
} from '../due-canonical-item-guard';
import { DueType, type UpdateDueDto } from '../dto/case.dto';

/**
 * Due güncelleme isteğinin bağlı kanonik kaleme etkisi — SAF karar kuralı (owner kararı 18.11.2026, K1 / K2).
 * Değerler SENTETİK. HTTP + veritabanı davranışı: due-canonical-item-guard.http.db-gated.integration.spec.ts.
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

/** Onay yoluyla "faiz işler + başlangıç" yazılmış kalem: başlangıç tarihi yalnız kalemde, Due'da boş. */
function item(overrides: Partial<BoundClaimItemForCanonicalGuard> = {}): BoundClaimItemForCanonicalGuard {
  return {
    id: 'claim-1',
    itemType: 'PRINCIPAL',
    amount: new Prisma.Decimal('1000.00'),
    demandedAmount: new Prisma.Decimal('1000.00'),
    currency: 'TRY',
    dueDate: d('2025-01-15'),
    description: 'Sentetik asıl alacak',
    sortOrder: 1,
    interestType: 'YASAL',
    interestTypeCode: 'LEGAL_3095',
    interestRate: null,
    interestStartDate: d('2025-03-10'),
    interestEndDate: null,
    interestAccrualStatus: 'ACCRUES',
    noInterestReason: null,
    ...overrides,
  };
}

const plan = (
  request: Partial<UpdateDueDto> & Record<string, unknown>,
  options: { due?: DueRowForCanonicalGuard; item?: BoundClaimItemForCanonicalGuard | null; interest?: Record<string, unknown> } = {},
) =>
  planDueCanonicalUpdate({
    due: options.due ?? due(),
    claimItem: options.item === undefined ? item() : options.item,
    request: request as UpdateDueDto,
    normalizedInterest: options.interest ?? {},
  });

describe('planDueCanonicalUpdate — Due isteğinin bağlı kanonik kaleme etkisi', () => {
  it('gönderilmeyen alan değişmez: yalnız açıklama → ihlal yok, kaleme yalnız açıklama yansır', () => {
    expect(plan({ description: 'Yeni açıklama' })).toEqual({ highImpactFields: [], claimItemPatch: { description: 'Yeni açıklama' } });
  });

  it('boş istek → ihlal yok, kaleme yazım yok', () => {
    expect(plan({})).toEqual({ highImpactFields: [], claimItemPatch: {} });
  });

  it.each([
    ['tutar', { amount: 1500 }, {}, ['amount']],
    ['vade', { dueDate: '2025-02-20' }, {}, ['dueDate']],
    ['para birimi', { currency: 'USD' }, {}, ['currency']],
    ['kalem türünü değiştiren tür', { type: DueType.EXPENSE }, {}, ['type']],
    ['kalem üretmeyen tür (iptal gerektirir)', { type: DueType.NAFAKA }, {}, ['type']],
    ['faiz başlangıç tarihi', { interestStartDate: '2024-02-01' }, {}, ['interestStartDate']],
    ['faiz bitiş tarihi', { interestEndDate: '2025-12-31' }, {}, ['interestEndDate']],
    ['faiz durumu', { interestAccrualStatus: 'UNKNOWN' }, {}, ['interestAccrualStatus']],
    ['faizsizlik gerekçesi', { noInterestReason: 'Sentetik gerekçe' }, {}, ['noInterestReason']],
    [
      'faiz türü',
      { interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2' },
      { interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2', interestType: 'TICARI', interestRate: null },
      ['interestTypeCode', 'interestType'],
    ],
    [
      'faiz oranı',
      { interestTypeCode: 'COMMERCIAL_FIXED', interestRate: 18 },
      { interestTypeCode: 'COMMERCIAL_FIXED', interestType: 'SABIT', interestRate: 18 },
      ['interestTypeCode', 'interestType', 'interestRate'],
    ],
  ] as Array<[string, Record<string, unknown>, Record<string, unknown>, string[]]>)(
    'yüksek etkili değişiklik gerektiren istek ihlaldir — %s',
    (_label, request, interest, fields) => {
      const result = plan(request, { interest });
      expect(result.highImpactFields).toEqual(fields);
    },
  );

  it('ihlal olduğunda birlikte gelen düşük etkili alan plana yansısa da çağıran yazmadan reddeder (ihlal listesi dolu)', () => {
    const result = plan({ description: 'Kısmi yazılmamalı', amount: 1500 });
    expect(result.highImpactFields).toEqual(['amount']);
  });

  it('aynı değerin gönderilmesi değişiklik sayılmaz: sayı, ondalık, tarih biçimi, tür, para birimi', () => {
    const result = plan(
      {
        type: DueType.PRINCIPAL,
        description: 'Sentetik asıl alacak',
        amount: 1000,
        dueDate: '2025-01-15T00:00:00.000Z',
        currency: 'TRY',
        sortOrder: 1,
      },
      { interest: { interestTypeCode: 'LEGAL_3095', interestType: 'YASAL', interestRate: null } },
    );
    expect(result).toEqual({ highImpactFields: [], claimItemPatch: {} });
  });

  it('Due\'daki değeri yineleyen alan, kalem farklı olsa da yok sayılır (kaleme dokunulmaz)', () => {
    // Kalem tutarı onayla 1200 yapılmış; Due 1000 kalmış. Eski ekran yükü Due'daki 1000'i yineler.
    const approved = item({ amount: new Prisma.Decimal('1200.00'), demandedAmount: new Prisma.Decimal('1200.00') });
    expect(plan({ amount: 1000 }, { item: approved })).toEqual({ highImpactFields: [], claimItemPatch: {} });
  });

  it('Due\'dan farklı ama kalemdeki değere eşit istek ihlal değildir (yalnız Due yazılır)', () => {
    const approved = item({ amount: new Prisma.Decimal('1200.00'), demandedAmount: new Prisma.Decimal('1200.00') });
    expect(plan({ amount: 1200, interestStartDate: '2025-03-10' }, { item: approved }).highImpactFields).toEqual([]);
    // Kalemin iki tutar alanından biri bile farklıysa ihlaldir.
    const mirrorDrift = item({ amount: new Prisma.Decimal('1200.00'), demandedAmount: new Prisma.Decimal('1100.00') });
    expect(plan({ amount: 1200 }, { item: mirrorDrift }).highImpactFields).toEqual(['amount']);
  });

  it('kalem türünü değiştirmeyen Due türü ihlal değildir (asıl alacak → kira / aidat / prim)', () => {
    for (const type of [DueType.KIRA, DueType.AIDAT, DueType.PRIM]) {
      expect(plan({ type }).highImpactFields).toEqual([]);
    }
  });

  it('faiz durumu ve gerekçesi Due\'da saklanmaz: kalemdeki değerle aynıysa ihlal değil, farklıysa ihlal', () => {
    expect(plan({ interestAccrualStatus: 'ACCRUES' }).highImpactFields).toEqual([]);
    const noInterest = item({ interestAccrualStatus: 'NO_INTEREST', noInterestReason: 'Sentetik gerekçe', interestType: null, interestTypeCode: null, interestStartDate: null });
    const dueNoInterest = due({ interestType: null, interestTypeCode: null });
    const same = plan(
      { interestAccrualStatus: 'NO_INTEREST', noInterestReason: '  Sentetik gerekçe ' },
      { item: noInterest, due: dueNoInterest, interest: { interestTypeCode: null, interestType: null, interestRate: null } },
    );
    expect(same.highImpactFields).toEqual([]);
    expect(plan({ noInterestReason: 'Başka gerekçe' }, { item: noInterest, due: dueNoInterest }).highImpactFields).toEqual(['noInterestReason']);
  });

  it('boş faiz tarihi ve boş vade "gönderilmedi" sayılır: onaylı başlangıç tarihi silinemez', () => {
    expect(plan({ interestStartDate: '', interestEndDate: null, dueDate: '' } as never)).toEqual({ highImpactFields: [], claimItemPatch: {} });
  });

  it('düşük etkili alanlar yalnız değiştiyse kaleme yansır', () => {
    expect(plan({ description: 'Sentetik asıl alacak', sortOrder: 1 }).claimItemPatch).toEqual({});
    expect(plan({ sortOrder: 4 }).claimItemPatch).toEqual({ sortOrder: 4 });
    expect(plan({ description: null } as never).claimItemPatch).toEqual({ description: null });
    // Due'dan farklı ama kalemle aynı açıklama: kaleme yazım yok.
    expect(plan({ description: 'Kalemdeki metin' }, { item: item({ description: 'Kalemdeki metin' }) }).claimItemPatch).toEqual({});
  });

  it('bağlı kanonik kalem yoksa (nafaka) plan boştur: Due kendi alanlarıyla güncellenir', () => {
    expect(plan({ amount: 9999, dueDate: '2030-01-01', description: 'x' }, { item: null })).toEqual({ highImpactFields: [], claimItemPatch: {} });
  });
});

describe('karşılaştırma yardımcıları', () => {
  it('sameDecimal: sütun ölçeğinde (2 hane) karşılaştırır; boş değer yalnız boşa eşittir', () => {
    expect(sameDecimal(1000, new Prisma.Decimal('1000.00'))).toBe(true);
    expect(sameDecimal('1000.004', 1000)).toBe(true);
    expect(sameDecimal(1000.01, 1000)).toBe(false);
    expect(sameDecimal(null, null)).toBe(true);
    expect(sameDecimal(null, 0)).toBe(false);
    expect(sameDecimal(undefined, null)).toBe(true);
  });

  it('sameInstant: aynı an eşittir; boş değer yalnız boşa eşittir', () => {
    expect(sameInstant('2025-01-15', d('2025-01-15'))).toBe(true);
    expect(sameInstant('2025-01-15T00:00:00.000Z', d('2025-01-15'))).toBe(true);
    expect(sameInstant('2025-01-16', d('2025-01-15'))).toBe(false);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant('', null)).toBe(true);
    expect(sameInstant(null, d('2025-01-15'))).toBe(false);
  });
});

describe('ret sözleşmeleri', () => {
  it('yüksek etkili değişiklik reddi: 409 + kod + alanlar + kalem ucuna yönlendirme', () => {
    const error = new DueChangeRequiresClaimItemApprovalException('claim-1', ['amount', 'dueDate']);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(expect.objectContaining({
      code: DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL,
      claimItemId: 'claim-1',
      fields: ['amount', 'dueDate'],
      canonicalAction: { method: 'PUT', path: '/claim-items/claim-1' },
    }));
    const message = (error.getResponse() as { message: string }).message;
    expect(message).toContain('tutar, vade tarihi');
    expect(message).toContain('Alacak Kalemleri (Kanonik)');
    expect(message).toContain('Hiçbir kayıt değiştirilmedi');
  });

  it('alan adları kullanıcı diliyle ve yinelenmeden yazılır', () => {
    expect(describeDueHighImpactFields(['interestTypeCode', 'interestType', 'interestRate'])).toBe('faiz türü, faiz oranı');
  });

  it('kalem satırı meşgul reddi: 409 + kod + yeniden deneme iletisi', () => {
    const busy = new DueClaimItemBusyException('claim-1');
    expect([busy.getStatus(), busy.getResponse()]).toEqual([
      409,
      expect.objectContaining({ code: DUE_CLAIM_ITEM_BUSY, claimItemId: 'claim-1', message: expect.stringContaining('yeniden deneyin') }),
    ]);
  });

  it.each([
    [{ code: 'P2010', meta: { code: '55P03', message: 'could not obtain lock on row in relation "ClaimItem"' } }, true],
    [{ code: '55P03' }, true],
    [new Error('ERROR: could not obtain lock on row in relation "ClaimItem"'), true],
    [{ code: 'P2010', meta: { code: '40P01', message: 'deadlock detected' } }, false],
    [new Error('connection reset'), false],
    [null, false],
    ['55P03', false],
  ] as Array<[unknown, boolean]>)('isRowLockNotAvailable(%j) → %s', (error, expected) => {
    expect(isRowLockNotAvailable(error)).toBe(expected);
  });

  it.each([
    ['CANCELLED', 'iptal edilmiş', true],
    ['WAIVED', 'feragat edilmiş', false],
    ['COLLECTED', 'tahsil edilmiş', false],
    ['BILINMEYEN', 'kapalı', false],
  ] as Array<[string, string, boolean]>)(
    'kapalı kalem reddi (%s): 409 + kod + durum; "onaya gönder" yönlendirmesi yok',
    (status, label, deletable) => {
      const closed = new DueBoundClaimItemClosedException('claim-1', status);
      const body = closed.getResponse() as { code: string; message: string; claimItemStatus: string; canonicalAction?: unknown };
      expect([closed.getStatus(), body.code, body.claimItemStatus]).toEqual([409, DUE_BOUND_CLAIM_ITEM_CLOSED, status]);
      expect(body.message).toContain(label);
      expect(body.message).toContain('Hiçbir kayıt değiştirilmedi.');
      expect(body.message).not.toContain('Onaya Gönder');
      expect(body.canonicalAction).toBeUndefined();
      // Yalnız iptal edilmiş kalemde dosya kalemi silinebilir; ileti bunu yalnız o durumda söyler.
      expect(body.message.includes('silinebilir')).toBe(deletable);
    },
  );

  it('silme, bekleyen onay ve yetki retleri kendi kodlarını taşır', () => {
    const remove = new DueDeleteRequiresClaimItemCancelException('claim-1');
    expect([remove.getStatus(), (remove.getResponse() as { code: string }).code]).toEqual([409, DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL]);
    expect(remove.getResponse()).toEqual(expect.objectContaining({ canonicalAction: { method: 'DELETE', path: '/claim-items/claim-1' } }));
    const pending = new DueEditBlockedByPendingClaimItemApprovalException('claim-1');
    expect([pending.getStatus(), (pending.getResponse() as { code: string }).code]).toEqual([409, DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL]);
    const forbidden = new DueWriteForbiddenException('OBJECT_PERMISSION_DENIED');
    expect([forbidden.getStatus(), forbidden.getResponse()]).toEqual([
      403,
      expect.objectContaining({ code: DUE_WRITE_FORBIDDEN, reasonCode: 'OBJECT_PERMISSION_DENIED' }),
    ]);
  });
});
