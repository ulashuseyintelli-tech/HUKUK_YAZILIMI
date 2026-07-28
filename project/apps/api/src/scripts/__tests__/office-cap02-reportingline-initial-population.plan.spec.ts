import {
  buildInitialPopulationPlan,
  InitialPopulationPlanError,
  type InitialPopulationConfig,
} from '../office-cap02-reportingline-initial-population.plan';
import { dryRunPopulation } from '../office-cap02-reportingline-population.core';

/**
 * OFFICE-P2-CAP02-REPORTINGLINE-INITIAL-POPULATION-I01 plan doğrulaması.
 * Plan → dry-run zinciri, owner-onaylı iki kişilik graph üzerinden uçtan uca sınanır.
 */

const TENANT = 'cmm61v99600007a6smfkarha9';
const PARTNER = 'cmqw01nk00002nmjnt3xd8cum';
const EGE = 'cmqw5igtz000b12fgfilmvst9';
const AT = '2026-07-28T16:23:36.769Z';

const config = (o: Partial<InitialPopulationConfig> = {}): InitialPopulationConfig => ({
  tenantSlug: 't-telli',
  partnerUserId: PARTNER,
  managedUserId: EGE,
  validFrom: AT,
  authorityRef: 'OFFICE-P2-CAP02-PERSONNEL-AND-SHADOW-FULL-ACTIVATION-OWNER-R01',
  evidenceRef: 'OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-OPERATE-I01',
  ...o,
});

describe('plan üretimi', () => {
  it('iki adım üretir ve manager önce yazılır', () => {
    const plan = buildInitialPopulationPlan(config());
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toEqual({
      kind: 'MARK_TOP_LEVEL',
      actorUserId: PARTNER,
      managerUserId: null,
    });
    expect(plan.steps[1]).toEqual({
      kind: 'ASSIGN_MANAGER',
      actorUserId: EGE,
      managerUserId: PARTNER,
    });
  });

  it('TOP_LEVEL kaydında manager daima null', () => {
    const plan = buildInitialPopulationPlan(config());
    const top = plan.records.find((r) => r.disposition === 'TOP_LEVEL');
    expect(top?.managerUserId).toBeNull();
  });

  it('MANAGED kaydında manager partner dır', () => {
    const plan = buildInitialPopulationPlan(config());
    const managed = plan.records.find((r) => r.disposition === 'MANAGED');
    expect(managed?.managerUserId).toBe(PARTNER);
  });

  it('authority ve evidence referansları her kayda taşınır', () => {
    const plan = buildInitialPopulationPlan(config());
    for (const r of plan.records) {
      expect(r.authorityRef).toContain('OWNER-R01');
      expect(r.evidenceRef).toContain('IDENTITY-BINDING-OPERATE-I01');
      expect(r.validFrom).toBe(AT);
    }
  });
});

describe('plan reddetme koşulları', () => {
  it('aynı kişi hem partner hem managed olamaz (self-manager)', () => {
    expect(() => buildInitialPopulationPlan(config({ managedUserId: PARTNER }))).toThrow(
      InitialPopulationPlanError,
    );
    expect(() => buildInitialPopulationPlan(config({ managedUserId: PARTNER }))).toThrow(
      /SELF_MANAGER/,
    );
  });

  it('eksik User id reddedilir', () => {
    expect(() => buildInitialPopulationPlan(config({ partnerUserId: '' }))).toThrow(
      /MISSING_USER_ID/,
    );
  });

  it('authority veya evidence eksikse reddedilir', () => {
    expect(() => buildInitialPopulationPlan(config({ authorityRef: '' }))).toThrow(
      /MISSING_AUTHORITY/,
    );
    expect(() => buildInitialPopulationPlan(config({ evidenceRef: '' }))).toThrow(
      /MISSING_AUTHORITY/,
    );
  });
});

