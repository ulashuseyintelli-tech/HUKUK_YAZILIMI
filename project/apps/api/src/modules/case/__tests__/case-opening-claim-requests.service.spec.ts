import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CaseOpeningClaimRequestsService, describeOpeningClaimRequestRejection } from '../case-opening-claim-requests.service';
import { evaluateOpeningClaimRequests, type OpeningClaimPlan } from '../opening-claim-requests';

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI — servis dalları (taklit bağımlılıklarla; uçtan uca akış HTTP + PostgreSQL testinde).
 *
 * Kanıtlanan: açılış öncesi kabul hiçbir bağımlılığa dokunmadan reddeder; talepler dosya açılış işleminin İÇİNDE,
 * mevcut yollarla (kalem güncelleme + seçim önizleme / talep) ve aynı transaction istemcisiyle açılır; herhangi bir
 * talep açılamazsa hata yükselir (çağıranın işlemi geri alınır) — eksik adım sessiz geçilmez.
 */
const FLAG = 'CLAIM_LIABILITY_SELECTION_ENABLED';
const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestAccrualStatus: 'UNKNOWN' };
const dues = [
  { type: 'VEKALET_UCRETI', amount: 1000, dueDate: '2025-04-02', attorneyFeeBasis: 'JUDGMENT_AWARDED', ...yasal },
  { type: 'YARGILAMA_GIDERI', amount: 200, dueDate: '2025-04-02', ...yasal },
];
const caseDebtors = [{ debtorId: 'd1' }, { debtorId: 'd2' }];
const accrual = (dueIndex: number) => ({ dueIndex, interestStartDate: '2025-04-02', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' });
const selection = (dueIndex: number) => ({
  dueIndex,
  mode: 'PROPORTIONAL',
  basis: 'COURT_JUDGMENT',
  parties: [
    { debtorId: 'd1', shareWeight: 1 },
    { debtorId: 'd2', shareWeight: 1 },
  ],
});
const requests = { interestAccruals: [accrual(0)], liabilitySelections: [selection(0)] };
const hashOf = (r: unknown) =>
  evaluateOpeningClaimRequests({ currency: 'TRY', dues: dues as never, debtorIds: ['d1', 'd2'], requests: r as never }).preview.onizlemeOzeti;
const planOf = (r: unknown): OpeningClaimPlan =>
  evaluateOpeningClaimRequests({ currency: 'TRY', dues: dues as never, debtorIds: ['d1', 'd2'], requests: r as never }).plan;
const dto = (openingClaimRequests: unknown) => ({ fileNumber: 'X', type: 'GENERAL_EXECUTION', currency: 'TRY', dues, caseDebtors, openingClaimRequests }) as never;

function build(overrides: { claimItems?: unknown; liability?: unknown; caseDebtorRows?: unknown[] } = {}) {
  const tx = {
    caseDebtor: { findMany: jest.fn().mockResolvedValue(overrides.caseDebtorRows ?? [{ id: 'cd1', debtorId: 'd1' }, { id: 'cd2', debtorId: 'd2' }]) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const claimItems =
    'claimItems' in overrides
      ? overrides.claimItems
      : { updateFromUser: jest.fn().mockResolvedValue({ applied: false, approvalRequired: true, approvalRequestId: 'apr-faiz' }) };
  const liability =
    'liability' in overrides
      ? overrides.liability
      : {
          preview: jest.fn().mockResolvedValue({ uygulanabilir: true, onizlemeOzeti: 'ozet-1' }),
          request: jest.fn().mockResolvedValue({ approvalRequestId: 'apr-secim' }),
        };
  const service = new CaseOpeningClaimRequestsService(claimItems as never, liability as never);
  return { service, tx, claimItems: claimItems as any, liability: liability as any };
}
const run = (built: ReturnType<typeof build>, plan: OpeningClaimPlan, ids: Array<string | null> = ['ci-0', 'ci-1']) =>
  built.service.requestInTransaction(built.tx as never, { tenantId: 't1', userId: 'u1', caseId: 'c1', plan, claimItemIdByDueIndex: ids });
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return { status: (error as any).getStatus?.(), body: (error as any).getResponse?.() };
  }
  throw new Error('hata bekleniyordu');
};

describe('Açılış kalem beyanları — açılış öncesi kabul', () => {
  const saved = process.env[FLAG];
  beforeEach(() => {
    process.env[FLAG] = 'true';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
  });

  it('beyan yoksa null: açılış bugünkü gibidir (boş blok dahil)', () => {
    const { service } = build();
    expect(service.assertAdmissible(dto(undefined))).toBeNull();
    expect(service.assertAdmissible(dto({ interestAccruals: [], liabilitySelections: [], previewHash: 'x' }))).toBeNull();
  });

  it('geçerli beyan + gösterilen önizlemenin özeti → plan', () => {
    const { service } = build();
    const plan = service.assertAdmissible(dto({ ...requests, previewHash: hashOf(requests) }));
    expect(plan).toMatchObject({ interestAccruals: [{ dueIndex: 0 }], liabilitySelections: [{ dueIndex: 0, mode: 'PROPORTIONAL' }] });
  });

  it('geçersiz beyan → 400 ve hata listesi; özet uyuşmazlığı → 409; kapalı bayrakta seçim → 409', () => {
    const { service, tx, claimItems } = build();
    const invalid = { interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'JUDGMENT_DATE' }] };
    expect(() => service.assertAdmissible(dto({ ...invalid, previewHash: hashOf(invalid) }))).toThrow(BadRequestException);
    expect(() => service.assertAdmissible(dto({ ...requests, previewHash: 'baska-ozet' }))).toThrow(ConflictException);
    process.env[FLAG] = 'false';
    expect(() => service.assertAdmissible(dto({ ...requests, previewHash: hashOf(requests) }))).toThrow(ConflictException);
    // Bayrak yalnız SEÇİMİ kapatır: faiz beyanı aynı ortamda kabul edilir.
    const onlyInterest = { interestAccruals: [accrual(0)] };
    expect(service.assertAdmissible(dto({ ...onlyInterest, previewHash: hashOf(onlyInterest) }))).not.toBeNull();
    // Kabul saf: veritabanına, denetime ve talep yollarına dokunmaz.
    expect(tx.caseDebtor.findMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(claimItems.updateFromUser).not.toHaveBeenCalled();
  });

  it('önizleme yanıtı seçim bayrağının durumunu taşır', () => {
    const { service } = build();
    expect(service.preview({ currency: 'TRY', dues, caseDebtors } as never).secimYazmaAcik).toBe(true);
    process.env[FLAG] = 'false';
    expect(service.preview({ currency: 'TRY', dues, caseDebtors } as never).secimYazmaAcik).toBe(false);
  });
});

describe('Açılış kalem beyanları — talepler dosya açılış işleminin İÇİNDE açılır', () => {
  it('mevcut yollar AYNI transaction istemcisiyle ve aynı girdiyle çağrılır; kişi kimliği dosya borçlusu satırına çevrilir', async () => {
    const built = build();
    const outcome = await run(built, planOf(requests));
    expect(built.claimItems.updateFromUser).toHaveBeenCalledWith(
      't1',
      'u1',
      'ci-0',
      { interestAccrualStatus: 'ACCRUES', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE', interestStartDate: '2025-04-02' },
      built.tx,
    );
    const expectedDrafts = [
      {
        claimItemId: 'ci-0',
        mode: 'PROPORTIONAL',
        basis: 'COURT_JUDGMENT',
        basisNote: null,
        parties: [
          { caseDebtorId: 'cd1', shareWeight: 1 },
          { caseDebtorId: 'cd2', shareWeight: 1 },
        ],
      },
    ];
    expect(built.liability.preview).toHaveBeenCalledWith('t1', 'u1', 'c1', expectedDrafts, built.tx);
    expect(built.liability.request).toHaveBeenCalledWith('t1', 'u1', 'c1', { selections: expectedDrafts, onizlemeOzeti: 'ozet-1' }, built.tx);
    expect(outcome).toEqual({
      requested: true,
      previewHash: planOf(requests).previewHash,
      tamami: true,
      onaySirasiNotu: null,
      aciklama: expect.any(String),
      faizBeyanlari: [{ dueIndex: 0, claimItemId: 'ci-0', status: 'REQUESTED', approvalRequestId: 'apr-faiz' }],
      sorumlulukSecimi: { status: 'REQUESTED', kalemSayisi: 1, approvalRequestId: 'apr-secim' },
    });
    // Denetim kaydı AYNI işlemde: önizleme özeti + onay talebi kimlikleri.
    expect(built.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        action: 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED',
        entityType: 'Case',
        entityId: 'c1',
        userId: 'u1',
        metadata: {
          previewHash: planOf(requests).previewHash,
          faizBeyanlari: [{ dueIndex: 0, claimItemId: 'ci-0', approvalRequestId: 'apr-faiz' }],
          sorumlulukSecimi: { kalemSayisi: 1, approvalRequestId: 'apr-secim' },
        },
      }),
    });
  });

  it('"takip tarihi" dayanağında başlangıç tarihi gönderilmez', async () => {
    const mixed = { interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' }] };
    const built = build();
    await run(built, planOf(mixed));
    expect(built.claimItems.updateFromUser).toHaveBeenCalledWith(
      't1',
      'u1',
      'ci-0',
      { interestAccrualStatus: 'ACCRUES', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' },
      built.tx,
    );
    expect(built.liability.preview).not.toHaveBeenCalled();
  });

  it('yazma kapısı reddederse hata yükselir (403 + okunur neden + satır); denetim kaydı YAZILMAZ — dosya işlemi geri alınır', async () => {
    const built = build({
      claimItems: { updateFromUser: jest.fn().mockRejectedValue(new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED')) },
    });
    const { status, body } = await rejection(run(built, planOf(requests)));
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'OPENING_CLAIM_REQUESTS_NOT_OPENED', reasonCode: 'CASE_FINANCE_PERMISSION_REQUIRED', dueIndex: 0 });
    expect(body.message).toContain('dosya oluşturulmadı');
    expect(built.liability.request).not.toHaveBeenCalled();
    expect(built.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('seçim talebi reddedilirse (ör. bekleyen farklı talep) 409 ile yükselir; faiz talebi açılmış olsa da işlem bütün olarak düşer', async () => {
    const built = build({
      liability: {
        preview: jest.fn().mockResolvedValue({ uygulanabilir: true, onizlemeOzeti: 'ozet-1' }),
        request: jest.fn().mockRejectedValue(new ConflictException({ code: 'LIABILITY_SELECTION_PENDING_CONFLICT', message: 'bekleyen talep var' })),
      },
    });
    const { status, body } = await rejection(run(built, planOf(requests)));
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'OPENING_CLAIM_REQUESTS_NOT_OPENED', reasonCode: 'LIABILITY_SELECTION_PENDING_CONFLICT' });
    expect(built.claimItems.updateFromUser).toHaveBeenCalledTimes(1);
    expect(built.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['kalem oluşmadı (faiz)', { ids: [null, 'ci-1'] as Array<string | null> }, 'CLAIM_ITEM_NOT_CREATED'],
    ['önizleme uygulanamıyor', { liability: { preview: jest.fn().mockResolvedValue({ uygulanabilir: false, onizlemeOzeti: 'x' }), request: jest.fn() } }, 'LIABILITY_SELECTION_NOT_APPLICABLE'],
    ['borçlu dosya borçlusu olarak yok', { caseDebtorRows: [{ id: 'cd1', debtorId: 'd1' }] }, 'CASE_DEBTOR_NOT_CREATED'],
    ['onay gerekmedi (beklenmeyen)', { claimItems: { updateFromUser: jest.fn().mockResolvedValue({ applied: true, approvalRequired: false }) } }, 'APPROVAL_NOT_REQUIRED_UNEXPECTED'],
    ['kalem servisi bağlı değil', { claimItems: undefined }, 'CLAIM_ITEM_SERVICE_UNAVAILABLE'],
    ['seçim servisi bağlı değil', { liability: undefined }, 'LIABILITY_SELECTION_SERVICE_UNAVAILABLE'],
  ])('eksik adım sessiz geçilmez: %s → hata (dosya oluşmaz)', async (_ad, over, reasonCode) => {
    const { ids, ...overrides } = over as { ids?: Array<string | null> };
    const built = build(overrides);
    const { status, body } = await rejection(run(built, planOf(requests), ids));
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'OPENING_CLAIM_REQUESTS_NOT_OPENED', reasonCode });
    expect(built.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('beklenmeyen iç hata olduğu gibi yükselir (işlem geri alınır); ham metin kullanıcı iletisine çevrilmez', async () => {
    const built = build({ claimItems: { updateFromUser: jest.fn().mockRejectedValue(new Error('iç ayrıntı: bağlantı koptu')) } });
    await expect(run(built, planOf(requests))).rejects.toThrow('iç ayrıntı: bağlantı koptu');
    expect(built.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('describeOpeningClaimRequestRejection', () => {
  it('yazma kapısı reddi kararlı koda ve Türkçe açıklamaya çevrilir; tanınmayan neden kodu korunur', () => {
    expect(describeOpeningClaimRequestRejection(new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED')).errorCode).toBe(
      'CASE_FINANCE_PERMISSION_REQUIRED',
    );
    expect(describeOpeningClaimRequestRejection(new ForbiddenException('ClaimItem write denied: YENI_NEDEN')).errorCode).toBe('CLAIM_ITEM_WRITE_DENIED:YENI_NEDEN');
    expect(describeOpeningClaimRequestRejection(new ConflictException({ code: 'LIABILITY_SELECTION_PENDING_CONFLICT', message: 'bekleyen talep var' }))).toEqual({
      errorCode: 'LIABILITY_SELECTION_PENDING_CONFLICT',
      message: 'bekleyen talep var',
    });
    // Beklenmeyen iç hatanın ham metni kullanıcıya TAŞINMAZ (genel ileti); mevcut kapıların iletisi korunur.
    const beklenmeyen = describeOpeningClaimRequestRejection(new Error('iç ayrıntı: tablo x sütun y'));
    expect(beklenmeyen.errorCode).toBe('OPENING_CLAIM_REQUEST_FAILED');
    expect(beklenmeyen.message).not.toContain('iç ayrıntı');
  });
});
