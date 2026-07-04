import {
  D6RetentionDecisionProvider,
  D6_RETENTION_POLICY_KEY,
  D6RetentionPolicy,
} from "../d6-retention-decision.provider";

// DBND-D6-RETENTION-POLICY (owner-locked, bkz `docs/design/d6-legal-semantics-triage.md` Q2
// + owner GO-ANALYZE kararları 2026-07-05)
describe("D6RetentionDecisionProvider.getPolicy", () => {
  let provider: D6RetentionDecisionProvider;

  const mockPrisma = {
    systemConfig: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new D6RetentionDecisionProvider(mockPrisma as any);
  });

  it("returns null when no SystemConfig row exists for the tenant (fail-closed: no policy = nothing eligible)", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue(null);

    const result = await provider.getPolicy("tenant-1");

    expect(result).toBeNull();
    expect(mockPrisma.systemConfig.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", key: D6_RETENTION_POLICY_KEY },
    });
  });

  it("returns null when the config exists but enabled is not explicitly true", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue({
      value: { enabled: false, resolvedRetentionDays: 1825 },
    });

    const result = await provider.getPolicy("tenant-1");

    expect(result).toBeNull();
  });

  it("returns null when the config value is missing enabled entirely", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue({ value: { resolvedRetentionDays: 1825 } });

    const result = await provider.getPolicy("tenant-1");

    expect(result).toBeNull();
  });

  it("returns a fully-populated policy when enabled=true and all fields are valid numbers", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue({
      value: { enabled: true, resolvedRetentionDays: 1825, caseClosureBufferDays: 730, hardCeilingDays: 3650 },
    });

    const result = await provider.getPolicy("tenant-1");

    expect(result).toEqual({
      enabled: true,
      resolvedRetentionDays: 1825,
      caseClosureBufferDays: 730,
      hardCeilingDays: 3650,
    });
  });

  it("defaults any non-number or missing dimension to null instead of throwing", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue({
      value: { enabled: true, resolvedRetentionDays: "not-a-number", caseClosureBufferDays: null },
    });

    const result = await provider.getPolicy("tenant-1");

    expect(result).toEqual({
      enabled: true,
      resolvedRetentionDays: null,
      caseClosureBufferDays: null,
      hardCeilingDays: null,
    });
  });
});

