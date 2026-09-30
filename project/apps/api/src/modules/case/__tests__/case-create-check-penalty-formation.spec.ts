/**
 * K3-L Faz 2b — dosya açılışında kullanıcının AÇIK seçimiyle çek tazminatı K3 onay talebi (commit sonrası) +
 * lehine aval tutarlılığı + çek kaydına karşılıksız bilgisinin yazılması. Birim düzeyi: talep servisi mock'lanır;
 * gerçek K3 onay zinciri `case-open-check-penalty-formation.db-gated.integration.spec.ts` içindedir.
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as previewModule from '../../claim-item/formation-cek/cek-formation-preview';
import { InstrumentType } from '@prisma/client';
import { CaseService } from '../case.service';
import { assertAvalBeneficiariesConsistent } from '../case-debtor-aval-consistency';
import { CaseInstrumentInputDto, Currency, OcrInstrumentInputType } from '../dto/case.dto';
import { buildCaseInstrumentData, resolveBounceFields } from '../ocr-instrument-to-case-instrument.mapper';
import { previewCekFormation } from '../../claim-item/formation-cek/cek-formation-preview';
import { describeCheckPenaltyFormationRejection } from '../check-penalty-formation-rejection';

const stub = {} as any;

function buildService(cekFormation?: any) {
  const audit = { log: jest.fn(async () => undefined) };
  const service = new CaseService(
    stub, audit as any, stub, stub, stub, stub, stub, stub, stub, stub, undefined, undefined, undefined, cekFormation,
  );
  jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  // userId: null → oturum sahibi yok (varsayılan parametre undefined'ı ezdiği için açık null kullanılır)
  const call = (dto: any, instruments: any[], userId: string | null = 'user-1') =>
    (service as any).requestCheckPenaltyFormationAfterCommit('t1', userId ?? undefined, dto, 'case-1', instruments);
  return { service, audit, call };
}

const CEK = { id: 'inst-1', amount: 1000, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' };
const DEBTORS = [
  { debtorId: 'd-kesideci', role: 'KESIDECI' },
  { debtorId: 'd-ciranta', role: 'CIRANTA' },
];
const previewHashFor = (instruments: any[], debtors: any[], pursued?: string[]) =>
  previewCekFormation({
    instruments: instruments.map((i) => ({ amount: String(i.amount), currency: i.currency, isBounced: i.isBounced, bounceDate: i.bounceDate })),
    debtors: debtors.map((d) => ({ tempId: d.debtorId, role: d.role, avalForTempId: d.avalForDebtorId ?? null, pursued: pursued ? pursued.includes(d.debtorId) : true })),
  }).previewHash;
const okFormation = (replayed = false) => ({
  request: jest.fn(async (_t: string, _u: string, dto: any) => ({
    applied: false,
    approvalRequired: true,
    approvalRequestId: `appr-${dto.caseInstrumentId}`,
    data: { replayed, approvalStatus: 'PENDING', instrumentId: dto.caseInstrumentId, items: [] },
  })),
});

describe('dosya açılışında çek tazminatı K3 talebi (commit sonrası)', () => {
  it('kullanıcı seçmediyse (alan yok / requested=false) HİÇBİR talep açılmaz', async () => {
    const formation = okFormation();
    const { call, audit } = buildService(formation);
    expect(await call({ caseDebtors: DEBTORS }, [CEK])).toBeUndefined();
    expect(await call({ caseDebtors: DEBTORS, checkPenaltyFormation: { requested: false } }, [CEK])).toBeUndefined();
    expect(formation.request).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('açık seçim + tam veri: mevcut K3 talep servisi çek başına kararlı anahtarla çağrılır; sonuç TASLAK olarak raporlanır', async () => {
    const formation = okFormation();
    const { call, audit } = buildService(formation);
    const previewHash = previewHashFor([CEK], DEBTORS);
    const outcome = await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash } },
      [CEK],
    );
    expect(formation.request).toHaveBeenCalledTimes(1);
    expect(formation.request).toHaveBeenCalledWith('t1', 'user-1', expect.objectContaining({
      caseId: 'case-1',
      caseInstrumentId: 'inst-1',
      documentId: 'inst-1',
      documentType: 'CEK',
      idempotencyKey: 'wizard-key-0001:inst-1',
      liableDebtorIds: ['d-kesideci', 'd-ciranta'],
      totalAmount: 1000,
      currency: 'TRY',
    }));
    expect(outcome).toMatchObject({
      requested: true,
      taslak: true,
      uyari: 'Taslak — onay bekliyor, gönderime hazır değil',
      serverPreviewHash: previewHash,
      clientPreviewHash: previewHash,
      tazminat: { tutar: 100, sorumluTempIds: ['d-kesideci'] },
      results: [{ instrumentId: 'inst-1', status: 'REQUESTED', approvalRequestId: 'appr-inst-1', approvalStatus: 'PENDING' }],
    });
    // Önizleme ↔ talep ↔ onay bağı denetimde
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CASE_OPEN_CHECK_PENALTY_FORMATION_REQUESTED',
      entityId: 'case-1',
      metadata: expect.objectContaining({ previewHash, results: [expect.objectContaining({ approvalRequestId: 'appr-inst-1' })] }),
    }));
  });

  it('tekrar istek: talep servisi replay döner → REPLAYED (ikinci kayıt yok; anahtar aynı)', async () => {
    const formation = okFormation(true);
    const { call } = buildService(formation);
    const dto = {
      caseDebtors: DEBTORS,
      checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: previewHashFor([CEK], DEBTORS) },
    };
    const first = await call(dto, [CEK]);
    const second = await call(dto, [CEK]);
    expect(first.results[0].status).toBe('REPLAYED');
    expect(second.results[0].status).toBe('REPLAYED');
    expect(formation.request.mock.calls.map((c: any[]) => c[2].idempotencyKey)).toEqual(['wizard-key-0001:inst-1', 'wizard-key-0001:inst-1']);
  });

  it('DEĞİŞEN GİRDİ: gösterilen önizleme hash\'i kaydedilen girdiyle uyuşmuyorsa talep AÇILMAZ', async () => {
    const formation = okFormation();
    const { call } = buildService(formation);
    const shownHash = previewHashFor([{ ...CEK, amount: 900 }], DEBTORS); // kullanıcı 900 TL üzerinden önizleme gördü
    const outcome = await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: shownHash } },
      [CEK],
    );
    expect(outcome).toMatchObject({ skippedReason: 'PREVIEW_INPUT_CHANGED', results: [], clientPreviewHash: shownHash });
    expect(outcome.serverPreviewHash).not.toBe(shownHash);
    expect(formation.request).not.toHaveBeenCalled();
  });

  it.each([
    ['karşılıksız bilgisi yok', [{ ...CEK, isBounced: false, bounceDate: null }], DEBTORS, 'CHECK_NOT_DISHONOURED'],
    ['karşılıksız tarihi yok', [{ ...CEK, bounceDate: null }], DEBTORS, 'CHECK_BOUNCE_DATE_REQUIRED'],
    ['borçlu rolü asıl borçlu', [CEK], [{ debtorId: 'd1', role: 'ASIL_BORCLU' }], 'CHECK_DEBTOR_ROLE_REQUIRED'],
    ['aval lehine bilgisi yok', [CEK], [...DEBTORS, { debtorId: 'd-aval', role: 'AVAL' }], 'AVAL_BENEFICIARY_REQUIRED'],
    ['bu istekte çek kaydı yok', [], DEBTORS, 'CHECK_RECORD_REQUIRED'],
  ])('VERİ EKSİK (%s): kör "asıl alacak × %%10" yok — talep açılmaz, neden raporlanır', async (_l, instruments, debtors, reason) => {
    const formation = okFormation();
    const { call } = buildService(formation);
    const outcome = await call(
      { caseDebtors: debtors, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001' } },
      instruments,
    );
    expect(outcome).toMatchObject({ requested: true, results: [], skippedReason: reason, tazminat: null });
    expect(formation.request).not.toHaveBeenCalled();
  });

  it('K3 bayrağı kapalı / servis reddi YUTULMAZ: REJECTED + kararlı kod + TÜRKÇE açıklama, dosya açılışı etkilenmez', async () => {
    const formation = {
      request: jest.fn(async () => {
        // throwClaimItemFormationContextRequired() gerçek metni (İngilizce iç metin kullanıcıya gösterilmez)
        throw new BadRequestException({ code: 'FORMATION_CONTEXT_REQUIRED', message: 'Complete claim formation context is required.' });
      }),
    };
    const { call } = buildService(formation);
    const outcome = await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: previewHashFor([CEK], DEBTORS) } },
      [CEK],
    );
    expect(outcome.results).toEqual([
      {
        instrumentId: 'inst-1',
        status: 'REJECTED',
        errorCode: 'FORMATION_CONTEXT_REQUIRED',
        message: 'Çek tazminatı onay akışı bu ortamda kapalı; çek tazminatı onay talebi açılmadı.',
      },
    ]);
  });

  it('dosyada mali düzenleme yetkisi yoksa (açılıştaki varsayılan atama) ret YUTULMAZ; kararlı kod + Türkçe açıklama', async () => {
    const formation = {
      request: jest.fn(async () => {
        // ClaimItemFormationAuthorizationAdapter: POST /claim-items ile AYNI insan yazma kapısı
        throw new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED');
      }),
    };
    const { call } = buildService(formation);
    const outcome = await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: previewHashFor([CEK], DEBTORS) } },
      [CEK],
    );
    expect(outcome.results).toEqual([
      {
        instrumentId: 'inst-1',
        status: 'REJECTED',
        errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED',
        message: expect.stringContaining('mali düzenleme yetkiniz yok'),
      },
    ]);
    expect(outcome.results[0].message).not.toContain('ClaimItem write denied');
  });

  it('talep servisi bağlı değilse / aktör ya da anahtar yoksa talep açılmaz ve neden raporlanır', async () => {
    const dto = { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001' } };
    expect(await buildService(undefined).call(dto, [CEK])).toMatchObject({ skippedReason: 'FORMATION_SERVICE_UNAVAILABLE', results: [] });
    expect(await buildService(okFormation()).call(dto, [CEK], null)).toMatchObject({ skippedReason: 'ACTOR_REQUIRED' });
    expect(
      await buildService(okFormation()).call({ caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true } }, [CEK]),
    ).toMatchObject({ skippedReason: 'FORMATION_IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('K6: gösterilen önizlemenin hash\'i YOKSA talep AÇILMAZ (PREVIEW_REQUIRED); açılmayan talep de DENETİME yazılır', async () => {
    const formation = okFormation();
    const { call, audit } = buildService(formation);
    const outcome = await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001' } },
      [CEK],
    );
    expect(outcome).toMatchObject({ skippedReason: 'PREVIEW_REQUIRED', results: [], clientPreviewHash: null });
    expect(formation.request).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CASE_OPEN_CHECK_PENALTY_FORMATION_SKIPPED',
      entityId: 'case-1',
      userId: 'user-1',
      metadata: expect.objectContaining({ skippedReason: 'PREVIEW_REQUIRED', clientPreviewHash: null }),
    }));
  });

  it('K8: veri eksikliği ve önizleme uyuşmazlığı gibi ATLANAN yollar da denetime yazılır (yalnız log değil)', async () => {
    const formation = okFormation();
    const { call, audit } = buildService(formation);
    await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001' } },
      [{ ...CEK, isBounced: false, bounceDate: null }],
    );
    await call(
      { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: 'baska-hash' } },
      [CEK],
    );
    const reasons = audit.log.mock.calls.map((c: any[]) => [c[0].action, c[0].metadata?.skippedReason]);
    expect(reasons).toEqual([
      ['CASE_OPEN_CHECK_PENALTY_FORMATION_SKIPPED', 'CHECK_NOT_DISHONOURED'],
      ['CASE_OPEN_CHECK_PENALTY_FORMATION_SKIPPED', 'PREVIEW_INPUT_CHANGED'],
    ]);
  });

  it('varsayılan takip listesi TEKRARSIZ: aynı borçlunun iki rolü talebi yanlış reddettirmez', async () => {
    const formation = okFormation();
    const { call } = buildService(formation);
    const debtors = [...DEBTORS, { debtorId: 'd-kesideci', role: 'CIRANTA' }];
    const outcome = await call(
      { caseDebtors: debtors, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: previewHashFor([CEK], debtors) } },
      [CEK],
    );
    expect(outcome.results[0]).toMatchObject({ status: 'REQUESTED' });
    expect((formation.request.mock.calls[0] as any[])[2].liableDebtorIds).toEqual(['d-kesideci', 'd-ciranta']);
  });

  it('K2: birden çok çek + birden çok keşideci → kimin hangi çekten sorumlu olduğu bilinmez; talep AÇILMAZ', async () => {
    const formation = okFormation();
    const { call } = buildService(formation);
    const debtors = [{ debtorId: 'k1', role: 'KESIDECI' }, { debtorId: 'k2', role: 'KESIDECI' }];
    const cheques = [CEK, { ...CEK, id: 'inst-2', amount: 2000 }];
    const outcome = await call(
      { caseDebtors: debtors, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: previewHashFor(cheques, debtors) } },
      cheques,
    );
    expect(outcome).toMatchObject({ skippedReason: 'CHECK_DRAWER_AMBIGUOUS', results: [], tazminat: null });
    expect(formation.request).not.toHaveBeenCalled();
  });

  it('önizleme beklenmedik hata verirse talep açılmaz, hata dosya yanıtına sızmaz (PREVIEW_FAILED)', async () => {
    const formation = okFormation();
    const { call } = buildService(formation);
    const spy = jest.spyOn(previewModule, 'previewCekFormation').mockImplementation(() => {
      throw new Error('beklenmeyen');
    });
    try {
      const outcome = await call(
        { caseDebtors: DEBTORS, checkPenaltyFormation: { requested: true, idempotencyKey: 'wizard-key-0001', previewHash: 'h' } },
        [CEK],
      );
      expect(outcome).toMatchObject({ skippedReason: 'PREVIEW_FAILED', results: [], serverPreviewHash: null, tazminat: null });
      expect(formation.request).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('takip edilen borçlu kümesi açıkça verildiyse yalnız o küme talebe gider', async () => {
    const formation = okFormation();
    const { call } = buildService(formation);
    await call(
      {
        caseDebtors: DEBTORS,
        checkPenaltyFormation: {
          requested: true,
          idempotencyKey: 'wizard-key-0001',
          pursuedDebtorIds: ['d-kesideci'],
          previewHash: previewHashFor([CEK], DEBTORS, ['d-kesideci']),
        },
      },
      [CEK],
    );
    expect((formation.request.mock.calls[0] as any[])[2].liableDebtorIds).toEqual(['d-kesideci']);
  });
});

describe('lehine aval tutarlılığı (yazma öncesi)', () => {
  it('geçerli: AVAL rolü + aynı istekteki başka borçlu', () => {
    expect(() =>
      assertAvalBeneficiariesConsistent([
        { debtorId: 'k', role: 'KESIDECI' },
        { debtorId: 'a', role: 'AVAL', avalForDebtorId: 'k' },
        { debtorId: 'c', role: 'CIRANTA', avalForDebtorId: '  ' },
      ]),
    ).not.toThrow();
  });

  it.each([
    ['rol AVAL değil', [{ debtorId: 'k', role: 'KESIDECI' }, { debtorId: 'c', role: 'CIRANTA', avalForDebtorId: 'k' }], 'AVAL_BENEFICIARY_ROLE_INVALID'],
    ['rol yok (varsayılan asıl borçlu)', [{ debtorId: 'k', role: 'KESIDECI' }, { debtorId: 'x', avalForDebtorId: 'k' }], 'AVAL_BENEFICIARY_ROLE_INVALID'],
    ['kendi lehine', [{ debtorId: 'a', role: 'AVAL', avalForDebtorId: 'a' }], 'AVAL_BENEFICIARY_SELF'],
    ['dosyada olmayan kişi', [{ debtorId: 'a', role: 'AVAL', avalForDebtorId: 'yabanci' }], 'AVAL_BENEFICIARY_NOT_IN_CASE'],
  ])('reddedilir: %s → %s', (_l, debtors, code) => {
    try {
      assertAvalBeneficiariesConsistent(debtors as any);
      throw new Error('beklenen red gelmedi');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ code });
    }
  });
});

describe('çek kaydına karşılıksız bilgisi (mapper)', () => {
  const cek = (over: Partial<CaseInstrumentInputDto> = {}): CaseInstrumentInputDto =>
    ({ type: OcrInstrumentInputType.CEK, amount: 1000, issueDate: '2026-01-10', documentNo: 'CK-1', currency: Currency.TRY, ...over } as CaseInstrumentInputDto);

  it('alan verilmediyse hiçbir şey yazılmaz (önceki davranış: şema varsayılanı)', () => {
    const data = buildCaseInstrumentData('t1', 'c1', cek(), InstrumentType.CEK);
    expect(data).not.toHaveProperty('isBounced');
    expect(data).not.toHaveProperty('bounceDate');
  });

  it('karşılıksız + tarih → yazılır; açıkça karşılıksız değil → false/null', () => {
    expect(buildCaseInstrumentData('t1', 'c1', cek({ isBounced: true, bounceDate: '2026-09-01' }), InstrumentType.CEK)).toMatchObject({
      isBounced: true,
      bounceDate: new Date('2026-09-01'),
    });
    expect(buildCaseInstrumentData('t1', 'c1', cek({ isBounced: false, bounceDate: '2026-09-01' }), InstrumentType.CEK)).toMatchObject({
      isBounced: false,
      bounceDate: null,
    });
  });

  it('tarihsiz / geçersiz tarihli karşılıksız işareti ve çek olmayan senet için alan YAZILMAZ', () => {
    expect(resolveBounceFields({ isBounced: true }, true)).toEqual({});
    expect(resolveBounceFields({ isBounced: true, bounceDate: 'geçersiz' }, true)).toEqual({});
    expect(resolveBounceFields({ isBounced: true, bounceDate: '2026-09-01' }, false)).toEqual({});
  });

describe('K3 ret nedeni eşlemesi (describeCheckPenaltyFormationRejection)', () => {
  it('bilinen yazma kapısı retleri kararlı kod + Türkçe mesaj; ham metin sızmaz', () => {
    expect(describeCheckPenaltyFormationRejection(new ForbiddenException('ClaimItem write denied: OBJECT_PERMISSION_DENIED'))).toEqual({
      errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED',
      message: expect.stringContaining('ofis yönetimince verilir'),
    });
    expect(describeCheckPenaltyFormationRejection(new ForbiddenException('ClaimItem write denied: HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT')).errorCode).toBe(
      'ACTOR_NOT_ACTIVE',
    );
  });

  it('tanınmayan yazma kapısı nedeni koruyarak raporlanır; diğer hatalarda kod/mesaj aynen kalır', () => {
    expect(describeCheckPenaltyFormationRejection(new ForbiddenException('ClaimItem write denied: NEW_REASON'))).toEqual({
      errorCode: 'CLAIM_ITEM_WRITE_DENIED:NEW_REASON',
      message: expect.stringContaining('NEW_REASON'),
    });
    // Türkçe mesajlı bilinen kod aynen kalır
    expect(
      describeCheckPenaltyFormationRejection(new ConflictException({ code: 'LIABLE_DEBTORS_REQUIRED', message: 'Sorumlu borçlular boş olamaz.' })),
    ).toEqual({ errorCode: 'LIABLE_DEBTORS_REQUIRED', message: 'Sorumlu borçlular boş olamaz.' });
    // İç metni İngilizce olan kod kullanıcıya Türkçe açıklamayla döner
    expect(
      describeCheckPenaltyFormationRejection(new ConflictException({ code: 'FORMATION_CONTEXT_REQUIRED', message: 'Complete claim formation context is required.' })),
    ).toEqual({ errorCode: 'FORMATION_CONTEXT_REQUIRED', message: expect.stringContaining('onay akışı bu ortamda kapalı') });
    expect(describeCheckPenaltyFormationRejection(new Error('beklenmeyen'))).toEqual({
      errorCode: 'FORMATION_REQUEST_FAILED',
      message: 'beklenmeyen',
    });
    expect(describeCheckPenaltyFormationRejection(undefined)).toEqual({
      errorCode: 'FORMATION_REQUEST_FAILED',
      message: 'FORMATION_REQUEST_FAILED',
    });
  });
});
});

describe('çek kaydı DTO: tarihsiz karşılıksız işareti (fail-closed)', () => {
  const base = { type: OcrInstrumentInputType.CEK, amount: 1000, issueDate: '2026-08-01', documentNo: 'C-1', currency: Currency.TRY };
  it('isBounced=true iken bounceDate zorunlu: sessizce düşürülmez, doğrulama hatası verir', async () => {
    const errors = await validate(plainToInstance(CaseInstrumentInputDto, { ...base, isBounced: true }));
    expect(errors.map((e) => e.property)).toContain('bounceDate');
  });
  it('tarihli işaret ve işaretsiz çek geçerli', async () => {
    expect(await validate(plainToInstance(CaseInstrumentInputDto, { ...base, isBounced: true, bounceDate: '2026-09-01' }))).toEqual([]);
    expect(await validate(plainToInstance(CaseInstrumentInputDto, base))).toEqual([]);
  });
});
