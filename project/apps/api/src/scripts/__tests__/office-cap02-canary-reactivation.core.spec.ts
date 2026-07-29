import { buildCanaryIdentity } from '../office-cap02-canary-provision.core';
import {
  CANARY_REACTIVATION_MUTABLE_MODELS,
  decideCanaryReactivation,
  toCanaryReactivationAuditEvent,
  type CanaryReactivationFacts,
  type CanaryReactivationInput,
} from '../office-cap02-canary-reactivation.core';

/**
 * OFFICE-P2-CAP02-CANARY-FIXTURE-REACTIVATION-I01 doğrulama matrisi.
 * Owner §6 test listesinin tamamı + kimlik/staleness/secret sınırları.
 */

const TENANT_ID = 'cmrgs24hq0001uanatffks93h';
const SLUG = 'local-development-office';
const RUN = 'r01g01';
const USER_ID = 'cms56jx4u000213j4dnswyapy';
const LAWYER_ID = 'cms56jx55000413j4lgt8kmfp';
const CASE_ID = 'cms56jx5b000613j4kq4j6cl9';
const USER_AT = '2026-07-29T07:00:00.000Z';
const LAWYER_AT = '2026-07-29T07:00:01.000Z';
const IDENTITY = buildCanaryIdentity(RUN);

const input = (o: Partial<CanaryReactivationInput> = {}): CanaryReactivationInput => ({
  tenantId: TENANT_ID,
  canaryRunId: RUN,
  expectedUserId: USER_ID,
  expectedLawyerId: LAWYER_ID,
  expectedCaseId: CASE_ID,
  expectedUserUpdatedAt: USER_AT,
  expectedLawyerUpdatedAt: LAWYER_AT,
  authorityRef: 'OWNER-R01H-REACTIVATION-2026-07-29',
  ...o,
});

const facts = (o: Partial<CanaryReactivationFacts> = {}): CanaryReactivationFacts => ({
  tenant: { id: TENANT_ID, slug: SLUG },
  user: {
    id: USER_ID,
    tenantId: TENANT_ID,
    email: IDENTITY.email,
    isActive: false,
    updatedAt: USER_AT,
  },
  lawyer: {
    id: LAWYER_ID,
    tenantId: TENANT_ID,
    name: IDENTITY.name,
    userId: USER_ID,
    lawyerRank: 'PARTNER',
    isActive: false,
    updatedAt: LAWYER_AT,
  },
  legalCase: { id: CASE_ID, tenantId: TENANT_ID, fileNumber: IDENTITY.caseReference },
  otherUserCount: 0,
  otherLawyerCount: 0,
  otherCaseCount: 0,
  clientCount: 0,
  ...o,
});

describe('mutlu yol — exact inactive fixture', () => {
  it('[matris 1] birebir kimlik + iki satir pasif + bos tenant -> REACTIVATE', () => {
    const d = decideCanaryReactivation(input(), facts());
    expect(d.kind).toBe('REACTIVATE');
    expect(d.failures).toEqual([]);
  });
});

describe('tenant fence', () => {
  it('[matris 2] tenant id uyusmazligi -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ tenant: { id: 'cbaskabirtenantidxxxxxxxx', slug: SLUG } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_ID_MISMATCH');
  });

  it('[matris 2b] canary-safe olmayan slug (telli-hukuk) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ tenant: { id: TENANT_ID, slug: 'telli-hukuk' } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_SLUG_NOT_CANARY_SAFE');
  });

  it('[matris 2c] tenant bulunamadi -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ tenant: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_NOT_FOUND');
  });
});

describe('User kimlik fence', () => {
  it('[matris 3] yanlis User ID (kayit bulunamaz) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ user: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('USER_NOT_FOUND');
  });

  it('[matris 3b] User baska tenant altinda -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ user: { ...facts().user!, tenantId: 'cbaskabirtenantidxxxxxxxx' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('USER_TENANT_MISMATCH');
  });

  it('[matris 3c] e-posta sentetik desenden sapmis -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ user: { ...facts().user!, email: 'gercek-gorunumlu@tellihukuk.com' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('USER_IDENTITY_NOT_SYNTHETIC');
  });
});

