import {
  buildPopulationInputPack,
  dryRunPopulation,
  type AuthorizablePersonnelCandidate,
  type PopulationInputRecord,
  type PopulationSnapshot,
} from '../office-cap02-reportingline-population.core';

/**
 * STEP 7 (input pack) + STEP 8 (population dry-run) doğrulama matrisi.
 * Her owner kuralı için en az bir kabul ve bir ret senaryosu.
 */

const T1 = 'tenant-one-id';
const T2 = 'tenant-two-id';
const AT = '2026-07-28T00:00:00.000Z';

const candidate = (o: Partial<AuthorizablePersonnelCandidate> = {}): AuthorizablePersonnelCandidate => ({
  tenantSlug: 't-one',
  actorUserId: 'u-actor',
  disposition: 'MANAGED',
  managerUserId: 'u-manager',
  validFrom: AT,
  authorityRef: 'decision-log#2026-07-28',
  evidenceRef: 'mapping-pack#row-1',
  ...o,
});

const snapshot = (over: Partial<PopulationSnapshot> = {}): PopulationSnapshot => ({
  tenantIdBySlug: { 't-one': T1, 't-two': T2 },
  users: [
    { userId: 'u-actor', tenantId: T1, isActive: true },
    { userId: 'u-manager', tenantId: T1, isActive: true },
    { userId: 'u-second', tenantId: T1, isActive: true },
    { userId: 'u-inactive', tenantId: T1, isActive: false },
    { userId: 'u-other-tenant', tenantId: T2, isActive: true },
  ],
  activeLines: [],
  ...over,
});

const rec = (o: Partial<PopulationInputRecord> = {}): PopulationInputRecord => ({
  tenantSlug: 't-one',
  actorUserId: 'u-actor',
  disposition: 'MANAGED',
  managerUserId: 'u-manager',
  validFrom: AT,
  authorityRef: 'decision-log#2026-07-28',
  evidenceRef: 'mapping-pack#row-1',
  ...o,
});

const one = (r: Partial<PopulationInputRecord>, s = snapshot()) =>
  dryRunPopulation([rec(r)], s).records[0];

// ---------------------------------------------------------------------------
// STEP 7 — input pack
// ---------------------------------------------------------------------------

