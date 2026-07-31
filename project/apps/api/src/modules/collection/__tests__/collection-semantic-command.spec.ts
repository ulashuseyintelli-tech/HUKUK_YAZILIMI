import { ConflictException } from '@nestjs/common';
import {
  assertCollectionSemanticReplay,
  buildCollectionSemanticCommandEvidence,
  COLLECTION_COMMAND_FINGERPRINT_VERSION,
  domainSeparatedCommandHash,
} from '../collection-semantic-command';
import {
  AllocationType,
  CollectionChannel,
  CollectionSource,
  CollectionType,
} from '../dto/collection.dto';

const actor = { type: 'HUMAN' as const, userId: 'actor-1' };
const baseDto = {
  caseId: 'case-1',
  caseDebtorId: 'debtor-1',
  idempotencyKey: 'idem-1',
  amount: 100,
  currency: 'TRY',
  type: CollectionType.BANK_TRANSFER,
  channel: CollectionChannel.BANKA,
  date: '2026-07-31T09:30:00.000Z',
  valueDate: '2026-07-31T00:00:00.000Z',
  sourceType: CollectionSource.BANK_INTEGRATION,
  sourceId: 'bank-transaction-1',
  description: 'Tahsilat açıklaması',
  receiptNo: 'receipt-1',
  bankName: 'Test Bankası',
  accountNo: 'TR-SECRET',
  notes: 'Hassas not',
  autoAllocate: true,
  allocations: [
    {
      allocationType: AllocationType.INTEREST,
      amount: 10,
      description: 'Faiz',
    },
    {
      allocationType: AllocationType.PRINCIPAL,
      amount: 20,
      description: 'Ana para',
    },
  ],
};

function build(
  overrides: Record<string, unknown> = {},
  options: {
    actor?: typeof actor;
    producer?:
      | 'BANK_TRANSACTION_MATCH'
      | 'COLLECTION_PUBLIC_API'
      | 'COLLECTION_SERVICE_COMPATIBILITY';
    digest?: (version: string, canonicalPayload: string) => string;
  } = {},
) {
  return buildCollectionSemanticCommandEvidence({
    tenantId: 'tenant-1',
    dto: { ...baseDto, ...overrides } as any,
    actor: options.actor ?? actor,
    producer: options.producer ?? 'BANK_TRANSACTION_MATCH',
    digest: options.digest,
  });
}

function persisted(evidence = build()) {
  return {
    commandFingerprintVersion: evidence.fingerprintVersion,
    commandFingerprint: evidence.commandFingerprint,
    commandCanonicalPayload: evidence.commandCanonicalPayload,
  };
}

function responseCode(error: unknown): string | undefined {
  if (!(error instanceof ConflictException)) return undefined;
  return (error.getResponse() as { code?: string }).code;
}

