import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { OfficeWorkPoolKind, StaffType } from '@prisma/client';
import {
  OFFICE_WORK_POOL_MEMBER_CARRIER,
  OfficeWorkPoolContractViolationError,
} from '../office-work-pool.contract';
import {
  OfficeWorkPoolMembershipRow,
  OfficeWorkPoolSnapshot,
  evaluateOfficeLawyerPool,
  evaluateOfficeStaffTypePool,
  isOfficeWorkPoolMembershipActiveAt,
} from '../office-work-pool.evaluator';
import { OfficeWorkPoolResolverService } from '../office-work-pool-resolver.service';
import { OfficeWorkPoolReadPort } from '../office-work-pool.repository';
import {
  compareOfficeWorkPoolParity,
  maskIdentity,
  runOfficeWorkPoolParitySweep,
} from '../office-work-pool-parity';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — RESOLVER FOUNDATION SAF TESTLERİ (§7.1-7.8).
 *
 * DB GEREKTİRMEZ. Gerçek Postgres tarafı ayrı dosyadadır:
 * `office-work-pool-parity.db-gated.integration.spec.ts`.
 *
 * Bu suite yalnız pozitif davranışı değil, AŞAMA 3'ün NEGATİF sınırlarını da kilitler:
 * tüketici bağlanmamıştır, pasif-kullanıcı filtresi resolver'a sızmamıştır ve saf katmanda
 * IO yoktur — üçü de kaynak metni üzerinden mekanik olarak kanıtlanır.
 */

const TENANT = 'tenant-wp-1';
const OTHER_TENANT = 'tenant-wp-2';
const KNOWN_FROM = new Date('2026-08-17T12:00:00.000Z');

const LAWYER_A = 'lawyer-aaaa-0001';
const LAWYER_B = 'lawyer-bbbb-0002';

function membership(
  overrides: Partial<OfficeWorkPoolMembershipRow> & Pick<OfficeWorkPoolMembershipRow, 'id'>,
): OfficeWorkPoolMembershipRow {
  return {
    tenantId: TENANT,
    poolKind: 'ESCALATION_MANAGER',
    memberLawyerId: LAWYER_A,
    memberStaffType: null,
    validFrom: KNOWN_FROM,
    validUntil: null,
    revokedAt: null,
    ...overrides,
  };
}

function snapshot(
  memberships: readonly OfficeWorkPoolMembershipRow[],
  anchorKnownFrom: Date | null = KNOWN_FROM,
): OfficeWorkPoolSnapshot {
  return {
    anchor: anchorKnownFrom === null ? null : { knownFrom: anchorKnownFrom },
    memberships,
  };
}

describe('OFFICE-WR01-B02 A3 — sozlesme taksonomisi (§6.1, §7.8)', () => {
  it('her havuz turunun tam bir tasiyicisi vardir ve kume kapalidir', () => {
    expect(OFFICE_WORK_POOL_MEMBER_CARRIER).toEqual({
      OP_STAFF_TYPE: 'STAFF_TYPE',
      ESCALATION_MANAGER: 'LAWYER',
      ESCALATION_FOUNDER: 'LAWYER',
    });
    expect(Object.keys(OFFICE_WORK_POOL_MEMBER_CARRIER).sort()).toEqual(
      Object.keys(OfficeWorkPoolKind).sort(),
    );
  });

  it('yanlis tasiyici/poolKind eslesmesi runtime düzeyinde fail-closed (throw) olur', () => {
    // Tip sistemi bunu ZATEN engeller; burada tip atlandiginda ne olacagi kilitlenir.
    expect(() =>
      evaluateOfficeLawyerPool('OP_STAFF_TYPE' as never, KNOWN_FROM, TENANT, snapshot([])),
    ).toThrow(OfficeWorkPoolContractViolationError);
    expect(() =>
      evaluateOfficeStaffTypePool('ESCALATION_MANAGER' as never, KNOWN_FROM, TENANT, snapshot([])),
    ).toThrow(OfficeWorkPoolContractViolationError);
  });
});