describe('STEP 7 — buildPopulationInputPack', () => {
  it('MANAGED + manager -> pakete girer', () => {
    const out = buildPopulationInputPack([candidate()]);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].managerUserId).toBe('u-manager');
    expect(out.wellFormed).toBe(true);
  });

  it('TOP_LEVEL manager NULL a normalize edilir', () => {
    const out = buildPopulationInputPack([
      candidate({ disposition: 'TOP_LEVEL', managerUserId: null }),
    ]);
    expect(out.records[0].managerUserId).toBeNull();
  });

  it('UNCLASSIFIED input a YAZILMAZ', () => {
    const out = buildPopulationInputPack([candidate({ disposition: 'UNCLASSIFIED' })]);
    expect(out.records).toHaveLength(0);
    expect(out.excluded[0].reason).toBe('UNCLASSIFIED_NOT_PERSISTED');
    expect(out.wellFormed).toBe(true);
  });

  it('NON_AUTHORIZABLE input a ALINMAZ', () => {
    const out = buildPopulationInputPack([candidate({ disposition: 'NON_AUTHORIZABLE' })]);
    expect(out.records).toHaveLength(0);
    expect(out.excluded[0].reason).toBe('NON_AUTHORIZABLE_NO_USER_BINDING');
    expect(out.wellFormed).toBe(true);
  });

  it('MANAGED manager siz pakete giremez', () => {
    const out = buildPopulationInputPack([candidate({ managerUserId: null })]);
    expect(out.excluded[0].reason).toBe('MANAGED_WITHOUT_MANAGER');
    expect(out.wellFormed).toBe(false);
  });

  it('TOP_LEVEL manager ile pakete giremez', () => {
    const out = buildPopulationInputPack([
      candidate({ disposition: 'TOP_LEVEL', managerUserId: 'u-manager' }),
    ]);
    expect(out.excluded[0].reason).toBe('TOP_LEVEL_WITH_MANAGER');
    expect(out.wellFormed).toBe(false);
  });

  it('actorUserId / authorityRef / evidenceRef eksikse dışlanır', () => {
    expect(buildPopulationInputPack([candidate({ actorUserId: null })]).excluded[0].reason).toBe(
      'MISSING_ACTOR_USER_ID',
    );
    expect(buildPopulationInputPack([candidate({ authorityRef: '' })]).excluded[0].reason).toBe(
      'MISSING_AUTHORITY_REF',
    );
    expect(buildPopulationInputPack([candidate({ evidenceRef: '' })]).excluded[0].reason).toBe(
      'MISSING_EVIDENCE_REF',
    );
  });

  it('karışık paket: yalnız kanonik dışlamalar varsa wellFormed kalır', () => {
    const out = buildPopulationInputPack([
      candidate(),
      candidate({ actorUserId: 'u-second', disposition: 'UNCLASSIFIED' }),
      candidate({ actorUserId: 'u-third', disposition: 'NON_AUTHORIZABLE' }),
    ]);
    expect(out.records).toHaveLength(1);
    expect(out.excluded).toHaveLength(2);
    expect(out.wellFormed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STEP 8 — dry-run
// ---------------------------------------------------------------------------

describe('STEP 8 — dryRunPopulation kabul', () => {
  it('aynı tenant, aktif actor + aktif manager -> PASS', () => {
    expect(one({}).verdict).toBe('PASS');
  });

  it('TOP_LEVEL manager NULL -> PASS', () => {
    expect(one({ disposition: 'TOP_LEVEL', managerUserId: null }).verdict).toBe('PASS');
  });
});

describe('STEP 8 — actor/manager varlık ve tenant', () => {
  it('var olmayan actor reddedilir', () => {
    expect(one({ actorUserId: 'yok' }).failures).toContain('ACTOR_NOT_FOUND');
  });
  it('pasif actor reddedilir', () => {
    expect(one({ actorUserId: 'u-inactive' }).failures).toContain('ACTOR_INACTIVE');
  });
  it('cross-tenant actor reddedilir', () => {
    expect(one({ actorUserId: 'u-other-tenant' }).failures).toContain('ACTOR_TENANT_MISMATCH');
  });
  it('var olmayan manager reddedilir', () => {
    expect(one({ managerUserId: 'yok' }).failures).toContain('MANAGER_NOT_FOUND');
  });
  it('pasif manager reddedilir', () => {
    expect(one({ managerUserId: 'u-inactive' }).failures).toContain('MANAGER_INACTIVE');
  });
  it('cross-tenant manager reddedilir', () => {
    expect(one({ managerUserId: 'u-other-tenant' }).failures).toContain('MANAGER_TENANT_MISMATCH');
  });
  it('bilinmeyen tenantSlug reddedilir', () => {
    expect(one({ tenantSlug: 'yok' }).failures).toContain('TENANT_UNKNOWN');
  });
});

describe('STEP 8 — disposition tutarlılığı', () => {
  it('MANAGED manager siz reddedilir', () => {
    expect(one({ managerUserId: null }).failures).toContain('MANAGED_WITHOUT_MANAGER');
  });
  it('TOP_LEVEL manager ile reddedilir', () => {
    expect(one({ disposition: 'TOP_LEVEL' }).failures).toContain('TOP_LEVEL_WITH_MANAGER');
  });
});

describe('STEP 8 — graph bütünlüğü', () => {
  it('self-manager reddedilir', () => {
    expect(one({ managerUserId: 'u-actor' }).failures).toContain('SELF_MANAGER');
  });

  it('girdi içi iki adımlı döngü reddedilir', () => {
    const out = dryRunPopulation(
      [
        rec({ actorUserId: 'u-actor', managerUserId: 'u-manager' }),
        rec({ actorUserId: 'u-manager', managerUserId: 'u-actor' }),
      ],
      snapshot(),
    );
    expect(out.records.every((r) => r.failures.includes('CYCLE'))).toBe(true);
    expect(out.eligibleForOperate).toBe(false);
  });

  it('MEVCUT satırla oluşan döngü de reddedilir', () => {
    // DB: u-manager -> u-second.  Girdi: u-second -> u-manager  => dongu
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-manager', managerUserId: 'u-second', disposition: 'MANAGED' },
      ],
    });
    const r = one({ actorUserId: 'u-second', managerUserId: 'u-manager' }, s);
    expect(r.failures).toContain('CYCLE');
  });

  it('TOP_LEVEL zinciri kopardığı için döngü oluşmaz', () => {
    // Ayni batch: u-manager TOP_LEVEL olursa u-actor -> u-manager zinciri kapanmaz.
    // (Karsit senaryo "girdi ici iki adimli dongu" testinde CYCLE veriyor.)
    const out = dryRunPopulation(
      [
        rec({ actorUserId: 'u-manager', disposition: 'TOP_LEVEL', managerUserId: null }),
        rec({ actorUserId: 'u-actor', managerUserId: 'u-manager' }),
      ],
      snapshot(),
    );
    expect(out.fail).toBe(0);
    expect(out.eligibleForOperate).toBe(true);
  });

  it('MEVCUT aktif satırı yeniden ebeveynlemek çakışmadır — önce kapatılmalı', () => {
    // Bu kural cycle kuralindan BAGIMSIZDIR: mevcut aktif satiri degistiren girdi,
    // dongu olusturmasa bile once validUntil ile kapatilmayi gerektirir.
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-manager', managerUserId: 'u-actor', disposition: 'MANAGED' },
      ],
    });
    const r = one({ actorUserId: 'u-manager', disposition: 'TOP_LEVEL', managerUserId: null }, s);
    expect(r.failures).toContain('EXISTING_ACTIVE_LINE_CONFLICT');
    expect(r.failures).not.toContain('CYCLE');
  });

  it('bizi içermeyen ayrı bir döngü sonsuz aramaya yol açmaz', () => {
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-manager', managerUserId: 'u-second', disposition: 'MANAGED' },
        { tenantId: T1, actorUserId: 'u-second', managerUserId: 'u-manager', disposition: 'MANAGED' },
      ],
    });
    // u-actor -> u-manager; ileride u-manager<->u-second dongusu var ama u-actor'a donmuyor.
    const r = one({}, s);
    expect(r.failures).not.toContain('CYCLE');
  });
});

