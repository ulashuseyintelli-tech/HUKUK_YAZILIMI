import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCaseOpenCekPreviewRequest,
  buildCekPreviewRequest,
  buildCheckPenaltyFormationPayload,
  describeCheckPenaltyFormationOutcome,
  isCheckPenaltyFormationAvailable,
  CHECK_PENALTY_FORMATION_UNAVAILABLE_NOTICE,
  CHECK_PENALTY_FORMATION_NOT_SENT_NOTICE,
  hasBouncedCheckItem,
  newCheckPenaltyFormationKey,
  previewRequestKey,
  sanitizeAvalTargets,
  toPreviewDebtors,
} from "@/lib/check-penalty-formation";
import { claimDraftItemToManualInstrumentPayload } from "@/components/debtor/ocr-instrument";

/**
 * K3-L Faz 2b — sihirbaz: çek tazminatı sunucuda taslak olarak hesaplanır; K3 talebi yalnız açık seçimle istenir;
 * karşılıksız bilgisi çek kaydına taşınır. İstemci "tutar × %10" hesabı YAPMAZ.
 */
const cekKalem = (over: Record<string, unknown> = {}) => ({
  kalemTuru: "CEK",
  bakiyeTutar: 12345.67,
  currency: "TRY",
  vadeTarihi: "2026-08-01",
  cekBilgileri: {
    ibrazTarihi: "2026-08-31",
    cekSeriNo: "CK-1",
    bankaVeSube: "Test Bankası - Merkez",
    karsiliksiz: true,
    karsiliksizTarihi: "2026-09-01",
  },
  ...over,
});
const debtors = [
  { debtorId: "d-kesideci", role: "KESIDECI" },
  { debtorId: "d-aval", role: "AVAL", avalForDebtorId: "d-kesideci" },
  { debtorId: "d-ciranta", role: "CIRANTA", avalForDebtorId: undefined },
];

describe("çek tazminatı taslak önizleme isteği", () => {
  it("borçlu kimliği olarak Debtor.id kullanılır (açılıştaki sunucu hesabıyla aynı girdi); lehine aval taşınır", () => {
    expect(toPreviewDebtors(debtors)).toEqual([
      { tempId: "d-kesideci", role: "KESIDECI" },
      { tempId: "d-aval", role: "AVAL", avalForTempId: "d-kesideci" },
      { tempId: "d-ciranta", role: "CIRANTA" },
    ]);
  });

  it("karşılıksız işareti ve tarihi isteğe girer; istemci tutar hesaplamaz", () => {
    const request = buildCekPreviewRequest(cekKalem(), debtors);
    expect(request.instruments).toEqual([{ amount: 12345.67, currency: "TRY", isBounced: true, bounceDate: "2026-09-01" }]);
    expect(JSON.stringify(request)).not.toContain("1234.5");
  });

  it("karşılıksız işaretli değilse ya da tarih yoksa alanlar gönderilmez (sunucu VERI_EKSIK döner)", () => {
    expect(buildCekPreviewRequest(cekKalem({ cekBilgileri: { karsiliksiz: false } }), debtors).instruments[0]).toEqual({
      amount: 12345.67,
      currency: "TRY",
    });
    expect(buildCekPreviewRequest(cekKalem({ cekBilgileri: { karsiliksiz: true } }), debtors).instruments[0]).toEqual({
      amount: 12345.67,
      currency: "TRY",
      isBounced: true,
    });
  });
});

const bouncedCheque = (over: Record<string, unknown> = {}) => ({
  type: "CEK",
  amount: 12345.67,
  currency: "TRY",
  isBounced: true,
  bounceDate: "2026-09-01",
  ...over,
});

