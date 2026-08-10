import { ClientFinancialDisclosureOfficeService } from '../client-financial-disclosure-office-service';
import {
  buildPreparationReference,
  preparationReferenceEquals,
} from '../client-financial-disclosure-preparation-reference';
import { isPrepareEligibleUser } from '../client-financial-disclosure-prepare-eligibility';
import { OfficeDisclosureProjectionNotFoundError } from '../client-financial-disclosure-office-contract';

// PR-1.2 — X1 ofis komut yolunun guvenlik sozlesmesi.
//
// Istemci HAM disposition ID gormez/gondermez; yalniz tek yonlu preparationReference
// tasir. Sunucu referansi TERSINE CEVIRMEZ: yalniz bu aktorun/tenant'in gercekten
// uygun adaylarini yeniden hash'leyip sabit-zamanli karsilastirir.

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const CLIENT = 'client-1';
const DISPOSITION = 'disp-1';

function prismaStub(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'actor-1' }),
      findUnique: jest.fn().mockResolvedValue({
        isActive: true,
        tenantId: TENANT,
        lawyer: { id: 'lawyer-1' },
        staffMember: null,
      }),
    },
    client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT }) },
    caseClient: { findMany: jest.fn().mockResolvedValue([{ id: 'case-client-1' }]) },
    collectionDisposition: { findMany: jest.fn().mockResolvedValue([{ id: DISPOSITION }]) },
    ...overrides,
  } as never;
}

const scope = { tenantId: TENANT, actorUserId: 'actor-1', clientId: CLIENT };

describe('preparationReference — tek kanonik uretec', () => {
  it('tenant + disposition icin deterministiktir', () => {
    expect(buildPreparationReference(TENANT, DISPOSITION)).toBe(
      buildPreparationReference(TENANT, DISPOSITION),
    );
  });

  it('ham disposition ID ICERMEZ (tek yonludur)', () => {
    const ref = buildPreparationReference(TENANT, DISPOSITION);
    expect(ref).not.toContain(DISPOSITION);
    expect(ref).not.toContain(TENANT);
  });

  it('tenant degisince referans DEGISIR (cross-tenant replay engellenir)', () => {
    expect(buildPreparationReference(TENANT, DISPOSITION)).not.toBe(
      buildPreparationReference(OTHER_TENANT, DISPOSITION),
    );
  });

  it('esitlik karsilastirmasi uzunluk/deger farkinda false doner', () => {
    const a = buildPreparationReference(TENANT, DISPOSITION);
    expect(preparationReferenceEquals(a, a)).toBe(true);
    expect(preparationReferenceEquals(a, a.slice(0, -1))).toBe(false);
    expect(preparationReferenceEquals(a, buildPreparationReference(TENANT, 'disp-2'))).toBe(false);
    expect(preparationReferenceEquals(a, undefined as unknown as string)).toBe(false);
  });
});

describe('isPrepareEligibleUser — tek kanonik predikat', () => {
  const base = { isActive: true, tenantId: TENANT, lawyer: null, staffMember: null };

  it('bagli avukat -> true', () => {
    expect(isPrepareEligibleUser({ ...base, lawyer: { id: 'l1' } }, TENANT)).toBe(true);
  });

  it('MUHASEBE + canPrepare -> true', () => {
    expect(
      isPrepareEligibleUser(
        { ...base, staffMember: { staffType: 'MUHASEBE', canPrepareCollectionDisposition: true } },
        TENANT,
      ),
    ).toBe(true);
  });

  it('MUHASEBE fakat canPrepare=false -> false', () => {
    expect(
      isPrepareEligibleUser(
        { ...base, staffMember: { staffType: 'MUHASEBE', canPrepareCollectionDisposition: false } },
        TENANT,
      ),
    ).toBe(false);
  });

  it('baska staffType -> false', () => {
    expect(
      isPrepareEligibleUser(
        { ...base, staffMember: { staffType: 'SEKRETER', canPrepareCollectionDisposition: true } },
        TENANT,
      ),
    ).toBe(false);
  });

  it('pasif hesap / tenant uyusmazligi / null -> false', () => {
    expect(isPrepareEligibleUser({ ...base, isActive: false, lawyer: { id: 'l1' } }, TENANT)).toBe(false);
    expect(isPrepareEligibleUser({ ...base, lawyer: { id: 'l1' } }, OTHER_TENANT)).toBe(false);
    expect(isPrepareEligibleUser(null, TENANT)).toBe(false);
  });
});

describe('resolvePreparationSourceDispositionId — fail-closed cozum', () => {
  it('gecerli referans -> server-side disposition ID', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(prismaStub());
    const ref = buildPreparationReference(TENANT, DISPOSITION);
    await expect(svc.resolvePreparationSourceDispositionId(scope, ref)).resolves.toBe(DISPOSITION);
  });

  it('KURCALANMIS referans -> NotFound (varlik bilgisi sizmaz)', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(prismaStub());
    const ref = buildPreparationReference(TENANT, DISPOSITION);
    const tampered = `${ref.slice(0, -1)}${ref.endsWith('A') ? 'B' : 'A'}`;
    await expect(svc.resolvePreparationSourceDispositionId(scope, tampered)).rejects.toBeInstanceOf(
      OfficeDisclosureProjectionNotFoundError,
    );
  });

  it('BASKA TENANT referansi -> NotFound', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(prismaStub());
    const foreign = buildPreparationReference(OTHER_TENANT, DISPOSITION);
    await expect(svc.resolvePreparationSourceDispositionId(scope, foreign)).rejects.toBeInstanceOf(
      OfficeDisclosureProjectionNotFoundError,
    );
  });

  it('bicimsiz/bos referans -> NotFound', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(prismaStub());
    await expect(svc.resolvePreparationSourceDispositionId(scope, '')).rejects.toBeInstanceOf(
      OfficeDisclosureProjectionNotFoundError,
    );
  });

  it('uygun aday YOKSA (POSTED degil / kapsam disi) -> NotFound', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(
      prismaStub({ collectionDisposition: { findMany: jest.fn().mockResolvedValue([]) } }),
    );
    const ref = buildPreparationReference(TENANT, DISPOSITION);
    await expect(svc.resolvePreparationSourceDispositionId(scope, ref)).rejects.toBeInstanceOf(
      OfficeDisclosureProjectionNotFoundError,
    );
  });

  it('client kapsami bos -> NotFound (client isolation)', async () => {
    const svc = new ClientFinancialDisclosureOfficeService(
      prismaStub({ caseClient: { findMany: jest.fn().mockResolvedValue([]) } }),
    );
    const ref = buildPreparationReference(TENANT, DISPOSITION);
    await expect(svc.resolvePreparationSourceDispositionId(scope, ref)).rejects.toBeInstanceOf(
      OfficeDisclosureProjectionNotFoundError,
    );
  });

  it('aday sorgusu YALNIZ POSTED + SINGLE_CASE_CLIENT + kapsam ici caseClient ile yapilir', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: DISPOSITION }]);
    const svc = new ClientFinancialDisclosureOfficeService(
      prismaStub({ collectionDisposition: { findMany } }),
    );
    await svc.resolvePreparationSourceDispositionId(
      scope,
      buildPreparationReference(TENANT, DISPOSITION),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.status).toBe('POSTED');
    expect(where.beneficiaryScope).toBe('SINGLE_CASE_CLIENT');
    expect(where.caseClientId).toEqual({ in: ['case-client-1'] });
  });
});