describe('STEP 8 — çakışma, tekrar, idempotency', () => {
  it('aynı actor iki kez girilirse reddedilir', () => {
    const out = dryRunPopulation([rec({}), rec({ managerUserId: 'u-second' })], snapshot());
    expect(out.records.every((r) => r.failures.includes('DUPLICATE_ACTOR_IN_INPUT'))).toBe(true);
  });

  it('IDEMPOTENCY: birebir aynı aktif satır varsa NO_OP', () => {
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-actor', managerUserId: 'u-manager', disposition: 'MANAGED' },
      ],
    });
    const r = one({}, s);
    expect(r.verdict).toBe('NO_OP');
    expect(r.failures).toHaveLength(0);
  });

  it('FARKLI aktif satır varsa çakışma olarak reddedilir', () => {
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-actor', managerUserId: 'u-second', disposition: 'MANAGED' },
      ],
    });
    expect(one({}, s).failures).toContain('EXISTING_ACTIVE_LINE_CONFLICT');
  });
});

describe('STEP 8 — tarih ve otorite alanları', () => {
  it('geçersiz validFrom reddedilir', () => {
    expect(one({ validFrom: '28-07-2026' }).failures).toContain('INVALID_VALID_FROM');
    expect(one({ validFrom: '2026-13-45T00:00:00.000Z' }).failures).toContain('INVALID_VALID_FROM');
  });
  it('geçerli ISO-8601 kabul edilir', () => {
    expect(one({ validFrom: '2026-07-28T10:30:00+03:00' }).verdict).toBe('PASS');
  });
  it('authorityRef / evidenceRef eksikse reddedilir', () => {
    expect(one({ authorityRef: '' }).failures).toContain('MISSING_AUTHORITY_REF');
    expect(one({ evidenceRef: '' }).failures).toContain('MISSING_EVIDENCE_REF');
  });
});

describe('STEP 8 — rapor toplamı', () => {
  it('tek bir FAIL tüm paketi operate dışı bırakır', () => {
    const out = dryRunPopulation(
      [rec({}), rec({ actorUserId: 'u-second', managerUserId: 'u-second' })],
      snapshot(),
    );
    expect(out.fail).toBe(1);
    expect(out.eligibleForOperate).toBe(false);
  });

  it('boş paket operate uygun ama yazımsızdır', () => {
    expect(dryRunPopulation([], snapshot())).toMatchObject({
      total: 0,
      pass: 0,
      fail: 0,
      noOp: 0,
      eligibleForOperate: true,
    });
  });

  it('PASS + NO_OP karışımı operate uygundur', () => {
    const s = snapshot({
      activeLines: [
        { tenantId: T1, actorUserId: 'u-actor', managerUserId: 'u-manager', disposition: 'MANAGED' },
      ],
    });
    const out = dryRunPopulation(
      [rec({}), rec({ actorUserId: 'u-second', managerUserId: 'u-manager' })],
      s,
    );
    expect(out).toMatchObject({ total: 2, pass: 1, noOp: 1, fail: 0, eligibleForOperate: true });
  });
});

describe('STEP 7 -> STEP 8 zinciri', () => {
  it('paketten çıkan kayıtlar dry-run dan geçer', () => {
    const pack = buildPopulationInputPack([
      candidate({ actorUserId: 'u-manager', disposition: 'TOP_LEVEL', managerUserId: null }),
      candidate({ actorUserId: 'u-actor', disposition: 'MANAGED', managerUserId: 'u-manager' }),
      candidate({ actorUserId: 'u-x', disposition: 'NON_AUTHORIZABLE' }),
    ]);
    expect(pack.records).toHaveLength(2);
    expect(pack.wellFormed).toBe(true);

    const out = dryRunPopulation(pack.records, snapshot());
    expect(out).toMatchObject({ total: 2, pass: 2, fail: 0, eligibleForOperate: true });
  });
});