describe("dosya açılışı birleşik önizleme isteği (açılışta oluşacak TÜM çek kayıtları + gönderilecek borçlular)", () => {
  it("tüm çekler tek istekte; karşılıksız alanları yalnız ikisi birlikteyse; çek dışı evrak girmez", () => {
    const request = buildCaseOpenCekPreviewRequest(
      [bouncedCheque(), bouncedCheque({ amount: 500, isBounced: true, bounceDate: undefined }), { type: "SENET", amount: 9 }],
      debtors,
    );
    expect(request).toEqual({
      instruments: [
        { amount: 12345.67, currency: "TRY", isBounced: true, bounceDate: "2026-09-01" },
        { amount: 500, currency: "TRY" },
      ],
      debtors: toPreviewDebtors(debtors),
    });
  });

  it("çek yoksa istek de yok; anahtar girdiye kararlıdır ve girdi değişince değişir", () => {
    expect(buildCaseOpenCekPreviewRequest([{ type: "SENET", amount: 1 }], debtors)).toBeNull();
    expect(previewRequestKey(null)).toBeNull();
    const a = previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque()], debtors));
    expect(previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque()], debtors))).toBe(a);
    // tutar, rol ya da lehine aval değişimi anahtarı değiştirir → gösterilen önizleme bayat sayılır
    expect(previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque({ amount: 1 })], debtors))).not.toBe(a);
    expect(
      previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque()], [{ debtorId: "d-kesideci", role: "CIRANTA" }, ...debtors.slice(1)])),
    ).not.toBe(a);
    expect(
      previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque()], [debtors[0], { debtorId: "d-aval", role: "AVAL" }, debtors[2]])),
    ).not.toBe(a);
  });

  it("seçenek yalnız karşılıksız ve tarihli bir çek KAYDI oluşacaksa sunulur", () => {
    expect(isCheckPenaltyFormationAvailable({ instrumentsToCreate: [bouncedCheque()] })).toBe(true);
    expect(isCheckPenaltyFormationAvailable({ instrumentsToCreate: [] })).toBe(false);
    expect(isCheckPenaltyFormationAvailable({ instrumentsToCreate: [bouncedCheque({ bounceDate: undefined })] })).toBe(false);
    expect(isCheckPenaltyFormationAvailable({ instrumentsToCreate: [bouncedCheque({ isBounced: false })] })).toBe(false);
    expect(isCheckPenaltyFormationAvailable({ instrumentsToCreate: [bouncedCheque({ type: "SENET" })] })).toBe(false);
    expect(CHECK_PENALTY_FORMATION_UNAVAILABLE_NOTICE).toContain("onay talebi burada açılamaz");
  });
});

describe("lehine aval hedefi temizliği (bayat seçim gönderilmez)", () => {
  it("hedef listede yoksa, kendisiyse ya da rol AVAL değilse alan düşer; geçerli hedef korunur", () => {
    const out = sanitizeAvalTargets([
      { debtorId: "a", role: "KESIDECI" },
      { debtorId: "b", role: "AVAL", avalForDebtorId: "a" },
      { debtorId: "c", role: "AVAL", avalForDebtorId: "silinen" },
      { debtorId: "d", role: "AVAL", avalForDebtorId: "d" },
      { debtorId: "e", role: "CIRANTA", avalForDebtorId: "a" },
      { debtorId: "f", role: "AVAL", avalForDebtorId: "  " },
    ]);
    expect(out[1]).toEqual({ debtorId: "b", role: "AVAL", avalForDebtorId: "a" });
    for (const i of [2, 3, 4, 5]) expect(out[i]).not.toHaveProperty("avalForDebtorId");
    expect(out[0]).toEqual({ debtorId: "a", role: "KESIDECI" });
  });
});