describe('OFFICE-WR01-B02 A3 — temel predikat sinirlari (§7.1, §7.2)', () => {
  const row = membership({
    id: 'm-bounds',
    validFrom: new Date('2026-08-17T12:00:00.000Z'),
    validUntil: new Date('2026-08-20T12:00:00.000Z'),
  });

  it('validFrom sinirinda INCLUSIVE', () => {
    expect(isOfficeWorkPoolMembershipActiveAt(row, new Date(row.validFrom), TENANT)).toBe(true);
    expect(
      isOfficeWorkPoolMembershipActiveAt(
        row,
        new Date(row.validFrom.getTime() - 1),
        TENANT,
      ),
    ).toBe(false);
  });

  it('validUntil sinirinda EXCLUSIVE', () => {
    const until = row.validUntil as Date;
    expect(isOfficeWorkPoolMembershipActiveAt(row, new Date(until.getTime() - 1), TENANT)).toBe(
      true,
    );
    expect(isOfficeWorkPoolMembershipActiveAt(row, new Date(until), TENANT)).toBe(false);
  });

  it('revokedAt sinirinda EXCLUSIVE ve revoke ONCESI tarihsel uyelik KORUNUR', () => {
    const revoked = membership({
      id: 'm-revoked',
      validFrom: new Date('2026-08-17T12:00:00.000Z'),
      revokedAt: new Date('2026-08-19T12:00:00.000Z'),
    });
    const at = revoked.revokedAt as Date;

    expect(isOfficeWorkPoolMembershipActiveAt(revoked, new Date(at.getTime() - 1), TENANT)).toBe(
      true,
    );
    expect(isOfficeWorkPoolMembershipActiveAt(revoked, new Date(at), TENANT)).toBe(false);

    // §7.2: revokedAt GECMISTEKI aktifligi degistirmez.
    const historical = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      new Date('2026-08-18T00:00:00.000Z'),
      TENANT,
      snapshot([revoked]),
    );
    expect(historical.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A] });
  });

  it('yari-acik aralik ardisik donemlerde ne bosluk ne ortusme uretir', () => {
    const boundary = new Date('2026-08-20T12:00:00.000Z');
    const first = membership({ id: 'm-p1', validUntil: boundary });
    const second = membership({ id: 'm-p2', validFrom: boundary, memberLawyerId: LAWYER_B });

    const atBoundary = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      boundary,
      TENANT,
      snapshot([first, second]),
    );
    expect(atBoundary.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_B] });
    expect(atBoundary.diagnostics).toEqual([]);
  });
});

describe('OFFICE-WR01-B02 A3 — UNKNOWN / EMPTY / members ayrimi (§7.6, CF-B02-01)', () => {
  it('anchor yok -> UNKNOWN / ANCHOR_MISSING / members=[]', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([membership({ id: 'm-1' })], null),
    );
    expect(result.resolution).toEqual({
      status: 'UNKNOWN',
      reason: 'ANCHOR_MISSING',
      members: [],
    });
  });

  it('asOf < knownFrom -> UNKNOWN / BEFORE_KNOWN_FROM / members=[]', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      new Date(KNOWN_FROM.getTime() - 1),
      TENANT,
      snapshot([membership({ id: 'm-1', validFrom: new Date('2020-01-01T00:00:00.000Z') })]),
    );
    expect(result.resolution).toEqual({
      status: 'UNKNOWN',
      reason: 'BEFORE_KNOWN_FROM',
      members: [],
    });
  });

  it('bilinen BOS havuz -> RESOLVED / [] (UNKNOWN ile karistirilmaz)', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [] });
  });

  it('bilinen DOLU havuz -> RESOLVED / members', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({ id: 'm-a', memberLawyerId: LAWYER_A }),
        membership({ id: 'm-b', memberLawyerId: LAWYER_B }),
      ]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A, LAWYER_B] });
    expect(result.diagnostics).toEqual([]);
  });

  it('membership min(validFrom) knowledge boundary olarak KULLANILMAZ (§7.6 madde 7)', () => {
    // Anchor cutover'da; uyelik ondan SONRA baslamis. Anchor ile min(validFrom) arasindaki
    // an "bilinen ve gercekten bos"tur — UNKNOWN DEGIL.
    const later = new Date('2026-09-01T00:00:00.000Z');
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      new Date('2026-08-18T00:00:00.000Z'),
      TENANT,
      snapshot([membership({ id: 'm-late', validFrom: later })]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [] });
  });
});

