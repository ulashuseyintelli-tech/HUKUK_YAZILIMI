import {
  buildDivergenceIdentities,
  buildDivergenceIdentity,
  decideDivergenceFixture,
  toDivergenceFixtureAuditEvent,
  validateDivergenceGraph,
  DIVERGENCE_ACTOR_KEYS,
  DIVERGENCE_ACTOR_MATRIX,
  DIVERGENCE_EMAIL_DOMAIN,
  DIVERGENCE_FIXTURE_PART_TOTAL,
  type DivergenceFixtureFacts,
  type GraphRow,
} from '../office-cap02-divergence-fixture.core';

/**
 * OFFICE-P2-CAP02-HIERARCHY-DIVERGENCE-EVIDENCE-R02 doğrulama matrisi.
 * Owner §16 test listesinin tamamı + aktör matrisi + graph invariantları + secret sınırı.
 */

const TENANT_ID = 'cmrgs24hq0001uanatffks93h';
const SLUG = 'local-development-office';
const RUN = 'divr02a';

const A = 'cusera00000000000000000001';
const B = 'cuserb00000000000000000002';
const C = 'cuserc00000000000000000003';
const D = 'cuserd00000000000000000004';
const ALL = [A, B, C, D];

const facts = (o: Partial<DivergenceFixtureFacts> = {}): DivergenceFixtureFacts => ({
  tenant: { id: TENANT_ID, slug: SLUG },
  existingFixturePartCount: 0,
  undeclaredUserCount: 0,
  undeclaredLawyerCount: 0,
  undeclaredCaseCount: 0,
  clientCount: 0,
  staffCount: 0,
  activeLegacyPrincipalCount: 0,
  activeReportingLineCount: 0,
  ...o,
});

const input = { tenantId: TENANT_ID, runId: RUN };

const graph = (o: Partial<Record<'aMgr' | 'bMgr' | 'cMgr' | 'dMgr', string | null>> = {}): GraphRow[] => [
  { tenantId: TENANT_ID, actorUserId: A, managerUserId: o.aMgr ?? null, disposition: 'TOP_LEVEL' },
  { tenantId: TENANT_ID, actorUserId: B, managerUserId: o.bMgr ?? null, disposition: 'TOP_LEVEL' },
  { tenantId: TENANT_ID, actorUserId: C, managerUserId: o.cMgr ?? A, disposition: 'MANAGED' },
  { tenantId: TENANT_ID, actorUserId: D, managerUserId: o.dMgr ?? A, disposition: 'MANAGED' },
];

describe('aktor matrisi — dort telemetri kovasini kapsar', () => {
  it('dort aktor, iki TOP_LEVEL + iki MANAGED', () => {
    expect(DIVERGENCE_ACTOR_KEYS).toEqual(['A', 'B', 'C', 'D']);
    expect(DIVERGENCE_ACTOR_MATRIX.filter((p) => p.disposition === 'TOP_LEVEL')).toHaveLength(2);
    expect(DIVERGENCE_ACTOR_MATRIX.filter((p) => p.disposition === 'MANAGED')).toHaveLength(2);
  });

  it('beklenen karsilastirma dagilimi: 2 SAME_CLASS + 2 DIFFERENT_CLASS', () => {
    const same = DIVERGENCE_ACTOR_MATRIX.filter((p) => p.expectedComparison === 'SAME_CLASS');
    const diff = DIVERGENCE_ACTOR_MATRIX.filter((p) => p.expectedComparison === 'DIFFERENT_CLASS');
    expect(same).toHaveLength(2);
    expect(diff).toHaveLength(2);
  });

  it('kova beklentisi yururlukteki eslesme konvansiyonuyla tutarli (politika DEGIL)', () => {
    for (const p of DIVERGENCE_ACTOR_MATRIX) {
      const sameClass =
        (p.disposition === 'TOP_LEVEL' && p.expectedIncumbent === 'SELF_AUTHORITY') ||
        (p.disposition === 'MANAGED' && p.expectedIncumbent === 'REQUIRES_APPROVAL');
      expect(p.expectedComparison).toBe(sameClass ? 'SAME_CLASS' : 'DIFFERENT_CLASS');
    }
  });

  it('incumbent beklentisi rutbeden turer: PARTNER=SELF_AUTHORITY, digeri=REQUIRES_APPROVAL', () => {
    for (const p of DIVERGENCE_ACTOR_MATRIX) {
      expect(p.expectedIncumbent).toBe(p.lawyerRank === 'PARTNER' ? 'SELF_AUTHORITY' : 'REQUIRES_APPROVAL');
    }
  });

  it('yalniz A ADMIN (ReportingLine yuzeyi icin); B/C/D USER', () => {
    expect(DIVERGENCE_ACTOR_MATRIX.filter((p) => p.userRole === 'ADMIN').map((p) => p.key)).toEqual(['A']);
  });

  it('MANAGED aktorlerin amiri A; TOP_LEVEL aktorlerin amiri yok', () => {
    for (const p of DIVERGENCE_ACTOR_MATRIX) {
      expect(p.managerKey).toBe(p.disposition === 'MANAGED' ? 'A' : null);
    }
  });
});