describe("dosya açılışında K3 talebi gövdesi", () => {
  const request = buildCaseOpenCekPreviewRequest([bouncedCheque()], debtors);
  const key = previewRequestKey(request);
  const shown = { requestKey: key as string, durum: "HESAPLANDI", previewHash: "hash-1" };

  it("kullanıcı seçmediyse alan HİÇ üretilmez", () => {
    expect(
      buildCheckPenaltyFormationPayload({ requested: false, idempotencyKey: "cpf-1234567", caseDebtors: debtors, shownPreview: shown, currentRequestKey: key }),
    ).toBeUndefined();
  });

  it("açık seçim + gösterilen güncel önizleme → kararlı anahtar, tekil borçlular ve DAİMA önizleme hash'i gider", () => {
    const payload = buildCheckPenaltyFormationPayload({
      requested: true,
      idempotencyKey: "cpf-1234567",
      caseDebtors: [...debtors, { debtorId: "d-kesideci", role: "KESIDECI" }],
      shownPreview: shown,
      currentRequestKey: key,
    });
    expect(payload).toEqual({
      requested: true,
      idempotencyKey: "cpf-1234567",
      pursuedDebtorIds: ["d-kesideci", "d-aval", "d-ciranta"],
      previewHash: "hash-1",
    });
  });

  it("gösterilen önizleme yoksa, bayatsa (girdi değişti) ya da hesaplanamadıysa talep GÖNDERİLMEZ", () => {
    const base = { requested: true, idempotencyKey: "cpf-1234567", caseDebtors: debtors };
    expect(buildCheckPenaltyFormationPayload({ ...base, shownPreview: null, currentRequestKey: key })).toBeUndefined();
    const changedKey = previewRequestKey(buildCaseOpenCekPreviewRequest([bouncedCheque({ amount: 99 })], debtors));
    expect(buildCheckPenaltyFormationPayload({ ...base, shownPreview: shown, currentRequestKey: changedKey })).toBeUndefined();
    expect(buildCheckPenaltyFormationPayload({ ...base, shownPreview: shown, currentRequestKey: null })).toBeUndefined();
    expect(
      buildCheckPenaltyFormationPayload({ ...base, shownPreview: { ...shown, durum: "VERI_EKSIK" }, currentRequestKey: key }),
    ).toBeUndefined();
    expect(buildCheckPenaltyFormationPayload({ ...base, shownPreview: { ...shown, previewHash: "" }, currentRequestKey: key })).toBeUndefined();
    expect(buildCheckPenaltyFormationPayload({ ...base, idempotencyKey: "", shownPreview: shown, currentRequestKey: key })).toBeUndefined();
    expect(CHECK_PENALTY_FORMATION_NOT_SENT_NOTICE).toContain("GÖNDERİLMEDİ");
  });

  it("anahtar sunucu biçimine uyar ve her çağrıda farklıdır (taslakta saklanarak kararlı tutulur)", () => {
    const a = newCheckPenaltyFormationKey();
    const b = newCheckPenaltyFormationKey();
    expect(a).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/);
    expect(a).not.toBe(b);
  });

  it("karşılıksız çek kalemi uyarısı yalnız karşılıksız işaretli ve tarihli çek kalemi varken", () => {
    expect(hasBouncedCheckItem([cekKalem()])).toBe(true);
    expect(hasBouncedCheckItem([cekKalem({ cekBilgileri: { karsiliksiz: true } })])).toBe(false);
    expect(hasBouncedCheckItem([cekKalem({ cekBilgileri: { karsiliksiz: false, karsiliksizTarihi: "2026-09-01" } })])).toBe(false);
    expect(hasBouncedCheckItem([{ kalemTuru: "SENET" }])).toBe(false);
  });
});