describe('OFFICE-WR01-B02 A3 — tenant izolasyonu (§7.5)', () => {
  it('cross-tenant satir hicbir sonuca sizmaz ve tani uretir', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({ id: 'm-own', memberLawyerId: LAWYER_A }),
        membership({ id: 'm-foreign', tenantId: OTHER_TENANT, memberLawyerId: LAWYER_B }),
      ]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A] });
    expect(result.diagnostics).toEqual([
      { code: 'CROSS_TENANT_ROW', poolKind: 'ESCALATION_MANAGER', rowId: 'm-foreign' },
    ]);
  });

  it('baska havuza ait satir sonuca girmez', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([membership({ id: 'm-founder', poolKind: 'ESCALATION_FOUNDER' })]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [] });
    expect(result.diagnostics).toEqual([
      {
        code: 'POOL_KIND_MISMATCH',
        poolKind: 'ESCALATION_MANAGER',
        rowId: 'm-founder',
        rowPoolKind: 'ESCALATION_FOUNDER',
      },
    ]);
  });
});

describe('OFFICE-WR01-B02 A3 — kume semantigi ve ortusme (§7.4)', () => {
  it('AYNI uyeye ait ortusen satirlar dedupe edilir + tani uretir, hata FIRLATILMAZ', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({ id: 'm-dup-2', memberLawyerId: LAWYER_A }),
        membership({ id: 'm-dup-1', memberLawyerId: LAWYER_A }),
      ]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A] });
    expect(result.diagnostics).toEqual([
      {
        code: 'DUPLICATE_ACTIVE_MEMBER',
        poolKind: 'ESCALATION_MANAGER',
        memberKey: LAWYER_A,
        activeRowCount: 2,
        rowIds: ['m-dup-1', 'm-dup-2'],
      },
    ]);
  });

  it('FARKLI uyelerin ayni anda aktif olmasi tani URETMEZ (yanlis duplicate uyarisi yok)', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({ id: 'm-a', memberLawyerId: LAWYER_A }),
        membership({ id: 'm-b', memberLawyerId: LAWYER_B }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('kapanmis satirla acik satir ayni uyede cakismaz (yalniz AKTIF olanlar sayilir)', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      new Date('2026-09-01T00:00:00.000Z'),
      TENANT,
      snapshot([
        membership({ id: 'm-closed', validUntil: new Date('2026-08-25T00:00:00.000Z') }),
        membership({ id: 'm-open', validFrom: new Date('2026-08-25T00:00:00.000Z') }),
      ]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A] });
    expect(result.diagnostics).toEqual([]);
  });

  it('cikti girdi sirasindan BAGIMSIZ ve deterministiktir', () => {
    const rows = [
      membership({ id: 'm-3', memberLawyerId: 'lawyer-cccc' }),
      membership({ id: 'm-1', memberLawyerId: LAWYER_A }),
      membership({ id: 'm-2', memberLawyerId: LAWYER_B }),
    ];
    const forward = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot(rows),
    );
    const reversed = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([...rows].reverse()),
    );
    expect(forward.resolution).toEqual(reversed.resolution);
    expect(forward.resolution).toEqual({
      status: 'RESOLVED',
      members: [LAWYER_A, LAWYER_B, 'lawyer-cccc'],
    });
  });
});