describe('Lawyer kimlik fence', () => {
  it('[matris 4] yanlis Lawyer ID (kayit bulunamaz) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_NOT_FOUND');
  });

  it('[matris 9] Lawyer baska bir User kaydina bagli -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ lawyer: { ...facts().lawyer!, userId: 'cbaskabiruseridxxxxxxxxxx' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_NOT_BOUND_TO_EXPECTED_USER');
  });

  it('[matris 9b] Lawyer hicbir User kaydina bagli degil (userId null) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: { ...facts().lawyer!, userId: null } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_NOT_BOUND_TO_EXPECTED_USER');
  });

  it('[ek] rutbe PARTNER degil -> FAIL_CLOSED (incumbent sonuc deterministligi bozulamaz)', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: { ...facts().lawyer!, lawyerRank: 'LAWYER' } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_RANK_NOT_PARTNER');
  });

  it('[ek] Lawyer adi sentetik desenden sapmis -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: { ...facts().lawyer!, name: 'Ulas Huseyin Telli' } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_IDENTITY_NOT_SYNTHETIC');
  });
});

describe('Case fence — dogrulanir ama asla yazilmaz', () => {
  it('[matris 5] yanlis Case ID (kayit bulunamaz) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ legalCase: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('CASE_NOT_FOUND');
  });

  it('[matris 5b] Case baska tenant altinda -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ legalCase: { id: CASE_ID, tenantId: 'cbaskabirtenantidxxxxxxxx', fileNumber: IDENTITY.caseReference } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('CASE_TENANT_MISMATCH');
  });

  it('[matris 5c] fileNumber sentetik desenden sapmis -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ legalCase: { id: CASE_ID, tenantId: TENANT_ID, fileNumber: '2026/1234' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('CASE_IDENTITY_NOT_SYNTHETIC');
  });

  it('[matris 11b] mutasyon kapsami yapisal olarak yalniz User+Lawyer (Case listede YOK)', () => {
    expect(CANARY_REACTIVATION_MUTABLE_MODELS).toEqual(['User', 'Lawyer']);
    expect(CANARY_REACTIVATION_MUTABLE_MODELS).not.toContain('Case');
    expect(CANARY_REACTIVATION_MUTABLE_MODELS).not.toContain('ReportingLine');
  });
});

describe('bosluk kaniti — fixture disi kayit yasagi', () => {
  it('[matris 6] fixture disi User varsa -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ otherUserCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_NON_FIXTURE_USERS');
  });

  it('[matris 7] fixture disi Case varsa -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ otherCaseCount: 2 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_NON_FIXTURE_CASES');
  });

  it('[ek] fixture disi Lawyer varsa -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ otherLawyerCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_NON_FIXTURE_LAWYERS');
  });

  it('[ek] tenant icinde Client varsa -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ clientCount: 1 }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('TENANT_HAS_CLIENTS');
  });
});

describe('kismi fixture / kismi aktiflik', () => {
  it('[matris 8] User var ama Lawyer yok (kismi fixture) -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: null }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('LAWYER_NOT_FOUND');
  });

  it('[ek] User aktif ama Lawyer pasif -> FAIL_CLOSED PARTIAL_ACTIVE_STATE', () => {
    const d = decideCanaryReactivation(input(), facts({ user: { ...facts().user!, isActive: true } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toEqual(['PARTIAL_ACTIVE_STATE']);
  });

  it('[ek] Lawyer aktif ama User pasif -> FAIL_CLOSED PARTIAL_ACTIVE_STATE', () => {
    const d = decideCanaryReactivation(input(), facts({ lawyer: { ...facts().lawyer!, isActive: true } }));
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toEqual(['PARTIAL_ACTIVE_STATE']);
  });
});

describe('optimistic concurrency — stale updatedAt', () => {
  it('[matris 10] User.updatedAt preflight degerinden sapmis -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ user: { ...facts().user!, updatedAt: '2026-07-29T07:59:59.999Z' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toEqual(['USER_STALE_UPDATED_AT']);
  });

  it('[matris 10b] Lawyer.updatedAt preflight degerinden sapmis -> FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ lawyer: { ...facts().lawyer!, updatedAt: '2026-07-29T07:59:59.999Z' } }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toEqual(['LAWYER_STALE_UPDATED_AT']);
  });
});