describe('sentetik kimlik', () => {
  it('tum kimlikler teslim edilemez domain tasir ve runId+key icerir', () => {
    for (const id of buildDivergenceIdentities(RUN)) {
      expect(id.email.endsWith(`@${DIVERGENCE_EMAIL_DOMAIN}`)).toBe(true);
      expect(id.email).toContain(RUN);
      expect(id.lawyerName).toContain('CANARY OFFICE CAP02 DIVERGENCE');
      expect(id.caseReference).toContain(RUN.toUpperCase());
    }
  });

  it('deterministik: ayni runId ayni kimligi verir (idempotency temeli)', () => {
    expect(buildDivergenceIdentity(RUN, 'C')).toEqual(buildDivergenceIdentity(RUN, 'C'));
  });

  it('aktorler arasi kimlik cakismasi yok', () => {
    const ids = buildDivergenceIdentities(RUN);
    expect(new Set(ids.map((i) => i.email)).size).toBe(4);
    expect(new Set(ids.map((i) => i.lawyerName)).size).toBe(4);
    expect(new Set(ids.map((i) => i.caseReference)).size).toBe(4);
  });

  it('UC alanin TAMAMI runId tasir (koslar arasi cakismayi onler)', () => {
    for (const id of buildDivergenceIdentities(RUN)) {
      expect(id.email).toContain(RUN);
      expect(id.lawyerName).toContain(RUN.toUpperCase());
      expect(id.caseReference).toContain(RUN.toUpperCase());
    }
  });

  it('IKI FARKLI runId tamamen ayrik kimlik uretir (R01 4/12 regresyonu)', () => {
    const a = buildDivergenceIdentities('divr02a');
    const b = buildDivergenceIdentities('divr02b');
    const fields = (set: typeof a) => [
      ...set.map((i) => i.email),
      ...set.map((i) => i.lawyerName),
      ...set.map((i) => i.caseReference),
    ];
    const fa = fields(a);
    const fb = fields(b);
    expect(fa).toHaveLength(12);
    expect(fb).toHaveLength(12);
    // Tek bir alan bile ortak OLAMAZ.
    expect(fa.filter((v) => fb.includes(v))).toEqual([]);
  });
});

describe('fixture karari — mutlu yol', () => {
  it('canary-safe tenant + beyan disi kayit yok -> APPLY', () => {
    const d = decideDivergenceFixture(input, facts());
    expect(d.kind).toBe('APPLY');
    expect(d.failures).toEqual([]);
  });
});

describe('fixture karari — tenant fence', () => {
  it('exact tenant only: id uyusmazligi -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ tenant: { id: 'cbaskatenantidxxxxxxxxxxx', slug: SLUG } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_ID_MISMATCH');
  });

  it('canary-safe olmayan slug (telli-hukuk) -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ tenant: { id: TENANT_ID, slug: 'telli-hukuk' } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_SLUG_NOT_CANARY_SAFE');
  });

  it('tenant bulunamadi -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ tenant: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_NOT_FOUND');
  });

  it('gecersiz runId -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture({ tenantId: TENANT_ID, runId: 'DIV-R02!' }, facts());
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('INVALID_RUN_ID');
  });
});

