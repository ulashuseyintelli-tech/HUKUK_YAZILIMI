/**
 * OFFICE-CREDENTIAL-FIELD-RESPONSE-CONTAINMENT-P01 doğrulama matrisi.
 *
 * Doğrulanmış bulgu: `Lawyer` credential alanları (`uyapToken`, `eSignatureSerial`)
 * public API yanıtlarına çıkıyordu — Lawyer modülünün TÜM yüzeylerinde ve
 * `GET/PUT /office` içinde nested olarak. Bu spec her yüzeyi GERÇEK servis kodu
 * üzerinden (mock Prisma tam satır döndürür) sınar: anahtar TAMAMEN YOK olmalı.
 */
import { LawyerService } from '../lawyer.service';
import { OfficeService } from '../../office/office.service';
import {
  LAWYER_CREDENTIAL_FIELDS,
  toPublicLawyer,
  toPublicLawyers,
  withPublicLawyers,
} from '../lawyer-public-projection';

const TENANT = 't1';
const audit: any = { log: jest.fn(), logInTransaction: jest.fn() };

/** Prisma'nın `select` olmadan döndürdüğü TAM satır — credential alanları DAHİL. */
const FULL_ROW = {
  id: 'L1',
  tenantId: TENANT,
  officeId: 'O1',
  name: 'Ada',
  surname: 'Lovelace',
  title: null,
  role: 'EMPLOYEE',
  tckn: '12345678901',
  iban: 'TR330006100519786457841326',
  identityNo: '98765432109',
  barNumber: 'B-1',
  lawyerRank: 'PARTNER',
  canApproveOfficeActions: false,
  uyapUsername: 'uyap-user',
  uyapToken: 'SENTETIK-UYAP-TOKEN-DEGERI',
  eSignatureSerial: 'SENTETIK-ESIG-SERI',
  isActive: true,
  sortOrder: 0,
  userId: null,
  createdAt: new Date('2026-07-30T00:00:00.000Z'),
  updatedAt: new Date('2026-07-30T00:00:00.000Z'),
};

const assertContained = (payload: unknown, label: string) => {
  const s = JSON.stringify(payload);
  for (const f of LAWYER_CREDENTIAL_FIELDS) {
    expect(s).not.toContain(f);
  }
  // Deger de sizmamali (anahtar silinince deger de gider; ikili guvence).
  expect(s).not.toContain('SENTETIK-UYAP-TOKEN-DEGERI');
  expect(s).not.toContain('SENTETIK-ESIG-SERI');
  expect(label).toBeTruthy();
};