describe('RCV-COL-CMD/v1 semantic command canonicalization', () => {
  it('fixes the exact golden canonical payload and domain-separated SHA-256 vector', () => {
    const evidence = build();
    expect(evidence.fingerprintVersion).toBe('RCV-COL-CMD/v1');
    expect(evidence.commandCanonicalPayload).toBe(
      '{"actorAuthority":{"actorClass":"HUMAN","actorRefDigest":"960181fe41f07af599919df9d374211e64e535c5a49466610bd5d0915cb74c28","authority":"COLLECTION_RECEIPT_CREATE"},"allocationIntent":{"autoAllocate":true,"manualAllocations":[{"allocationType":"INTEREST","amount":"10.00","descriptionDigest":"44e6fa64d1a3e2a60cc1acb42fd8059f7bf8119e25ff79eab475e2642387a42a"},{"allocationType":"PRINCIPAL","amount":"20.00","descriptionDigest":"4e2f82330fd031ea3c9b566694ec58bb4c988c50bc9da4be24f7aace7dc99649"}]},"amount":"100.00","bankTransactionId":"bank-transaction-1","caseDebtorId":"debtor-1","caseId":"case-1","channel":"BANKA","confirmedAtPolicy":"SERVER_COMMIT_TIME","currency":"TRY","effectiveDate":"2026-07-31T09:30:00.000Z","operation":"CREATE_COLLECTION_RECEIPT","persistedMetadata":{"accountNoDigest":"ff5dc53e2cb86510a33b4f698dc9f7138beddeacf7af55636b074b078f8bfb83","bankNameDigest":"f7b157f07f41801043e766b770797a23fd12089b5a0818e6bf6e8c8ef5dbfe3b","descriptionDigest":"7327853bedd19b5a989b687002078f79de9dad3d257d22c1a39f9da838edf437","notesDigest":"5729a8d6612262fa39b066e7932bf527e48572b52f040bfeb2844063e2a34f34","receiptNoDigest":"d7c5d39d594a05265a35090461fb53b19553fbbd870aa800c5aa4631d2a929ee"},"provenance":{"producer":"BANK_TRANSACTION_MATCH","sourceId":"bank-transaction-1","sourceType":"BANK_INTEGRATION"},"schemaVersion":"RCV-COL-CMD/v1","tenantId":"tenant-1","type":"BANK_TRANSFER","valueDate":"2026-07-31T00:00:00.000Z"}',
    );
    expect(evidence.commandFingerprint).toBe(
      '431884cfcef3147f770636f5591795d1f9298f2d882c390da40a2c60f2806080',
    );
  });

  it('normalizes decimal, date, currency and Unicode without floating-point hashing', () => {
    const first = build({
      amount: '100.0',
      currency: 'try',
      date: '2026-07-31T12:30:00+03:00',
      description: 'I\u0307stanbul',
    });
    const second = build({
      amount: '100.00',
      currency: 'TRY',
      date: '2026-07-31T09:30:00.000Z',
      description: '\u0130stanbul',
    });
    expect(first).toEqual(second);
    expect(first.commandCanonicalPayload).toContain('"amount":"100.00"');
  });

  it('treats optional missing, null-like blank text and explicit false deterministically', () => {
    const missing = build({
      sourceType: CollectionSource.MANUAL,
      sourceId: undefined,
      caseDebtorId: undefined,
      valueDate: undefined,
      description: undefined,
      allocations: undefined,
      autoAllocate: undefined,
    });
    const normalized = build({
      sourceType: CollectionSource.MANUAL,
      sourceId: ' ',
      caseDebtorId: ' ',
      valueDate: undefined,
      description: ' ',
      allocations: [],
      autoAllocate: true,
    });
    expect(missing).toEqual(normalized);
    expect(build({ autoAllocate: false }).commandFingerprint).not.toBe(
      missing.commandFingerprint,
    );
  });

  it('sorts non-semantic manual allocation order but preserves duplicates and differences', () => {
    const reordered = build({
      allocations: [...baseDto.allocations].reverse(),
    });
    expect(reordered).toEqual(build());

    const duplicate = build({
      allocations: [...baseDto.allocations, baseDto.allocations[0]],
    });
    expect(duplicate.commandFingerprint).not.toBe(build().commandFingerprint);

    const changed = build({
      allocations: [
        baseDto.allocations[0],
        { ...baseDto.allocations[1], amount: 21 },
      ],
    });
    expect(changed.commandFingerprint).not.toBe(build().commandFingerprint);
  });

  it.each([
    ['amount', { amount: 101 }],
    ['currency', { currency: 'USD' }],
    ['case', { caseId: 'case-2' }],
    ['debtor', { caseDebtorId: 'debtor-2' }],
    ['bank transaction', { sourceId: 'bank-transaction-2' }],
    ['effective date', { date: '2026-08-01T09:30:00.000Z' }],
    ['value date', { valueDate: '2026-08-01T00:00:00.000Z' }],
    ['collection method', { channel: CollectionChannel.NAKIT }],
    ['description', { description: 'Başka açıklama' }],
    ['receipt reference', { receiptNo: 'receipt-2' }],
    ['notes', { notes: 'Başka not' }],
  ])('includes changed %s in the semantic fingerprint', (_label, override) => {
    expect(build(override).commandFingerprint).not.toBe(
      build().commandFingerprint,
    );
  });

  it('includes producer and actor authority but excludes trace, request time and confirmedAt', () => {
    expect(
      build({}, { producer: 'COLLECTION_PUBLIC_API' }).commandFingerprint,
    ).not.toBe(build().commandFingerprint);
    expect(
      build(
        {},
        { actor: { type: 'HUMAN', userId: 'actor-2' } },
      ).commandFingerprint,
    ).not.toBe(build().commandFingerprint);

    const evidence = build();
    expect(evidence.commandCanonicalPayload).not.toMatch(
      /trace|correlation|requestTime|confirmedAt":/,
    );
    expect(evidence.commandCanonicalPayload).toContain(
      '"confirmedAtPolicy":"SERVER_COMMIT_TIME"',
    );
  });

  it('stores digests rather than raw bank/free-text/PII metadata', () => {
    const payload = build().commandCanonicalPayload;
    for (const raw of [
      baseDto.description,
      baseDto.receiptNo,
      baseDto.bankName,
      baseDto.accountNo,
      baseDto.notes,
      'actor-1',
    ]) {
      expect(payload).not.toContain(raw);
    }
  });

  it.each([
    [{ amount: 0 }, 'COLLECTION_COMMAND_AMOUNT_INVALID'],
    [{ amount: '1.001' }, 'COLLECTION_COMMAND_AMOUNT_INVALID'],
    [{ date: 'not-a-date' }, 'COLLECTION_COMMAND_DATE_INVALID'],
    [{ valueDate: 'not-a-date' }, 'COLLECTION_COMMAND_VALUEDATE_INVALID'],
  ])('fails closed for invalid canonical input', (override, code) => {
    expect(() => build(override)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code }),
      }),
    );
  });

  it('uses protocol domain separation rather than raw canonical JSON hashing', () => {
    const evidence = build();
    expect(
      domainSeparatedCommandHash(
        'OTHER-PROTOCOL/v1',
        evidence.commandCanonicalPayload,
      ),
    ).not.toBe(evidence.commandFingerprint);
  });
});

