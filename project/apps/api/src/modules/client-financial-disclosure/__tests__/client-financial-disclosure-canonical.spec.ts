import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  assertDisclosureReconciliation,
  buildDisclosureSnapshotPayload,
  canonicalDisclosureLines,
  canonicalInstant,
  canonicalMoney,
  disclosureSnapshotHash,
  isSha256Hex,
} from '../client-financial-disclosure-canonical';
import { canonicalJsonStringify } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION,
  ClientFinancialDisclosureError,
} from '../client-financial-disclosure.contract';

/**
 * CLIENT-P2-U03-TRACK-B-I02 — canonical serialization + hash unit suite (SAF, DB'siz).
 * Brief §30'un zorunlu 12 maddesini karşılar.
 */
describe('CLIENT-P2-U03-TRACK-B-I02 — canonical serialization ve hash', () => {
  const BASE = {
    tenantId: 't-1',
    caseId: 'c-1',
    caseClientId: 'cc-1',
    clientId: 'cl-1',
    collectionDispositionId: 'cd-1',
    version: 1,
    currency: 'TRY',
    sourceCollectionId: 'col-1',
    sourceCollectionAmount: '2500.75',
    sourceCollectionDate: new Date('2026-07-01T09:30:00.000Z'),
    dispositionTotalAmount: '2500.75',
    dispositionPostedAt: new Date('2026-07-02T10:00:00.000Z'),
    totalCollected: '2500.75',
    clientNetAmount: '1750.50',
  };

  const rawLines = [
    { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '750.25', sourceDispositionLineId: 'l-b' },
    { type: 'CLIENT_PAYABLE', amount: '1750.50', sourceDispositionLineId: 'l-a' },
  ];

  const build = (over: Partial<typeof BASE> = {}, lines = rawLines) =>
    buildDisclosureSnapshotPayload({
      ...BASE,
      ...over,
      lines: canonicalDisclosureLines(lines),
    });

  // [1] key sırası bağımsızlığı
  it('canonical serialization anahtar sırasından etkilenmez', () => {
    const a = { alpha: 1, beta: { x: 1, y: 2 } };
    const b = { beta: { y: 2, x: 1 }, alpha: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  // [2] aynı payload aynı serialization
  it('aynı payload aynı canonical serialization üretir', () => {
    expect(canonicalJsonStringify(build())).toBe(canonicalJsonStringify(build()));
  });

  // [3] aynı payload aynı hash
  it('aynı payload aynı hash üretir', () => {
    expect(disclosureSnapshotHash(build())).toBe(disclosureSnapshotHash(build()));
    expect(isSha256Hex(disclosureSnapshotHash(build()))).toBe(true);
  });

  // [4] tek finansal alan değişimi hash'i değiştirir
  it('tek bir finansal alan değişikliği hash’i değiştirir', () => {
    const base = disclosureSnapshotHash(build());
    expect(disclosureSnapshotHash(build({ clientNetAmount: '1750.51' }))).not.toBe(base);
    expect(disclosureSnapshotHash(build({ totalCollected: '2500.76' }))).not.toBe(base);
    expect(disclosureSnapshotHash(build({ currency: 'USD' }))).not.toBe(base);
    expect(disclosureSnapshotHash(build({ version: 2 }))).not.toBe(base);
    const changedLine = disclosureSnapshotHash(
      build({}, [
        { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '750.26', sourceDispositionLineId: 'l-b' },
        { type: 'CLIENT_PAYABLE', amount: '1750.50', sourceDispositionLineId: 'l-a' },
      ]),
    );
    expect(changedLine).not.toBe(base);
  });

  // [5] Decimal representation stabil
  it('Decimal gösterimi stabildir ve iki ondalığa sabitlenir', () => {
    expect(canonicalMoney(new Prisma.Decimal('1750.5'))).toBe('1750.50');
    expect(canonicalMoney('1750.500')).toBe('1750.50');
    expect(canonicalMoney(1750.5)).toBe('1750.50');
    expect(canonicalMoney(new Prisma.Decimal('0'))).toBe('0.00');
    // float toplama artığı canonical string'e sızmaz
    expect(canonicalMoney(new Prisma.Decimal('0.1').add(new Prisma.Decimal('0.2')))).toBe('0.30');
    // 2'den fazla ondalik SESSIZCE yuvarlanmaz, REDDEDILIR (§35.16)
    expect(() => canonicalMoney('1750.505')).toThrow(ClientFinancialDisclosureError);
    expect(canonicalMoney('-12.30')).toBe('-12.30');
  });

  // [6] locale bağımsızlığı
  it('locale değişikliği sonucu etkilemez', () => {
    const before = disclosureSnapshotHash(build());
    const original = process.env.LANG;
    try {
      process.env.LANG = 'tr_TR.UTF-8';
      expect(disclosureSnapshotHash(build())).toBe(before);
    } finally {
      if (original === undefined) delete process.env.LANG;
      else process.env.LANG = original;
    }
    // Türkçe locale'de ondalık ayırıcı virgül olur; canonical string nokta taşır.
    expect(canonicalMoney(new Prisma.Decimal('1234.56'))).toBe('1234.56');
  });

  // [7] satır sırası deterministik
  it('satır sırası canonical kurala göre deterministiktir ve sortOrder türetilir', () => {
    const forward = canonicalDisclosureLines(rawLines);
    const reversed = canonicalDisclosureLines([...rawLines].reverse());
    expect(forward).toEqual(reversed);
    expect(forward.map((l) => l.sourceDispositionLineId)).toEqual(['l-a', 'l-b']);
    expect(forward.map((l) => l.sortOrder)).toEqual([0, 1]);
    expect(disclosureSnapshotHash(build({}, rawLines))).toBe(
      disclosureSnapshotHash(build({}, [...rawLines].reverse())),
    );
  });

  // [8] geçersiz payload güvenli hata
  it('geçersiz payload güvenli tiplenmiş hata üretir', () => {
    expect(() => canonicalMoney(Number.NaN)).toThrow(ClientFinancialDisclosureError);
    expect(() => canonicalInstant(new Date('gecersiz'))).toThrow(ClientFinancialDisclosureError);
    expect(() =>
      canonicalDisclosureLines([
        { type: 'CLIENT_PAYABLE', amount: '1.00', sourceDispositionLineId: 'dup' },
        { type: 'OTHER', amount: '1.00', sourceDispositionLineId: 'dup' },
      ]),
    ).toThrow(ClientFinancialDisclosureError);
  });

  // [9] hash re-verification MATCH
  it('yeniden hesaplanan hash aynı payload için MATCH üretir', () => {
    const payload = build();
    expect(disclosureSnapshotHash(payload)).toBe(disclosureSnapshotHash(build()));
  });

  // [10] mismatch fail-closed
  it('reconciliation ihlali fail-closed reddedilir (tolerans YOK)', () => {
    const lines = canonicalDisclosureLines(rawLines);
    // Σ satırlar != totalCollected
    expect(() =>
      assertDisclosureReconciliation({
        lines,
        totalCollected: '2500.76',
        clientNetAmount: '1750.50',
      }),
    ).toThrow(ClientFinancialDisclosureError);
    // CLIENT_PAYABLE != clientNetAmount
    expect(() =>
      assertDisclosureReconciliation({
        lines,
        totalCollected: '2500.75',
        clientNetAmount: '1750.51',
      }),
    ).toThrow(ClientFinancialDisclosureError);
    // 1 kuruş sapma bile kabul edilmez
    expect(() =>
      assertDisclosureReconciliation({
        lines,
        totalCollected: '2500.74',
        clientNetAmount: '1750.50',
      }),
    ).toThrow(ClientFinancialDisclosureError);
    // doğru kombinasyon geçer
    expect(() =>
      assertDisclosureReconciliation({
        lines,
        totalCollected: '2500.75',
        clientNetAmount: '1750.50',
      }),
    ).not.toThrow();
  });

  it('HELD_PENDING_DISTRIBUTION satırı asla kabul edilmez (§35.5)', () => {
    const lines = canonicalDisclosureLines([
      { type: 'CLIENT_PAYABLE', amount: '10.00', sourceDispositionLineId: 'l-1' },
      { type: 'HELD_PENDING_DISTRIBUTION', amount: '5.00', sourceDispositionLineId: 'l-2' },
    ]);
    expect(() =>
      assertDisclosureReconciliation({
        lines,
        totalCollected: '15.00',
        clientNetAmount: '10.00',
      }),
    ).toThrow(ClientFinancialDisclosureError);
  });

  it('CLIENT_PAYABLE satırı tam olarak bir kez bulunmalıdır', () => {
    const none = canonicalDisclosureLines([
      { type: 'OTHER', amount: '10.00', sourceDispositionLineId: 'l-1' },
    ]);
    expect(() =>
      assertDisclosureReconciliation({ lines: none, totalCollected: '10.00', clientNetAmount: '0.00' }),
    ).toThrow(ClientFinancialDisclosureError);

    const twice = canonicalDisclosureLines([
      { type: 'CLIENT_PAYABLE', amount: '5.00', sourceDispositionLineId: 'l-1' },
      { type: 'CLIENT_PAYABLE', amount: '5.00', sourceDispositionLineId: 'l-2' },
    ]);
    expect(() =>
      assertDisclosureReconciliation({ lines: twice, totalCollected: '10.00', clientNetAmount: '5.00' }),
    ).toThrow(ClientFinancialDisclosureError);
  });

  // [11] finansal payload hata gövdesine sızmaz
  it('tiplenmiş hata gövdesi finansal payload veya hash taşımaz', () => {
    const error = new ClientFinancialDisclosureError('DISCLOSURE_HASH_MISMATCH');
    const serialized = JSON.stringify(error.getResponse());
    expect(serialized).not.toContain('1750.50');
    expect(serialized).not.toContain('2500.75');
    expect(serialized).not.toMatch(/[0-9a-f]{64}/);
    expect(serialized).toContain('DISCLOSURE_HASH_MISMATCH');
  });

  // [12] domain separation + contract version bağlama
  it('hash contract version ile domain-separated bağlanır', () => {
    expect(CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION).toBe(
      'ClientFinancialDisclosureSnapshotV1',
    );
    const payload = build();
    // Ham canonical JSON'un sha256'sı domain-separated hash'e EŞİT OLMAMALIDIR.
    const raw = createHash('sha256')
      .update(canonicalJsonStringify(payload), 'utf8')
      .digest('hex');
    expect(disclosureSnapshotHash(payload)).not.toBe(raw);
  });

  it('canonical payload yaşam döngüsü / gönderim alanı TAŞIMAZ', () => {
    const keys = Object.keys(build());
    for (const forbidden of [
      'status',
      'publishedAt',
      'sendIdempotencyKey',
      'providerMessageId',
      'notificationContent',
      'officeApprovedAt',
      'contentApprovedAt',
      'createdAt',
      'updatedAt',
      'id',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