describe("dosya açılış yanıtındaki K3 sonucu", () => {
  it("talep açıldıysa taslak olduğunu ve onay beklediğini söyler", () => {
    const text = describeCheckPenaltyFormationOutcome({
      requested: true,
      taslak: true,
      uyari: "Taslak — onay bekliyor, gönderime hazır değil",
      results: [{ instrumentId: "i1", status: "REQUESTED" }],
    });
    expect(text).toContain("1 onay talebi açıldı");
    expect(text).toContain("Taslak — onay bekliyor, gönderime hazır değil");
    expect(text).toContain("ikinci avukat onayından sonra");
  });

  it("talep açılmadıysa ya da reddedildiyse nedeni gösterir; seçim yoksa mesaj yok", () => {
    expect(
      describeCheckPenaltyFormationOutcome({
        requested: true,
        taslak: true,
        uyari: "",
        skippedReason: "PREVIEW_INPUT_CHANGED",
        message: "Gösterilen taslak önizleme ile kaydedilen girdiler uyuşmuyor; talep açılmadı.",
        results: [],
      }),
    ).toContain("AÇILMADI");
    expect(
      describeCheckPenaltyFormationOutcome({
        requested: true,
        taslak: true,
        uyari: "",
        results: [{ instrumentId: "i1", status: "REJECTED", errorCode: "FORMATION_CONTEXT_REQUIRED", message: "Oluşum akışı kapalı." }],
      }),
    ).toContain("Açılamayan talep: Oluşum akışı kapalı.");
    // sunucu mesajı noktayla bitse de çift nokta oluşmaz
    const skipped = describeCheckPenaltyFormationOutcome({
      requested: true,
      taslak: true,
      uyari: "",
      skippedReason: "CHECK_RECORD_REQUIRED",
      message: "Bu istekte oluşturulmuş çek kaydı yok.",
      results: [],
    });
    expect(skipped).toBe("Çek tazminatı onay talebi AÇILMADI: Bu istekte oluşturulmuş çek kaydı yok. Dosya oluşturuldu; tazminat kalemi eklenmedi.");
    expect(skipped).not.toContain("..");
    expect(describeCheckPenaltyFormationOutcome(undefined)).toBeNull();
  });
});

describe("çek kaydına karşılıksız bilgisi (manuel çek → instruments[])", () => {
  it("karşılıksız işareti yalnız tarihiyle birlikte gönderilir", () => {
    expect(claimDraftItemToManualInstrumentPayload(cekKalem())).toMatchObject({
      type: "CEK",
      documentNo: "CK-1",
      isBounced: true,
      bounceDate: "2026-09-01",
    });
    const noDate = claimDraftItemToManualInstrumentPayload(
      cekKalem({ cekBilgileri: { ibrazTarihi: "2026-08-31", cekSeriNo: "CK-1", bankaVeSube: "B - Ş", karsiliksiz: true } }),
    );
    expect(noDate).not.toHaveProperty("isBounced");
    expect(noDate).not.toHaveProperty("bounceDate");
    const notBounced = claimDraftItemToManualInstrumentPayload(
      cekKalem({ cekBilgileri: { ibrazTarihi: "2026-08-31", cekSeriNo: "CK-1", bankaVeSube: "B - Ş" } }),
    );
    expect(notBounced).not.toHaveProperty("isBounced");
  });
});

describe("K3-L Faz 2b — taslak belge isteği ve hesap özeti (kaynak kilidi)", () => {
  const source = readFileSync("src/components/claim-item/ProfessionalClaimItemForm.tsx", "utf8");

  it("çek tazminatı satırı istemciden GÖNDERİLMEZ; sunucuya yalnız hesap GİRDİSİ gider (Word asıl alacakla aynı kaynaktan)", () => {
    expect(source).not.toContain("type: 'COMPENSATION'");
    // PDF: kalem + önizleme aynı kalem.bakiyeTutar'dan
    expect(source.match(/cekFormationPreview: buildCekPreviewRequest\(kalem, caseDebtors\)/g) ?? []).toHaveLength(1);
    // Word: önizleme girdisi belgedeki asıl alacak satırıyla AYNI tutardan
    expect(source).toContain("buildCekPreviewRequest({ ...kalem, bakiyeTutar: asilAlacak?.tutar || kalem.bakiyeTutar || 0 }, caseDebtors)");
  });

  it("taslak tazminat takip tutarına / son borca / XML toplamına GİRMEZ (yalnız görsel TASLAK satırı)", () => {
    expect(source).toContain("const takipTutari = kalem.bakiyeTutar + yanAlacakToplam + komisyon + takipOncesiFaiz;");
    expect(source).not.toMatch(/const takipTutari = [^;]*tazminat/);
  });

  it("eski (sökülmüş ya da yeni girdiye ait) hesap sonucu bildirilmez; aynı girdi için önizleme tekrar istenmez", () => {
    expect(source).toContain("if (!mountedRef.current || generation !== calcGenerationRef.current) return;");
    expect(source).toContain("previewCacheRef.current.get(previewKey)");
  });

  it("kişisel veri içeren istek gövdesi tarayıcı konsoluna yazılmaz", () => {
    expect(source).not.toMatch(/console\.log\([^)]*templateData\)/);
  });
});