describe('RCV-COL semantic replay decision', () => {
  it('accepts only same version + same fingerprint + exact canonical payload', () => {
    expect(() => assertCollectionSemanticReplay(persisted(), build())).not.toThrow();
  });

  it('same key + semantically changed command fails with stable conflict code', () => {
    const existing = persisted();
    try {
      assertCollectionSemanticReplay(existing, build({ amount: 101 }));
      throw new Error('expected conflict');
    } catch (error) {
      expect(responseCode(error)).toBe('IDEMPOTENCY_SEMANTIC_CONFLICT');
      expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain(
        existing.commandFingerprint,
      );
    }
  });

  it('legacy row without fingerprint fails closed without guessing historical command', () => {
    try {
      assertCollectionSemanticReplay(
        {
          commandFingerprintVersion: null,
          commandFingerprint: null,
          commandCanonicalPayload: null,
        },
        build(),
      );
      throw new Error('expected conflict');
    } catch (error) {
      expect(responseCode(error)).toBe('IDEMPOTENCY_LEGACY_UNVERIFIABLE');
    }
  });

  it('partial/corrupt evidence and unknown fingerprint versions fail closed', () => {
    const evidence = build();
    for (const existing of [
      {
        commandFingerprintVersion: evidence.fingerprintVersion,
        commandFingerprint: evidence.commandFingerprint,
        commandCanonicalPayload: null,
      },
      {
        ...persisted(evidence),
        commandFingerprintVersion: 'RCV-COL-CMD/v2',
      },
      {
        ...persisted(evidence),
        commandFingerprint: '0'.repeat(64),
      },
    ]) {
      expect(() =>
        assertCollectionSemanticReplay(existing, evidence),
      ).toThrow(ConflictException);
    }
  });

  it('fails closed when a mocked digest collides for different canonical payloads', () => {
    const collisionDigest = () => 'a'.repeat(64);
    const first = build({}, { digest: collisionDigest });
    const second = build({ amount: 101 }, { digest: collisionDigest });
    expect(first.commandFingerprint).toBe(second.commandFingerprint);
    expect(() =>
      assertCollectionSemanticReplay(
        {
          commandFingerprintVersion: COLLECTION_COMMAND_FINGERPRINT_VERSION,
          commandFingerprint: first.commandFingerprint,
          commandCanonicalPayload: first.commandCanonicalPayload,
        },
        second,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'IDEMPOTENCY_SEMANTIC_CONFLICT',
        }),
      }),
    );
  });
});