describe('OFFICE-WR01-B02 A3 — tasiyici ayrimi (§7.8)', () => {
  it('staff-type havuzu StaffType ENUM degerleri dondurur, kimlik degil', () => {
    const result = evaluateOfficeStaffTypePool(
      'OP_STAFF_TYPE',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({
          id: 'm-s1',
          poolKind: 'OP_STAFF_TYPE',
          memberLawyerId: null,
          memberStaffType: StaffType.SEKRETER,
        }),
        membership({
          id: 'm-s2',
          poolKind: 'OP_STAFF_TYPE',
          memberLawyerId: null,
          memberStaffType: StaffType.MUHASEBE,
        }),
      ]),
    );
    expect(result.resolution).toEqual({
      status: 'RESOLVED',
      members: [StaffType.MUHASEBE, StaffType.SEKRETER],
    });
  });

  it('tasiyicisi bozuk satir SONUCA GIRMEZ ve tani uretir (DB CHECK ikinci savunma hatti)', () => {
    const result = evaluateOfficeLawyerPool(
      'ESCALATION_MANAGER',
      KNOWN_FROM,
      TENANT,
      snapshot([
        membership({ id: 'm-broken', memberLawyerId: null, memberStaffType: StaffType.SEKRETER }),
      ]),
    );
    expect(result.resolution).toEqual({ status: 'RESOLVED', members: [] });
    expect(result.diagnostics).toEqual([
      {
        code: 'MEMBER_CARRIER_MISMATCH',
        poolKind: 'ESCALATION_MANAGER',
        rowId: 'm-broken',
        expectedCarrier: 'LAWYER',
      },
    ]);
  });
});

