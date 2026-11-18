import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CaseOpeningClaimRequestsService, describeOpeningClaimRequestRejection } from '../case-opening-claim-requests.service';
import { evaluateOpeningClaimRequests, type OpeningClaimPlan } from '../opening-claim-requests';

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI — servis dalları (taklit bağımlılıklarla; uçtan uca akış HTTP + PostgreSQL testinde).
 *
 * Kanıtlanan: açılış öncesi kabul hiçbir bağımlılığa dokunmadan reddeder; kayıt sonrası adım HİÇBİR durumda hata
 * fırlatmaz (dosya açılışı geri alınamaz), her beyanın sonucunu ayrı raporlar ve mevcut yolları (kalem güncelleme +
 * seçim önizleme / talep) aynı girdilerle çağırır.
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

function build(overrides: { claimItems?: unknown; liability?: unknown; caseDebtorRows?: unknown[]; auditFails?: boolean } = {}) {
  const prisma = { caseDebtor: { findMany: jest.fn().mockResolvedValue(overrides.caseDebtorRows ?? [{ id: 'cd1', debtorId: 'd1' }, { id: 'cd2', debtorId: 'd2' }]) } };
  const audit = { log: overrides.auditFails ? jest.fn().mockRejectedValue(new Error('denetim yazılamadı')) : jest.fn().mockResolvedValue(undefined) };
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
  const service = new CaseOpeningClaimRequestsService(prisma as never, audit as never, claimItems as never, liability as never);
  return { service, prisma, audit, claimItems: claimItems as any, liability: liability as any };
}
const run = (service: CaseOpeningClaimRequestsService, plan: OpeningClaimPlan, ids: Array<string | null> = ['ci-0', 'ci-1']) =>
  service.requestAfterCommit({ tenantId: 't1', userId: 'u1', caseId: 'c1', plan, claimItemIdByDueIndex: ids });

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
    const { service, prisma, audit } = build();
    const invalid = { interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'JUDGMENT_DATE' }] };
    expect(() => service.assertAdmissible(dto({ ...invalid, previewHash: hashOf(invalid) }))).toThrow(BadRequestException);
    expect(() => service.assertAdmissible(dto({ ...requests, previewHash: 'baska-ozet' }))).toThrow(ConflictException);
    process.env[FLAG] = 'false';
    expect(() => service.assertAdmissible(dto({ ...requests, previewHash: hashOf(requests) }))).toThrow(ConflictException);
    // Bayrak yalnız SEÇİMİ kapatır: faiz beyanı aynı ortamda kabul edilir.
    const onlyInterest = { interestAccruals: [accrual(0)] };
    expect(service.assertAdmissible(dto({ ...onlyInterest, previewHash: hashOf(onlyInterest) }))).not.toBeNull();
    // Kabul saf: veritabanına ve denetime dokunmaz.
    expect(prisma.caseDebtor.findMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('önizleme yanıtı seçim bayrağının durumunu taşır', () => {
    const { service } = build();
    expect(service.preview({ currency: 'TRY', dues, caseDebtors } as never).secimYazmaAcik).toBe(true);
    process.env[FLAG] = 'false';
    expect(service.preview({ currency: 'TRY', dues, caseDebtors } as never).secimYazmaAcik).toBe(false);
  });
});