describe("K3-L Faz 2b — borçlu listesi (kaynak kilidi)", () => {
  const step = readFileSync("src/components/debtor/DebtorStep.tsx", "utf8");

  it("borçlu çıkarılınca onu gösteren lehine aval seçimi de temizlenir", () => {
    expect(step).toContain("cd.avalForDebtorId === removedId ? { ...cd, avalForDebtorId: undefined } : cd");
  });
});

describe("K3-L Faz 2b — dosya açılış gönderimi (kaynak kilidi, sihirbaz sayfası)", () => {
  const page = readFileSync("src/app/(dashboard)/cases/new/page.tsx", "utf8");

  it("masraf penceresi yolunda doğrulanan dues/çek kaydı birebir gönderilir (eski dues durumu kullanılmaz)", () => {
    expect(page).toContain("pendingSubmissionRef.current = { dues: effDues, manualInstruments };");
    const modalCalls = page.match(/doCreateCase\((true|false), pendingSubmissionRef\.current\?\.dues, pendingSubmissionRef\.current\?\.manualInstruments\)/g) ?? [];
    expect(modalCalls).toHaveLength(2);
    expect(page).not.toMatch(/doCreateCase\((true|false)\)/);
  });

  it("eski taslak geri düşüşü yalnız kalem listesi boşken: çek kaydına yönlenen kalem eski dues'tan ikinci kez yazılmaz", () => {
    expect(page).toContain("if (effDues.length === 0 && effClaimItems.length === 0 && dues.length > 0) {");
    expect(page).not.toContain("if (effDues.length === 0 && dues.length > 0) {");
  });

  it("talep yalnız GÖSTERİLEN birleşik önizlemeyle ve gönderilen çek/borçlu girdisinin anahtarıyla; bayatsa kullanıcıya söylenir", () => {
    expect(page).toContain("currentRequestKey: previewRequestKey(buildCaseOpenCekPreviewRequest(instrumentsToSubmit, sanitizedCaseDebtors)),");
    expect(page).toContain("shownPreview: shownCekPreview && shownCekPreview.previewHash === checkedCekPreviewHash ? shownCekPreview : null,");
    expect(page).toContain("instruments: instrumentsToSubmit,");
    expect(page).toContain("CHECK_PENALTY_FORMATION_NOT_SENT_NOTICE");
    expect(page).toContain('disabled={!cekPreviewCurrent || shownCekPreview?.durum !== "HESAPLANDI"}');
    expect(page).toContain('data-testid="check-penalty-formation-unavailable"');
    expect(page).toContain('data-testid="check-penalty-formation-preview"');
  });

  it("lehine aval hedefi gönderimde temizlenir; form geri çağrıları kararlı (hesap döngüsü yok)", () => {
    expect(page).toContain("const sanitizedCaseDebtors = sanitizeAvalTargets(sanitizeCaseDebtorsForSubmit(");
    expect(page).toContain("onItemsChange={handleClaimFormItemsChange}");
    expect(page).toContain("caseDebtors={claimFormCaseDebtors}");
    expect(page).not.toMatch(/onItemsChange=\{\(items\) =>/);
  });
});