describe('OFFICE-WR01-B02 A3 — katman ayrimi ve orchestration', () => {
  class RecordingReader implements OfficeWorkPoolReadPort {
    public calls: Array<{ tenantId: string; poolKind: OfficeWorkPoolKind }> = [];
    constructor(private readonly result: OfficeWorkPoolSnapshot) {}
    async readPoolSnapshot(
      tenantId: string,
      poolKind: OfficeWorkPoolKind,
    ): Promise<OfficeWorkPoolSnapshot> {
      this.calls.push({ tenantId, poolKind });
      return this.result;
    }
  }

  it('bir cozumleme icin repository TAM OLARAK BIR KEZ okunur', async () => {
    const reader = new RecordingReader(snapshot([membership({ id: 'm-a' })]));
    const service = new OfficeWorkPoolResolverService(reader);

    const resolution = await service.resolveLawyerPool('ESCALATION_MANAGER', KNOWN_FROM, TENANT);

    expect(resolution).toEqual({ status: 'RESOLVED', members: [LAWYER_A] });
    expect(reader.calls).toEqual([{ tenantId: TENANT, poolKind: 'ESCALATION_MANAGER' }]);
  });

  it('anchor yoksa structured ERROR loglanir ve karar UNKNOWN kalir', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const service = new OfficeWorkPoolResolverService(new RecordingReader(snapshot([], null)));
      const resolution = await service.resolveLawyerPool('ESCALATION_FOUNDER', KNOWN_FROM, TENANT);

      expect(resolution).toEqual({ status: 'UNKNOWN', reason: 'ANCHOR_MISSING', members: [] });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({
        event: 'office_work_pool_anchor_missing',
        poolKind: 'ESCALATION_FOUNDER',
        reason: 'ANCHOR_MISSING',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('ortusen satir structured WARN uretir; BEFORE_KNOWN_FROM log URETMEZ', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const duplicated = snapshot([
        membership({ id: 'm-d1' }),
        membership({ id: 'm-d2' }),
      ]);
      const service = new OfficeWorkPoolResolverService(new RecordingReader(duplicated));

      await service.resolveLawyerPool('ESCALATION_MANAGER', KNOWN_FROM, TENANT);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(warnSpy.mock.calls[0][0] as string)).toMatchObject({
        event: 'office_work_pool_structural_anomaly',
        code: 'DUPLICATE_ACTIVE_MEMBER',
        activeRowCount: 2,
      });

      warnSpy.mockClear();
      const early = new OfficeWorkPoolResolverService(new RecordingReader(snapshot([])));
      const resolution = await early.resolveLawyerPool(
        'ESCALATION_MANAGER',
        new Date(KNOWN_FROM.getTime() - 1000),
        TENANT,
      );
      expect(resolution).toEqual({
        status: 'UNKNOWN',
        reason: 'BEFORE_KNOWN_FROM',
        members: [],
      });
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('OFFICE-WR01-B02 A3 — AS AMA 3 negatif sinirlari (kaynak uzerinden mekanik kanit)', () => {
  const WORK_POOL_DIR = join(__dirname, '..');
  const read = (file: string) => readFileSync(join(WORK_POOL_DIR, file), 'utf8');

  it('saf evaluator IO TASIMAZ: Prisma, Nest ve saat okuma importu yoktur', () => {
    const source = read('office-work-pool.evaluator.ts');
    expect(source).not.toMatch(/@nestjs\/common/);
    expect(source).not.toMatch(/PrismaService/);
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/new Date\(\)/);
  });

  it('pasif-kullanici (isActive) filtresi resolver katmanina SIZMAZ (§7.7, §2.E)', () => {
    for (const file of [
      'office-work-pool.contract.ts',
      'office-work-pool.evaluator.ts',
      'office-work-pool.repository.ts',
      'office-work-pool-resolver.service.ts',
    ]) {
      expect(read(file)).not.toMatch(/isActive/);
    }
  });

  it('repository SALT-OKUNURDUR: mutation cagrisi icermez', () => {
    const source = read('office-work-pool.repository.ts');
    for (const forbidden of [
      '.create(',
      '.createMany(',
      '.update(',
      '.updateMany(',
      '.upsert(',
      '.delete(',
      '.deleteMany(',
      '$executeRaw',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('resolver hicbir Nest module providers listesine BAGLI DEGILDIR (0/6 tuketici)', () => {
    const officeModule = readFileSync(join(WORK_POOL_DIR, '..', 'office.module.ts'), 'utf8');
    expect(officeModule).not.toMatch(/WorkPool/);
  });
});

describe('OFFICE-WR01-B02 A3 — parite harness sozlesmesi', () => {
  it('maskeleme deterministiktir ve ham kimligi acmaz', () => {
    expect(maskIdentity(LAWYER_A)).toBe(maskIdentity(LAWYER_A));
    expect(maskIdentity(LAWYER_A)).not.toContain('aaaa-0001');
    expect(maskIdentity('kisa')).toBe('***');
  });

  it('sirasiz kume esitligi PASS uretir', () => {
    const result = compareOfficeWorkPoolParity<string>(
      [LAWYER_B, LAWYER_A],
      { status: 'RESOLVED', members: [LAWYER_A, LAWYER_B] },
      maskIdentity,
    );
    expect(result.status).toBe('PASS');
    expect(result.onlyInLegacy).toEqual([]);
    expect(result.onlyInResolved).toEqual([]);
  });

  it('UNKNOWN legacy ile ESIT SAYILMAZ — bos legacy dizisi bile PASS uretmez', () => {
    const anchorMissing = compareOfficeWorkPoolParity<string>(
      [],
      { status: 'UNKNOWN', reason: 'ANCHOR_MISSING', members: [] },
      maskIdentity,
    );
    expect(anchorMissing.status).toBe('ANCHOR_MISSING');

    const beforeKnownFrom = compareOfficeWorkPoolParity<string>(
      [],
      { status: 'UNKNOWN', reason: 'BEFORE_KNOWN_FROM', members: [] },
      maskIdentity,
    );
    expect(beforeKnownFrom.status).toBe('BEFORE_KNOWN_FROM');
  });

  it('ANCHOR_MISSING verdict PASS uretmez; hic olcum yoksa NOT_MEASURED olur', async () => {
    const report = await runOfficeWorkPoolParitySweep(
      {
        legacy: {
          listLegacyPools: async () => [
            {
              tenantId: TENANT,
              opStaffTypes: [StaffType.SEKRETER],
              escalationManagerLawyerIds: [LAWYER_A],
              escalationFounderLawyerIds: [],
            },
          ],
        },
        resolver: {
          resolveLawyerPool: async () => ({
            status: 'UNKNOWN',
            reason: 'ANCHOR_MISSING',
            members: [],
          }),
          resolveStaffTypePool: async () => ({
            status: 'UNKNOWN',
            reason: 'ANCHOR_MISSING',
            members: [],
          }),
        },
      },
      { asOf: KNOWN_FROM, source: 'SYNTHETIC_FIXTURE' },
    );

    expect(report.anchorMissingCount).toBe(3);
    expect(report.comparedCount).toBe(0);
    expect(report.verdict).toBe('NOT_MEASURED');
  });

  it('excludeTenantIds sentetik fixture i gercek-veri olcumunden cikarir', async () => {
    const report = await runOfficeWorkPoolParitySweep(
      {
        legacy: {
          listLegacyPools: async () => [
            {
              tenantId: TENANT,
              opStaffTypes: [],
              escalationManagerLawyerIds: [],
              escalationFounderLawyerIds: [],
            },
            {
              tenantId: OTHER_TENANT,
              opStaffTypes: [],
              escalationManagerLawyerIds: [],
              escalationFounderLawyerIds: [],
            },
          ],
        },
        resolver: {
          resolveLawyerPool: async () => ({ status: 'RESOLVED', members: [] }),
          resolveStaffTypePool: async () => ({ status: 'RESOLVED', members: [] }),
        },
      },
      { asOf: KNOWN_FROM, source: 'SYNTHETIC_FIXTURE', excludeTenantIds: [OTHER_TENANT] },
    );

    // tenantCount DISLAMADAN SONRAKI kapsami raporlar, yani olcum gizlenmez.
    expect(report.tenantCount).toBe(1);
    expect(report.comparisons.every((c) => c.tenantRef === maskIdentity(TENANT))).toBe(true);
  });

  it('havuzlar AYRI olculur: bir havuzun PASS i digerinin MISMATCH ini gizlemez', async () => {
    const report = await runOfficeWorkPoolParitySweep(
      {
        legacy: {
          listLegacyPools: async () => [
            {
              tenantId: TENANT,
              opStaffTypes: [StaffType.SEKRETER],
              escalationManagerLawyerIds: [LAWYER_A],
              escalationFounderLawyerIds: [LAWYER_B],
            },
          ],
        },
        resolver: {
          resolveLawyerPool: async (poolKind) =>
            poolKind === 'ESCALATION_MANAGER'
              ? { status: 'RESOLVED', members: [LAWYER_A] }
              : { status: 'RESOLVED', members: [] },
          resolveStaffTypePool: async () => ({
            status: 'RESOLVED',
            members: [StaffType.SEKRETER],
          }),
        },
      },
      { asOf: KNOWN_FROM, source: 'SYNTHETIC_FIXTURE' },
    );

    expect(report.passCount).toBe(2);
    expect(report.mismatchCount).toBe(1);
    expect(report.verdict).toBe('FAIL');
    const founder = report.comparisons.find((c) => c.poolKind === 'ESCALATION_FOUNDER');
    expect(founder?.status).toBe('MISMATCH');
    expect(founder?.onlyInLegacy).toEqual([maskIdentity(LAWYER_B)]);
  });
});