describe('fixture karari — izolasyon kaniti', () => {
  it('beyan disi User -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ undeclaredUserCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_UNDECLARED_USERS');
  });

  it('beyan disi Lawyer -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ undeclaredLawyerCount: 2 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_UNDECLARED_LAWYERS');
  });

  it('beyan disi Case -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ undeclaredCaseCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_UNDECLARED_CASES');
  });

  it('Client varsa -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ clientCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_CLIENTS');
  });

  it('StaffMember varsa -> FAIL_CLOSED', () => {
    const d = decideDivergenceFixture(input, facts({ staffCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_STAFF');
  });

  it('legacy fixture hala AKTIF -> FAIL_CLOSED (gecmis fixture diriltilmez)', () => {
    const d = decideDivergenceFixture(input, facts({ activeLegacyPrincipalCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LEGACY_FIXTURE_STILL_ACTIVE');
  });

  it('onceden aktif ReportingLine varsa -> FAIL_CLOSED (olcum kirlenmesin)', () => {
    const d = decideDivergenceFixture(input, facts({ activeReportingLineCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('ACTIVE_REPORTINGLINE_PRESENT');
  });
});

describe('fixture karari — idempotency ve kismi fixture', () => {
  it('tam fixture -> ALREADY_APPLIED, yazim yok', () => {
    const d = decideDivergenceFixture(input, facts({ existingFixturePartCount: DIVERGENCE_FIXTURE_PART_TOTAL }));
    expect(d.kind).toBe('ALREADY_APPLIED');
    expect(d.failures).toEqual([]);
  });

  it('kismi fixture -> FAIL_CLOSED, sessiz onarim yok', () => {
    const d = decideDivergenceFixture(input, facts({ existingFixturePartCount: 7 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toEqual(['PARTIAL_DIVERGENCE_FIXTURE']);
    expect(d.reason).toContain('7/12');
  });

  it('idempotent replay: ALREADY_APPLIED tekrar cagrilinca yine ALREADY_APPLIED', () => {
    const f = facts({ existingFixturePartCount: DIVERGENCE_FIXTURE_PART_TOTAL });
    expect(decideDivergenceFixture(input, f).kind).toBe('ALREADY_APPLIED');
    expect(decideDivergenceFixture(input, f).kind).toBe('ALREADY_APPLIED');
  });
});

describe('graph invariantlari', () => {
  it('beklenen graph -> ok', () => {
    const r = validateDivergenceGraph(TENANT_ID, ALL, graph());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('eksik satir (kismi graph) -> ACTIVE_ROW_COUNT_MISMATCH', () => {
    const r = validateDivergenceGraph(TENANT_ID, ALL, graph().slice(0, 3));
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('ACTIVE_ROW_COUNT_MISMATCH');
  });

  it('TOP_LEVEL satirinda manager varsa -> TOP_LEVEL_HAS_MANAGER', () => {
    const r = validateDivergenceGraph(TENANT_ID, ALL, graph({ bMgr: A }));
    expect(r.failures).toContain('TOP_LEVEL_HAS_MANAGER');
  });

  it('MANAGED satirinda manager yoksa -> MANAGED_MISSING_MANAGER', () => {
    const rows = graph();
    rows[2] = { ...rows[2], managerUserId: null };
    const r = validateDivergenceGraph(TENANT_ID, ALL, rows);
    expect(r.failures).toContain('MANAGED_MISSING_MANAGER');
  });

  it('self-manager -> SELF_MANAGER', () => {
    const r = validateDivergenceGraph(TENANT_ID, ALL, graph({ cMgr: C }));
    expect(r.failures).toContain('SELF_MANAGER');
  });

  it('duplicate actor -> DUPLICATE_ACTOR', () => {
    const rows = graph();
    rows[3] = { ...rows[3], actorUserId: C };
    const r = validateDivergenceGraph(TENANT_ID, ALL, rows);
    expect(r.failures).toContain('DUPLICATE_ACTOR');
  });

  it('cross-tenant satir -> CROSS_TENANT_ROW', () => {
    const rows = graph();
    rows[1] = { ...rows[1], tenantId: 'cbaskatenantidxxxxxxxxxxx' };
    const r = validateDivergenceGraph(TENANT_ID, ALL, rows);
    expect(r.failures).toContain('CROSS_TENANT_ROW');
  });

  it('beklenmeyen aktor -> UNEXPECTED_ACTOR', () => {
    const rows = graph();
    rows[3] = { ...rows[3], actorUserId: 'cyabanciuseridxxxxxxxxxxx' };
    const r = validateDivergenceGraph(TENANT_ID, ALL, rows);
    expect(r.failures).toContain('UNEXPECTED_ACTOR');
  });

  it('dongu (C->D, D->C) -> CYCLE_DETECTED', () => {
    const rows: GraphRow[] = [
      { tenantId: TENANT_ID, actorUserId: A, managerUserId: null, disposition: 'TOP_LEVEL' },
      { tenantId: TENANT_ID, actorUserId: B, managerUserId: null, disposition: 'TOP_LEVEL' },
      { tenantId: TENANT_ID, actorUserId: C, managerUserId: D, disposition: 'MANAGED' },
      { tenantId: TENANT_ID, actorUserId: D, managerUserId: C, disposition: 'MANAGED' },
    ];
    const r = validateDivergenceGraph(TENANT_ID, ALL, rows);
    expect(r.failures).toContain('CYCLE_DETECTED');
  });
});

describe('audit kaniti — fiili commit sayisindan turer', () => {
  it('APPLY: committedRecordCount cagirandan gelir, karar turunden TURETILMEZ', () => {
    const d = decideDivergenceFixture(input, facts());
    const e = toDivergenceFixtureAuditEvent(
      { tenantId: TENANT_ID, runId: RUN, authorityRef: 'OWNER-R02-2026-07-30' },
      d,
      '2026-07-30T08:00:00.000Z',
      12,
    );
    expect(e.eventType).toBe('OFFICE_CAP02_DIVERGENCE_FIXTURE_PROVISIONED');
    expect(e.decision).toBe('APPLY');
    expect(e.committedRecordCount).toBe(12);
    expect(e.actorKeys).toEqual(['A', 'B', 'C', 'D']);
    expect(e.synthetic).toBe(true);
  });

  it('FAIL_CLOSED: commit 0 ve failure listesi tasinir', () => {
    const d = decideDivergenceFixture(input, facts({ clientCount: 3 }));
    const e = toDivergenceFixtureAuditEvent(
      { tenantId: TENANT_ID, runId: RUN, authorityRef: 'OWNER-R02-2026-07-30' },
      d,
      '2026-07-30T08:00:00.000Z',
      0,
    );
    expect(e.decision).toBe('FAIL_CLOSED');
    expect(e.committedRecordCount).toBe(0);
    expect(e.failures).toContain('TENANT_HAS_CLIENTS');
  });

  it('secret asla tasinmaz: deger tasiyan parola/hash/token alani YOK', () => {
    const d = decideDivergenceFixture(input, facts());
    const e = toDivergenceFixtureAuditEvent(
      { tenantId: TENANT_ID, runId: RUN, authorityRef: 'OWNER-R02-2026-07-30' },
      d,
      '2026-07-30T08:00:00.000Z',
      12,
    );
    const keys = Object.keys(e);
    for (const banned of ['password', 'passwordHash', 'parola', 'token', 'secret', 'authorization', 'cookie']) {
      expect(keys).not.toContain(banned);
    }
    for (const v of Object.values(e)) {
      if (typeof v === 'string') {
        expect(v).not.toMatch(/^\$2[aby]\$/);
        expect(v.length > 60 && v.split('.').length === 3).toBe(false);
      }
    }
  });
});

describe('modul yuzeyi', () => {
  it('export seti sabit; parola tasiyan hicbir yuzey yok', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-divergence-fixture.core');
    expect(Object.keys(mod).sort()).toEqual([
      'DIVERGENCE_ACTOR_KEYS',
      'DIVERGENCE_ACTOR_MATRIX',
      'DIVERGENCE_EMAIL_DOMAIN',
      'DIVERGENCE_FIXTURE_PART_TOTAL',
      'buildDivergenceIdentities',
      'buildDivergenceIdentity',
      'decideDivergenceFixture',
      'toDivergenceFixtureAuditEvent',
      'validateDivergenceGraph',
    ]);
  });
});