describe('Açılış kalem beyanları — kayıt sonrası talepler', () => {
  it('mevcut yollar aynı girdiyle çağrılır; kişi kimliği dosya borçlusu satırına çevrilir; sıra notu aynı kalemde iki talep varken', async () => {
    const { service, claimItems, liability, audit } = build();
    const outcome = await run(service, planOf(requests));
    expect(claimItems.updateFromUser).toHaveBeenCalledWith('t1', 'u1', 'ci-0', {
      interestAccrualStatus: 'ACCRUES',
      interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE',
      interestStartDate: '2025-04-02',
    });
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
    expect(liability.preview).toHaveBeenCalledWith('t1', 'u1', 'c1', expectedDrafts);
    expect(liability.request).toHaveBeenCalledWith('t1', 'u1', 'c1', { selections: expectedDrafts, onizlemeOzeti: 'ozet-1' });
    expect(outcome).toMatchObject({
      requested: true,
      tamami: true,
      faizBeyanlari: [{ dueIndex: 0, claimItemId: 'ci-0', status: 'REQUESTED', approvalRequestId: 'apr-faiz' }],
      sorumlulukSecimi: { status: 'REQUESTED', kalemSayisi: 1, approvalRequestId: 'apr-secim' },
    });
    expect(outcome.onaySirasiNotu).not.toBeNull();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED', entityId: 'c1', userId: 'u1' }));
  });

  it('faiz ve seçim FARKLI kalemlerdeyse sıra notu yok; "takip tarihi" dayanağında başlangıç tarihi gönderilmez', async () => {
    const mixed = { interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' }], liabilitySelections: [selection(1)] };
    const { service, claimItems } = build();
    const outcome = await run(service, planOf(mixed));
    expect(outcome.onaySirasiNotu).toBeNull();
    expect(claimItems.updateFromUser).toHaveBeenCalledWith('t1', 'u1', 'ci-0', {
      interestAccrualStatus: 'ACCRUES',
      interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE',
    });
  });

  it('yazma kapısı reddederse hata fırlatılmaz: neden kararlı kodla raporlanır, eksik sonuç denetime yazılır', async () => {
    const denied = new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED');
    const { service, audit } = build({
      claimItems: { updateFromUser: jest.fn().mockRejectedValue(denied) },
      liability: {
        preview: jest.fn().mockRejectedValue(new ForbiddenException({ code: 'CLAIM_LIABILITY_WRITE_DENIED', message: 'Sorumluluk seçimi yetkisi yok: OBJECT_PERMISSION_DENIED' })),
        request: jest.fn(),
      },
    });
    const outcome = await run(service, planOf(requests));
    expect(outcome.tamami).toBe(false);
    expect(outcome.faizBeyanlari[0]).toMatchObject({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' });
    expect(outcome.sorumlulukSecimi).toMatchObject({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CASE_OPEN_CLAIM_REQUESTS_INCOMPLETE' }));
  });

  it('kalem oluşmamışsa, borçlu satırı yoksa ya da servis bağlı değilse talep açılmaz (atlandı) — hata fırlatılmaz', async () => {
    const noItem = await run(build().service, planOf(requests), [null, 'ci-1']);
    expect(noItem.faizBeyanlari[0]).toMatchObject({ status: 'SKIPPED', errorCode: 'CLAIM_ITEM_NOT_CREATED' });
    expect(noItem.sorumlulukSecimi).toMatchObject({ status: 'SKIPPED', errorCode: 'CLAIM_ITEM_NOT_CREATED' });

    const missingDebtor = build({ caseDebtorRows: [{ id: 'cd1', debtorId: 'd1' }] });
    const noDebtor = await run(missingDebtor.service, planOf(requests));
    expect(noDebtor.sorumlulukSecimi).toMatchObject({ status: 'SKIPPED', errorCode: 'CASE_DEBTOR_NOT_CREATED' });
    expect(missingDebtor.liability.request).not.toHaveBeenCalled();

    const unbound = await run(build({ claimItems: undefined, liability: undefined }).service, planOf(requests));
    expect(unbound.faizBeyanlari[0]).toMatchObject({ status: 'SKIPPED', errorCode: 'CLAIM_ITEM_SERVICE_UNAVAILABLE' });
    expect(unbound.sorumlulukSecimi).toMatchObject({ status: 'SKIPPED', errorCode: 'LIABILITY_SELECTION_SERVICE_UNAVAILABLE' });
    expect(unbound.tamami).toBe(false);
  });

  it('onay gerektirmeyen sonuç talep sayılmaz; kayıtlı durumla uygulanamayan seçim için talep açılmaz', async () => {
    const direct = build({ claimItems: { updateFromUser: jest.fn().mockResolvedValue({ applied: true, approvalRequired: false }) } });
    expect((await run(direct.service, planOf({ interestAccruals: [accrual(0)] }))).faizBeyanlari[0]).toMatchObject({
      status: 'REJECTED',
      errorCode: 'APPROVAL_NOT_REQUIRED_UNEXPECTED',
    });
    const blocked = build({ liability: { preview: jest.fn().mockResolvedValue({ uygulanabilir: false, onizlemeOzeti: 'x' }), request: jest.fn() } });
    const outcome = await run(blocked.service, planOf({ liabilitySelections: [selection(0)] }));
    expect(outcome.sorumlulukSecimi).toMatchObject({ status: 'REJECTED', errorCode: 'LIABILITY_SELECTION_NOT_APPLICABLE' });
    expect(blocked.liability.request).not.toHaveBeenCalled();
  });

  it('aynı kişi iki rolle kayıtlıysa ilk satır kullanılır; denetim yazılamazsa sonuç yine döner', async () => {
    const { service, liability } = build({
      caseDebtorRows: [{ id: 'cd1', debtorId: 'd1' }, { id: 'cd1b', debtorId: 'd1' }, { id: 'cd2', debtorId: 'd2' }],
      auditFails: true,
    });
    const outcome = await run(service, planOf({ liabilitySelections: [selection(0)] }));
    expect(liability.preview.mock.calls[0][3][0].parties.map((party: any) => party.caseDebtorId)).toEqual(['cd1', 'cd2']);
    expect(outcome.sorumlulukSecimi?.status).toBe('REQUESTED');
  });
});

describe('describeOpeningClaimRequestRejection', () => {
  it('yazma kapısı reddi kararlı koda çevrilir; bilinmeyen neden ve kod korunur', () => {
    expect(describeOpeningClaimRequestRejection(new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED')).errorCode).toBe(
      'CASE_FINANCE_PERMISSION_REQUIRED',
    );
    expect(describeOpeningClaimRequestRejection(new ForbiddenException('ClaimItem write denied: YENI_NEDEN')).errorCode).toBe('CLAIM_ITEM_WRITE_DENIED:YENI_NEDEN');
    expect(describeOpeningClaimRequestRejection(new ConflictException({ code: 'LIABILITY_SELECTION_PENDING_CONFLICT', message: 'bekleyen talep var' }))).toEqual({
      errorCode: 'LIABILITY_SELECTION_PENDING_CONFLICT',
      message: 'bekleyen talep var',
    });
    expect(describeOpeningClaimRequestRejection(new Error('beklenmeyen')).errorCode).toBe('OPENING_CLAIM_REQUEST_FAILED');
  });
});