describe("D6RetentionDecisionProvider.isEligibleForDeletion", () => {
  let provider: D6RetentionDecisionProvider;

  beforeEach(() => {
    provider = new D6RetentionDecisionProvider({} as any);
  });

  const disabledPolicy: D6RetentionPolicy = {
    enabled: false,
    resolvedRetentionDays: 1,
    caseClosureBufferDays: 1,
    hardCeilingDays: 1,
  };

  function policy(overrides: Partial<D6RetentionPolicy> = {}): D6RetentionPolicy {
    return {
      enabled: true,
      resolvedRetentionDays: null,
      caseClosureBufferDays: null,
      hardCeilingDays: null,
      ...overrides,
    };
  }

  const NOW = new Date("2030-01-01T00:00:00Z");
  const CREATED = new Date("2020-01-01T00:00:00Z"); // NOW'dan 10 yıl önce
  const RESOLVED_LONG_AGO = new Date("2024-01-01T00:00:00Z"); // NOW'dan ~6 yıl önce
  const RESOLVED_RECENTLY = new Date("2029-12-01T00:00:00Z"); // NOW'dan 1 ay önce

  it("is never eligible when policy.enabled=false, regardless of how old the notification is", () => {
    const result = provider.isEligibleForDeletion(
      disabledPolicy,
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      true,
      NOW
    );
    expect(result).toBe(false);
  });

  it("is not eligible when no dimension is configured at all (fail-closed)", () => {
    const result = provider.isEligibleForDeletion(
      policy(),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      true,
      NOW
    );
    expect(result).toBe(false);
  });

  it("is eligible when only resolvedRetentionDays is configured and its threshold has passed", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1825 }), // ~5 yıl
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      false, // case açık olsa bile bu boyut tek başına yeterli
      NOW
    );
    expect(result).toBe(true);
  });

  it("is not eligible when only resolvedRetentionDays is configured and its threshold has NOT passed", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1825 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_RECENTLY, expiredAt: null, createdAt: CREATED },
      false,
      NOW
    );
    expect(result).toBe(false);
  });

  it("blocks eligibility when only caseClosureBufferDays is configured and the case is still open (even if a long time has passed)", () => {
    const result = provider.isEligibleForDeletion(
      policy({ caseClosureBufferDays: 730 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      false, // case AÇIK
      NOW
    );
    expect(result).toBe(false);
  });

  it("is eligible when only caseClosureBufferDays is configured, the case is closed, and its threshold has passed", () => {
    const result = provider.isEligibleForDeletion(
      policy({ caseClosureBufferDays: 730 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      true, // case KAPALI
      NOW
    );
    expect(result).toBe(true);
  });

  it("is NOT eligible when caseClosureBufferDays is configured, the case is closed, but its threshold has not yet passed", () => {
    const result = provider.isEligibleForDeletion(
      policy({ caseClosureBufferDays: 730 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_RECENTLY, expiredAt: null, createdAt: CREATED },
      true,
      NOW
    );
    expect(result).toBe(false);
  });

  it("blocks eligibility when BOTH dimensions are configured but the case is still open, even though resolvedRetentionDays alone would qualify", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1, caseClosureBufferDays: 730 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      false, // case AÇIK → caseClosure boyutu bloke eder
      NOW
    );
    expect(result).toBe(false);
  });

  it("requires BOTH thresholds to be satisfied when both dimensions are configured and the case is closed (whichever is longer wins)", () => {
    // resolvedRetentionDays çok kısa (1 gün, geçilmiş) ama caseClosureBufferDays çok uzun (10000 gün, geçilmemiş)
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1, caseClosureBufferDays: 10000 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      true,
      NOW
    );
    expect(result).toBe(false);
  });

  it("is eligible once BOTH configured thresholds have passed", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1825, caseClosureBufferDays: 730 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_LONG_AGO, expiredAt: null, createdAt: CREATED },
      true,
      NOW
    );
    expect(result).toBe(true);
  });

  it("hardCeilingDays overrides everything once passed, even with the case still open and no other dimension configured", () => {
    const result = provider.isEligibleForDeletion(
      policy({ hardCeilingDays: 3650 }), // 10 yıl, CREATED tam 10 yıl önce → NOW'da eşit/geçmiş
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_RECENTLY, expiredAt: null, createdAt: CREATED },
      false,
      NOW
    );
    expect(result).toBe(true);
  });

  it("hardCeilingDays does not force eligibility before it is actually reached", () => {
    const result = provider.isEligibleForDeletion(
      policy({ hardCeilingDays: 4000 }), // 10 yıllık aralıktan (artık yıllar dahil ~3653 gün) belirgin şekilde fazla — henüz geçmedi
      { status: "ACKNOWLEDGED", acknowledgedAt: RESOLVED_RECENTLY, expiredAt: null, createdAt: CREATED },
      false,
      NOW
    );
    expect(result).toBe(false);
  });

  it("is not eligible when the resolution timestamp is null (defensive — should not normally happen), even with a configured dimension", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1 }),
      { status: "ACKNOWLEDGED", acknowledgedAt: null, expiredAt: null, createdAt: CREATED },
      false,
      NOW
    );
    expect(result).toBe(false);
  });

  it("uses expiredAt (not acknowledgedAt) for EXPIRED-status notifications", () => {
    const result = provider.isEligibleForDeletion(
      policy({ resolvedRetentionDays: 1825 }),
      { status: "EXPIRED", acknowledgedAt: null, expiredAt: RESOLVED_LONG_AGO, createdAt: CREATED },
      false,
      NOW
    );
    expect(result).toBe(true);
  });
});