describe('plan -> dry-run zinciri', () => {
  const snapshot = (over: Partial<Parameters<typeof dryRunPopulation>[1]> = {}) => ({
    tenantIdBySlug: { 't-telli': TENANT },
    users: [
      { userId: PARTNER, tenantId: TENANT, isActive: true },
      { userId: EGE, tenantId: TENANT, isActive: true },
    ],
    activeLines: [],
    ...over,
  });

  it('temiz production durumunda iki kayıt da PASS', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(plan.records, snapshot());
    expect(out).toMatchObject({ total: 2, pass: 2, fail: 0, eligibleForOperate: true });
  });

  it('pasif manager dry-run da yakalanır', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(
      plan.records,
      snapshot({
        users: [
          { userId: PARTNER, tenantId: TENANT, isActive: false },
          { userId: EGE, tenantId: TENANT, isActive: true },
        ],
      }),
    );
    expect(out.eligibleForOperate).toBe(false);
    const managed = out.records.find((r) => r.disposition === 'MANAGED');
    expect(managed?.failures).toContain('MANAGER_INACTIVE');
  });

  it('cross-tenant actor dry-run da yakalanır', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(
      plan.records,
      snapshot({
        users: [
          { userId: PARTNER, tenantId: TENANT, isActive: true },
          { userId: EGE, tenantId: 'baska-tenant', isActive: true },
        ],
      }),
    );
    expect(out.eligibleForOperate).toBe(false);
  });

  it('IDEMPOTENCY: iki kayıt da zaten varsa NO_OP ve operate uygun kalır', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(
      plan.records,
      snapshot({
        activeLines: [
          { tenantId: TENANT, actorUserId: PARTNER, managerUserId: null, disposition: 'TOP_LEVEL' },
          { tenantId: TENANT, actorUserId: EGE, managerUserId: PARTNER, disposition: 'MANAGED' },
        ],
      }),
    );
    expect(out).toMatchObject({ noOp: 2, pass: 0, fail: 0, eligibleForOperate: true });
  });

  it('FARKLI mevcut aktif satır çakışma olarak reddedilir', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(
      plan.records,
      snapshot({
        activeLines: [
          { tenantId: TENANT, actorUserId: EGE, managerUserId: null, disposition: 'TOP_LEVEL' },
        ],
      }),
    );
    expect(out.eligibleForOperate).toBe(false);
    const managed = out.records.find((r) => r.actorUserId === EGE);
    expect(managed?.failures).toContain('EXISTING_ACTIVE_LINE_CONFLICT');
  });
});

describe('idempotency kapisi — runner davranis sozlesmesi', () => {
  it('tum kayitlar NO_OP ise servis cagrilmamalidir', () => {
    // Runner'in kapisi: dryRun.noOp === dryRun.total && total > 0 -> ALREADY_APPLIED.
    // Bu kosul saglandiginda ReportingLineService CAGRILMAZ; aksi halde servis mevcut
    // satiri kapatip ayni icerikte yenisini acar ve gecmise anlamsiz kayit eklenir.
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(plan.records, {
      tenantIdBySlug: { 't-telli': TENANT },
      users: [
        { userId: PARTNER, tenantId: TENANT, isActive: true },
        { userId: EGE, tenantId: TENANT, isActive: true },
      ],
      activeLines: [
        { tenantId: TENANT, actorUserId: PARTNER, managerUserId: null, disposition: 'TOP_LEVEL' },
        { tenantId: TENANT, actorUserId: EGE, managerUserId: PARTNER, disposition: 'MANAGED' },
      ],
    });
    const shouldSkipWrites = out.noOp === out.total && out.total > 0;
    expect(shouldSkipWrites).toBe(true);
  });

  it('tek bir kayit bile PASS ise servis cagrilmalidir', () => {
    const plan = buildInitialPopulationPlan(config());
    const out = dryRunPopulation(plan.records, {
      tenantIdBySlug: { 't-telli': TENANT },
      users: [
        { userId: PARTNER, tenantId: TENANT, isActive: true },
        { userId: EGE, tenantId: TENANT, isActive: true },
      ],
      activeLines: [
        { tenantId: TENANT, actorUserId: PARTNER, managerUserId: null, disposition: 'TOP_LEVEL' },
      ],
    });
    expect(out.noOp).toBe(1);
    expect(out.pass).toBe(1);
    expect(out.noOp === out.total && out.total > 0).toBe(false);
  });

  it('bos paket yazim tetiklemez', () => {
    const out = dryRunPopulation([], {
      tenantIdBySlug: { 't-telli': TENANT }, users: [], activeLines: [],
    });
    expect(out.noOp === out.total && out.total > 0).toBe(false);
    expect(out.total).toBe(0);
  });
});