// ---------------------------------------------------------------------------
// 1) Saf projeksiyon sözleşmesi
// ---------------------------------------------------------------------------
describe('projeksiyon sozlesmesi', () => {
  it('kapsam SABIT: yalniz iki credential alani (scope creep guard)', () => {
    expect([...LAWYER_CREDENTIAL_FIELDS]).toEqual(['uyapToken', 'eSignatureSerial']);
  });

  it('anahtar TAMAMEN kaldirilir — null/undefined DEGIL', () => {
    const out = toPublicLawyer(FULL_ROW);
    expect('uyapToken' in out).toBe(false);
    expect('eSignatureSerial' in out).toBe(false);
    expect(Object.keys(out)).not.toContain('uyapToken');
    expect(Object.keys(out)).not.toContain('eSignatureSerial');
  });

  it('diger TUM alanlar korunur (public contract bozulmaz)', () => {
    const out: any = toPublicLawyer(FULL_ROW);
    expect(out.id).toBe('L1');
    expect(out.name).toBe('Ada');
    expect(out.uyapUsername).toBe('uyap-user'); // kullanici ADI credential DEGIL
    expect(out.lawyerRank).toBe('PARTNER');
    expect(out.isActive).toBe(true);
    expect(Object.keys(out).length).toBe(Object.keys(FULL_ROW).length - 2);
  });

  it('girdi MUTATE edilmez (cagiranin satiri bozulmaz)', () => {
    const input = { ...FULL_ROW };
    toPublicLawyer(input);
    expect(input.uyapToken).toBe('SENTETIK-UYAP-TOKEN-DEGERI');
  });

  it('idempotent: iki kez uygulanmasi sonucu degistirmez', () => {
    expect(toPublicLawyer(toPublicLawyer(FULL_ROW))).toEqual(toPublicLawyer(FULL_ROW));
  });

  it('credential alani olmayan satir etkilenmez', () => {
    const plain = { id: 'L2', name: 'X' };
    expect(toPublicLawyer(plain)).toEqual(plain);
  });

  it('liste projeksiyonu + bos dizi', () => {
    const out = toPublicLawyers([FULL_ROW, { ...FULL_ROW, id: 'L2' }]);
    expect(out).toHaveLength(2);
    assertContained(out, 'toPublicLawyers');
    expect(toPublicLawyers([])).toEqual([]);
  });

  it('nested kapsayici: yalniz lawyers projekte edilir, digerleri DEGISMEZ', () => {
    const office = { id: 'O1', name: 'Buro', bankAccounts: [{ id: 'BA1' }], lawyers: [FULL_ROW] };
    const out = withPublicLawyers(office);
    expect(out.id).toBe('O1');
    expect(out.name).toBe('Buro');
    expect(out.bankAccounts).toEqual([{ id: 'BA1' }]);
    expect(out.lawyers).toHaveLength(1);
    assertContained(out, 'withPublicLawyers');
  });

  it('tip duzeyinde de erisilemez (compile-time assertion)', () => {
    const out = toPublicLawyer(FULL_ROW);
    // @ts-expect-error — credential alani public tipte YOKTUR
    out.uyapToken;
    // @ts-expect-error — credential alani public tipte YOKTUR
    out.eSignatureSerial;
  });
});

// ---------------------------------------------------------------------------
// 2) LawyerService — gerçek kod yolları
// ---------------------------------------------------------------------------
const buildLawyerSvc = (rows: any[]) => {
  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((r) => r.id === (where.id ?? r.id)) ?? null),
        ),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      create: jest.fn().mockResolvedValue({ ...FULL_ROW, id: 'NEW' }),
      update: jest.fn().mockResolvedValue({ ...FULL_ROW, name: 'Guncel' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    office: { findUnique: jest.fn().mockResolvedValue({ id: 'O1' }) },
    user: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    caseLawyer: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fn: any) =>
      typeof fn === 'function'
        ? fn({
            lawyer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            caseLawyer: { update: jest.fn() },
          })
        : Promise.resolve([]),
    ),
  };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma };
};

describe('LawyerService — her yuzeyde credential alanlari YOK', () => {
  it('findAll (GET /lawyers)', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW }]);
    const res: any = await svc.findAll(TENANT);
    expect(res).toHaveLength(1);
    expect('uyapToken' in res[0]).toBe(false);
    expect('eSignatureSerial' in res[0]).toBe(false);
    assertContained(res, 'findAll');
    // Mevcut sozlesme korunur: displayName + maskeleme.
    expect(res[0].displayName).toBe('Av. Ada Lovelace');
    expect(res[0].tckn).toBe('123****01');
  });

  it('findAll includeInactive=true (pasif avukat) da temiz', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW, isActive: false }]);
    const res: any = await svc.findAll(TENANT, undefined, true);
    assertContained(res, 'findAll-inactive');
    expect('uyapToken' in res[0]).toBe(false);
  });

  it('findDefaults (GET /lawyers/defaults)', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW }]);
    const res: any = await svc.findDefaults(TENANT);
    expect('uyapToken' in res[0]).toBe(false);
    assertContained(res, 'findDefaults');
  });

  it('findOne (GET /lawyers/:id)', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW }]);
    const res: any = await svc.findOne(TENANT, 'L1');
    expect('uyapToken' in res).toBe(false);
    expect('eSignatureSerial' in res).toBe(false);
    assertContained(res, 'findOne');
    expect(res.displayName).toBe('Av. Ada Lovelace');
  });

  it('create — yeni kayit (POST /lawyers)', async () => {
    const { svc } = buildLawyerSvc([]);
    const res: any = await svc.create(TENANT, { name: 'Yeni', surname: 'Avukat' });
    expect('uyapToken' in res).toBe(false);
    assertContained(res, 'create-new');
  });

  it('create — duplicate/reactivate dali (mevcut kayit dondurulur)', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW, isActive: false }]);
    const res: any = await svc.create(TENANT, { name: 'Ada', surname: 'Lovelace' });
    expect(res._existingReturned).toBe(true);
    expect('uyapToken' in res).toBe(false);
    assertContained(res, 'create-duplicate');
  });

  it('update (PUT/PATCH /lawyers/:id)', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW }]);
    const res: any = await svc.update(TENANT, 'L1', { phone: '555' }, { userId: 'U1', role: 'ADMIN' });
    expect('uyapToken' in res).toBe(false);
    assertContained(res, 'update');
  });

  it('delete (DELETE /lawyers/:id) — tum persistence satiri DONMEZ', async () => {
    const { svc } = buildLawyerSvc([{ ...FULL_ROW }]);
    const res: any = await svc.delete(TENANT, 'L1', { userId: 'U1' });
    expect(res.isActive).toBe(false);
    expect('uyapToken' in res).toBe(false);
    expect('eSignatureSerial' in res).toBe(false);
    assertContained(res, 'delete');
  });

  it('cross-tenant findOne davranisi DEGISMEZ (bulunamaz -> throw)', async () => {
    const { svc } = buildLawyerSvc([]);
    await expect(svc.findOne(TENANT, 'YOK')).rejects.toThrow();
  });

  it('tenant scoping korunur: findMany WHERE tenantId tasir', async () => {
    const { svc, prisma } = buildLawyerSvc([{ ...FULL_ROW }]);
    await svc.findAll(TENANT);
    expect(prisma.lawyer.findMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
  });
});