describe('idempotency — repeat apply', () => {
  it('[matris 12] iki satir da aktif + kimlik birebir -> ALREADY_APPLIED (yazim yok)', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({
        user: { ...facts().user!, isActive: true },
        lawyer: { ...facts().lawyer!, isActive: true },
      }),
    );
    expect(d.kind).toBe('ALREADY_APPLIED');
    expect(d.failures).toEqual([]);
    // Owner §5: ALREADY_APPLIED'de parola bilinmez — reason bunu acikca tasir.
    expect(d.reason).toContain('parola');
  });

  it('[matris 12b] ALREADY_APPLIED staleness kapisina TAKILMAZ (yazim olmayan yolda CAS anlamsiz)', () => {
    const d = decideCanaryReactivation(
      input({ expectedUserUpdatedAt: '2020-01-01T00:00:00.000Z', expectedLawyerUpdatedAt: '2020-01-01T00:00:00.000Z' }),
      facts({
        user: { ...facts().user!, isActive: true },
        lawyer: { ...facts().lawyer!, isActive: true },
      }),
    );
    expect(d.kind).toBe('ALREADY_APPLIED');
  });

  it('[ek] aktif satirlar ama kimlik bozuk -> ALREADY_APPLIED DEGIL, FAIL_CLOSED', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({
        user: { ...facts().user!, isActive: true, email: 'baska@tellihukuk.com' },
        lawyer: { ...facts().lawyer!, isActive: true },
      }),
    );
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('USER_IDENTITY_NOT_SYNTHETIC');
  });
});

describe('gecersiz runId', () => {
  it('[ek] desen disi canaryRunId -> FAIL_CLOSED INVALID_RUN_ID', () => {
    const d = decideCanaryReactivation(input({ canaryRunId: 'R01-G!!' }), facts());
    expect(d.kind).toBe('FAIL_CLOSED');
    expect(d.failures).toContain('INVALID_RUN_ID');
  });
});

describe('audit kaniti — fiili commit sayilarindan turetilir', () => {
  it('[matris 11] basarili apply: committedRecordCount + mutatedModels GERCEK sayilardan gelir', () => {
    const d = decideCanaryReactivation(input(), facts());
    const e = toCanaryReactivationAuditEvent(input(), d, '2026-07-29T08:00:00.000Z', { userRows: 1, lawyerRows: 1 });
    expect(e.eventType).toBe('OFFICE_CAP02_CANARY_FIXTURE_REACTIVATED');
    expect(e.decision).toBe('REACTIVATE');
    expect(e.committedRecordCount).toBe(2);
    expect(e.mutatedModels).toEqual(['User', 'Lawyer']);
    expect(e.passwordRotated).toBe(true);
    expect(e.tokenVersionBumped).toBe(true);
    expect(e.synthetic).toBe(true);
  });

  it('[matris 12c] ALREADY_APPLIED / hic commit yok: sayac 0, model listesi bos, rotasyon false', () => {
    const d = decideCanaryReactivation(
      input(),
      facts({ user: { ...facts().user!, isActive: true }, lawyer: { ...facts().lawyer!, isActive: true } }),
    );
    const e = toCanaryReactivationAuditEvent(input(), d, '2026-07-29T08:00:00.000Z', { userRows: 0, lawyerRows: 0 });
    expect(e.decision).toBe('ALREADY_APPLIED');
    expect(e.committedRecordCount).toBe(0);
    expect(e.mutatedModels).toEqual([]);
    expect(e.passwordRotated).toBe(false);
    expect(e.tokenVersionBumped).toBe(false);
  });

  it('[matris 13] secret asla tasinmaz: deger tasiyan parola/hash/token alani YOK', () => {
    const d = decideCanaryReactivation(input(), facts());
    const e = toCanaryReactivationAuditEvent(input(), d, '2026-07-29T08:00:00.000Z', { userRows: 1, lawyerRows: 1 });
    // Rotasyon BAYRAKLARI kalir (boolean kanit); deger tasiyan secret alani yoktur.
    expect(typeof e.passwordRotated).toBe('boolean');
    expect(typeof e.tokenVersionBumped).toBe('boolean');
    const keys = Object.keys(e);
    for (const banned of ['password', 'passwordHash', 'parola', 'token', 'secret', 'authorization', 'cookie']) {
      expect(keys).not.toContain(banned);
    }
    // Hicbir string deger bcrypt hash'i veya JWT gibi gorunemez.
    for (const v of Object.values(e)) {
      if (typeof v === 'string') {
        expect(v).not.toMatch(/^\$2[aby]\$/); // bcrypt deseni
        expect(v.length > 60 && v.split('.').length === 3).toBe(false); // JWT deseni
      }
    }
  });
});

describe('modul yuzeyi — cekirdek parolayi HIC gormez', () => {
  it('[matris 13b] export seti sabit; parola tasiyan hicbir yuzey yok', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-canary-reactivation.core');
    expect(Object.keys(mod).sort()).toEqual([
      'CANARY_REACTIVATION_MUTABLE_MODELS',
      'decideCanaryReactivation',
      'toCanaryReactivationAuditEvent',
    ]);
  });
});