// ---------------------------------------------------------------------------
// 3) OfficeService — nested lawyers
// ---------------------------------------------------------------------------
describe('OfficeService — nested lawyers credential alanlari YOK', () => {
  const buildOfficeSvc = () => {
    const officeRow = {
      id: 'O1',
      tenantId: TENANT,
      name: 'Buro',
      bankAccounts: [],
      lawyers: [{ ...FULL_ROW }],
    };
    const prisma: any = {
      office: {
        findUnique: jest.fn().mockResolvedValue(officeRow),
        create: jest.fn().mockResolvedValue(officeRow),
        update: jest.fn().mockResolvedValue({ ...officeRow, name: 'Yeni Buro' }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'T' }) },
    };
    return new OfficeService(prisma, audit);
  };

  it('getOrCreate (GET /office)', async () => {
    const res: any = await buildOfficeSvc().getOrCreate(TENANT);
    expect(res.lawyers).toHaveLength(1);
    expect('uyapToken' in res.lawyers[0]).toBe(false);
    expect('eSignatureSerial' in res.lawyers[0]).toBe(false);
    assertContained(res, 'office.getOrCreate');
    expect(res.id).toBe('O1');
  });

  it('update (PUT /office)', async () => {
    const res: any = await buildOfficeSvc().update(TENANT, { name: 'Yeni Buro' }, 'U1');
    expect('uyapToken' in res.lawyers[0]).toBe(false);
    assertContained(res, 'office.update');
    expect(res.name).toBe('Yeni Buro');
  });
});

// ---------------------------------------------------------------------------
// 4) Kaynak taraması — projeksiyondan kaçan dönüş kalmadı
// ---------------------------------------------------------------------------
describe('kaynak taramasi — kacak donus yok', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');

  it('lawyer.service: Lawyer satiri dondururken projeksiyon ATLANMAZ', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lawyer.service.ts'), 'utf8');
    // Projeksiyonsuz ham donus desenleri KALMAMALI.
    expect(src).not.toMatch(/return withDisplayName\(/);
    expect(src).not.toMatch(/return withDisplayNames\(/);
    expect(src).not.toMatch(/return \{ \.\.\.existing, isActive: false \};/);
    // Projeksiyon fiilen kullaniliyor.
    expect(src).toContain('toPublicLawyer');
    expect(src).toContain('toPublicLawyers');
  });

  it('office.service: nested lawyers projeksiyonu uygulanir', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'office', 'office.service.ts'),
      'utf8',
    );
    expect(src).toContain('withPublicLawyers');
  });
});
