import { describe, expect, it } from "vitest";
import { buildCreateCaseDuesPayload } from "@/lib/case-due-payload";
import {
  buildOpeningClaimRequests,
  buildOpeningDueFields,
  describeOpeningClaimRequestsOutcome,
  emptyOpeningClaimDeclaration,
  formatOpeningClaimCreateError,
  listedItemOpeningChips,
  normalizeOpeningClaimDeclaration,
  summarizeOpeningDeclaration,
  type OpeningClaimDeclaration,
} from "@/lib/case-opening-claims";

/**
 * Açılış kalem beyanları — yeni dosya formunun saf yardımcıları (owner talimatı 2026-11-18).
 *
 * Kanıtlanan: yalnız kullanıcının girdiği bilgi gönderilir (ön seçim / çıkarım yok); kalem türüne uymayan beyan yok
 * sayılır; "faiz işler" beyanı olan kalemde açılışta faiz tarihi yazılmaz; beyanlar GÖNDERİLEN kalem sırasına bağlanır;
 * açılamayan talep sessizce geçilmez. Tutarlar ve adlar SENTETİKTİR.
 */
const B1 = "borclu-1";
const B2 = "borclu-2";
const ctx = { debtorIds: [B1, B2], interestIsNone: false };
const beyan = (patch: Partial<OpeningClaimDeclaration> = {}): OpeningClaimDeclaration => ({ ...emptyOpeningClaimDeclaration(), ...patch });
const esitPay = (): OpeningClaimDeclaration["sorumluluk"] => ({
  mode: "PROPORTIONAL",
  shareKind: "EQUAL",
  parties: { [B1]: { selected: true, percent: "", limit: "", unlimited: false }, [B2]: { selected: true, percent: "", limit: "", unlimited: false } },
  basis: "COURT_JUDGMENT",
  basisNote: "",
});

describe("buildOpeningDueFields — yalnız girilen bilgi", () => {
  it("beyan yoksa hiçbir alan üretilmez; iki borçlu var diye seçim / pay çıkmaz", () => {
    expect(buildOpeningDueFields({ kalemTuru: "VEKALET_UCRETI" }, ctx)).toEqual({ omitInterestDates: false });
    expect(buildOpeningDueFields({ kalemTuru: "YARGILAMA_GIDERI", acilisBeyani: emptyOpeningClaimDeclaration() }, ctx)).toEqual({ omitInterestDates: false });
  });

  it("vekâlet ücreti kaynağı yalnız vekâlet ücreti kaleminde ve yalnız seçilmişse gönderilir", () => {
    const withBasis = beyan({ vekaletUcretiKaynagi: "JUDGMENT_AWARDED" });
    expect(buildOpeningDueFields({ kalemTuru: "VEKALET_UCRETI", acilisBeyani: withBasis }, ctx).attorneyFeeBasis).toBe("JUDGMENT_AWARDED");
    expect(buildOpeningDueFields({ kalemTuru: "MASRAF", acilisBeyani: withBasis }, ctx).attorneyFeeBasis).toBeUndefined();
    expect(buildOpeningDueFields({ kalemTuru: "VEKALET_UCRETI", acilisBeyani: beyan() }, ctx).attorneyFeeBasis).toBeUndefined();
  });

  it("ilam bilgisi fer'i kalemde yalnız 'ilamdan doğuyor' işaretliyse gönderilir; vekâlet kaynağından çıkarılmaz", () => {
    const ilamBilgileri = { mahkemeAdi: "Sentetik Mahkeme", esasNo: "2024/1", kararNo: "2025/2", ilamTarihi: "2025-02-03", kesinlesmeTarihi: "2025-04-02" };
    const isaretsiz = buildOpeningDueFields({ kalemTuru: "VEKALET_UCRETI", acilisBeyani: beyan({ vekaletUcretiKaynagi: "JUDGMENT_AWARDED" }), ilamBilgileri }, ctx);
    expect(isaretsiz.sourceDocumentType).toBeUndefined();
    expect(isaretsiz.ilamMahkeme).toBeUndefined();
    const isaretli = buildOpeningDueFields({ kalemTuru: "YARGILAMA_GIDERI", acilisBeyani: beyan({ ilamKaynakli: true }), ilamBilgileri }, ctx);
    expect(isaretli).toMatchObject({
      sourceDocumentType: "ILAM",
      ilamMahkeme: "Sentetik Mahkeme",
      ilamEsasNo: "2024/1",
      ilamKararNo: "2025/2",
      issueDate: "2025-02-03",
      ilamKesinlesmeTarihi: "2025-04-02",
    });
    // İlam asıl alacağında öteki alanları mevcut köprü taşır; buradan yalnız kesinleşme tarihi eklenir.
    expect(buildOpeningDueFields({ kalemTuru: "ILAM", ilamBilgileri }, ctx)).toEqual({ omitInterestDates: false, ilamKesinlesmeTarihi: "2025-04-02" });
    // İlamdan doğamayacak türde (ör. fatura) işaret yok sayılır.
    expect(buildOpeningDueFields({ kalemTuru: "FATURA", acilisBeyani: beyan({ ilamKaynakli: true }), ilamBilgileri }, ctx).sourceDocumentType).toBeUndefined();
  });

  it("'faiz işler' beyanı: başlangıç + dayanak beyan olarak çıkar ve açılışta faiz tarihi yazılmaz", () => {
    const out = buildOpeningDueFields(
      { kalemTuru: "VEKALET_UCRETI", acilisBeyani: beyan({ faizIsler: true, faizBaslangic: "2025-04-02", faizDayanak: "JUDGMENT_FINALIZATION_DATE" }) },
      ctx,
    );
    expect(out.omitInterestDates).toBe(true);
    expect(out.opening?.interestAccrual).toEqual({ interestStartDate: "2025-04-02", interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE" });
  });

  it("dayanak 'takip tarihi' ise başlangıç tarihi gönderilmez; eksik dayanak tamamlanmaz (sunucu reddeder)", () => {
    const takip = buildOpeningDueFields(
      { kalemTuru: "MASRAF", acilisBeyani: beyan({ faizIsler: true, faizBaslangic: "2025-01-01", faizDayanak: "ENFORCEMENT_PROCEEDING_DATE" }) },
      ctx,
    );
    expect(takip.opening?.interestAccrual).toEqual({ interestStartDateProvenance: "ENFORCEMENT_PROCEEDING_DATE" });
    const eksik = buildOpeningDueFields({ kalemTuru: "MASRAF", acilisBeyani: beyan({ faizIsler: true }) }, ctx);
    expect(eksik.opening?.interestAccrual).toEqual({ interestStartDateProvenance: "" });
  });

  it("'faiz yok' seçili kalemde ve işlemiş faiz kaleminde 'faiz işler' beyanı gönderilmez", () => {
    const faizIsler = beyan({ faizIsler: true, faizBaslangic: "2025-04-02", faizDayanak: "JUDGMENT_DATE" });
    expect(buildOpeningDueFields({ kalemTuru: "MASRAF", acilisBeyani: faizIsler }, { ...ctx, interestIsNone: true })).toEqual({ omitInterestDates: false });
    expect(buildOpeningDueFields({ kalemTuru: "ISLEMIS_FAIZ", acilisBeyani: faizIsler }, ctx)).toEqual({ omitInterestDates: false });
  });

  it("paylı sorumluluk, eşit pay: yalnız SEÇİLEN borçlular, her birine ağırlık 1; pay tutarı hesaplanmaz", () => {
    const out = buildOpeningDueFields({ kalemTuru: "VEKALET_UCRETI", acilisBeyani: beyan({ sorumluluk: esitPay() }) }, ctx);
    expect(out.opening?.liabilitySelection).toEqual({
      mode: "PROPORTIONAL",
      basis: "COURT_JUDGMENT",
      parties: [
        { debtorId: B1, shareWeight: 1 },
        { debtorId: B2, shareWeight: 1 },
      ],
    });
    expect(out.omitInterestDates).toBe(false);
  });

  it("oran / tavan girdisi metin olarak taşınır (virgül → nokta); dosyadan çıkarılmış borçlu gönderilmez", () => {
    const oran = buildOpeningDueFields(
      {
        kalemTuru: "MASRAF",
        acilisBeyani: beyan({
          sorumluluk: {
            mode: "PROPORTIONAL",
            shareKind: "PERCENT",
            parties: { [B1]: { selected: true, percent: "60,5", limit: "", unlimited: false }, [B2]: { selected: true, percent: " 39.5 ", limit: "", unlimited: false } },
            basis: "CONTRACT",
            basisNote: "  not  ",
          },
        }),
      },
      ctx,
    );
    expect(oran.opening?.liabilitySelection).toEqual({
      mode: "PROPORTIONAL",
      basis: "CONTRACT",
      basisNote: "not",
      parties: [
        { debtorId: B1, sharePercent: "60.5" },
        { debtorId: B2, sharePercent: "39.5" },
      ],
    });
    const tavan = buildOpeningDueFields(
      {
        kalemTuru: "MASRAF",
        acilisBeyani: beyan({
          sorumluluk: {
            mode: "CAPPED",
            shareKind: "",
            parties: {
              [B1]: { selected: true, percent: "", limit: "400,00", unlimited: false },
              [B2]: { selected: true, percent: "", limit: "999", unlimited: true },
              eski: { selected: true, percent: "", limit: "5", unlimited: false },
            },
            basis: "",
            basisNote: "",
          },
        }),
      },
      ctx,
    );
    expect(tavan.opening?.liabilitySelection).toEqual({
      mode: "CAPPED",
      parties: [
        { debtorId: B1, limitAmount: "400.00" },
        { debtorId: B2, unlimited: true },
      ],
    });
  });

  it("taslaktan gelen bozuk / eksik beyan güvenli biçime gelir; varsayılan değer üretilmez", () => {
    expect(normalizeOpeningClaimDeclaration(null)).toEqual(emptyOpeningClaimDeclaration());
    expect(normalizeOpeningClaimDeclaration({ vekaletUcretiKaynagi: "TAHMIN", faizIsler: "evet", sorumluluk: { mode: "YARI_YARIYA", shareKind: "X" } })).toEqual(
      emptyOpeningClaimDeclaration(),
    );
  });
});

describe("buildOpeningClaimRequests — beyanlar GÖNDERİLEN kalem sırasına bağlanır", () => {
  const faiz = { interestStartDate: "2025-04-02", interestStartDateProvenance: "JUDGMENT_DATE" };
  const secim = { mode: "JOINT_AND_SEVERAL" as const, parties: [{ debtorId: B1 }], basis: "COURT_JUDGMENT" };

  it("beyan yoksa null (açılış bugünkü gibidir)", () => {
    expect(buildOpeningClaimRequests([{ amount: "100" }, { amount: 5 }])).toBeNull();
  });

  it("tutarı boş / sıfır satır gönderilmez; sıra numarası gönderilen listeye göredir (dues kurucusuyla aynı süzgeç)", () => {
    const dues = [
      { type: "PRINCIPAL", dueDate: "2026-01-01", amount: "0", opening: { interestAccrual: faiz } },
      { type: "VEKALET_UCRETI", dueDate: "2026-01-01", amount: "1000", opening: { interestAccrual: faiz, liabilitySelection: secim } },
      { type: "EXPENSE", dueDate: "2026-01-01", amount: "" },
      { type: "YARGILAMA_GIDERI", dueDate: "2026-01-01", amount: "200", opening: { liabilitySelection: secim } },
    ];
    const payload = buildCreateCaseDuesPayload(dues);
    expect(payload.map((due) => due.type)).toEqual(["VEKALET_UCRETI", "YARGILAMA_GIDERI"]);
    // Geçici açılış verisi due gövdesine SIZMAZ.
    expect(payload.every((due) => !("opening" in due))).toBe(true);
    expect(buildOpeningClaimRequests(dues)).toEqual({
      interestAccruals: [{ dueIndex: 0, ...faiz }],
      liabilitySelections: [
        { dueIndex: 0, ...secim },
        { dueIndex: 1, ...secim },
      ],
    });
  });

  it("vekâlet ücreti kaynağı ve kesinleşme tarihi due gövdesinde taşınır", () => {
    const [due] = buildCreateCaseDuesPayload([
      { type: "VEKALET_UCRETI", dueDate: "2026-01-01", amount: "1000", attorneyFeeBasis: "JUDGMENT_AWARDED", ilamKesinlesmeTarihi: "2025-04-02" },
    ]);
    expect(due).toMatchObject({ attorneyFeeBasis: "JUDGMENT_AWARDED", ilamKesinlesmeTarihi: "2025-04-02" });
  });
});

describe("summarizeOpeningDeclaration — kalem listesi etiketi", () => {
  it("yalnız girilmiş bilgi; onaya gidecek olan açıkça yazılır; 'Paylı sorumluluk' terimi kullanılır", () => {
    expect(summarizeOpeningDeclaration({ kalemTuru: "MASRAF" })).toEqual([]);
    expect(
      summarizeOpeningDeclaration({
        kalemTuru: "VEKALET_UCRETI",
        takipOncesiFaiz: "YASAL",
        acilisBeyani: beyan({ vekaletUcretiKaynagi: "JUDGMENT_AWARDED", ilamKaynakli: true, faizIsler: true, sorumluluk: esitPay() }),
      }),
    ).toEqual(["İlam vekâlet ücreti", "İlamdan doğuyor", "Faiz işler: onaya gidecek", "Paylı sorumluluk: onaya gidecek"]);
    // Faiz yok seçiliyse "faiz işler" etiketi gösterilmez (beyan gönderilmez).
    expect(summarizeOpeningDeclaration({ kalemTuru: "MASRAF", takipOncesiFaiz: "YOK", acilisBeyani: beyan({ faizIsler: true }) })).toEqual([]);
  });

  it("evrak kaydına yönlenen kalemde (çek / senet) önceki türde girilmiş beyan 'onaya gidecek' diye gösterilmez; gönderilmeyeceği söylenir", () => {
    const item = { kalemTuru: "MASRAF", takipOncesiFaiz: "YASAL", acilisBeyani: beyan({ faizIsler: true, sorumluluk: esitPay() }) };
    expect(listedItemOpeningChips(item, false)).toEqual({ labels: ["Faiz işler: onaya gidecek", "Paylı sorumluluk: onaya gidecek"], notSent: false });
    expect(listedItemOpeningChips(item, true)).toEqual({ labels: [], notSent: true });
    // Beyanı olmayan evrak kaleminde uyarı da yok.
    expect(listedItemOpeningChips({ kalemTuru: "CEK" }, true)).toEqual({ labels: [], notSent: false });
  });
});

describe("describeOpeningClaimRequestsOutcome — açılış sonucu sessizce geçilmez", () => {
  it("beyan yoksa ileti yok", () => {
    expect(describeOpeningClaimRequestsOutcome(undefined)).toBeNull();
    expect(describeOpeningClaimRequestsOutcome(null)).toBeNull();
  });

  it("bütün talepler açıldıysa: kaç beyanın onaya gittiği, hesaba yansımadığı ve onay sırası notu", () => {
    const message = describeOpeningClaimRequestsOutcome({
      requested: true,
      previewHash: "h",
      faizBeyanlari: [
        { dueIndex: 0, claimItemId: "c0", status: "REQUESTED", approvalRequestId: "a0" },
        { dueIndex: 1, claimItemId: "c1", status: "REQUESTED", approvalRequestId: "a1" },
      ],
      sorumlulukSecimi: { status: "REQUESTED", kalemSayisi: 2, approvalRequestId: "a2" },
      tamami: true,
      onaySirasiNotu: "Önce faiz talebi onaylanmalıdır.",
      aciklama: "",
    })!;
    expect(message).toContain('2 kalem için "faiz işler" beyanı onaya gönderildi.');
    expect(message).toContain("2 kalem için borçlu sorumluluğu seçimi onaya gönderildi.");
    expect(message).toContain("onaylayana kadar kaleme yazılmaz ve hesaplara yansımaz");
    expect(message).toContain("Önce faiz talebi onaylanmalıdır.");
    expect(message).not.toContain("AÇILMADI");
  });

  it("açılamayan talep nedeniyle ve nereden yeniden yapılacağıyla yazılır", () => {
    const message = describeOpeningClaimRequestsOutcome({
      requested: true,
      previewHash: "h",
      faizBeyanlari: [{ dueIndex: 1, claimItemId: "c1", status: "REJECTED", errorCode: "CASE_FINANCE_PERMISSION_REQUIRED", message: "Dosyada mali düzenleme yetkiniz yok." }],
      sorumlulukSecimi: { status: "SKIPPED", kalemSayisi: 1, errorCode: "CLAIM_ITEM_NOT_CREATED" },
      tamami: false,
      onaySirasiNotu: null,
      aciklama: "",
    })!;
    expect(message).toContain("onay talebi AÇILMADI");
    expect(message).toContain("2. kalemin faiz beyanı: Dosyada mali düzenleme yetkiniz yok.");
    expect(message).toContain("Borçlu sorumluluğu seçimi: CLAIM_ITEM_NOT_CREATED");
    expect(message).toContain("Alacak Kalemleri bölümünden yeniden gönderebilirsiniz");
  });
});

describe("formatOpeningClaimCreateError — dosya oluşmadığında okunur neden", () => {
  it("kararlı koda bağlıdır; geçersiz beyanda kalem sırasıyla sunucu iletisi; tanınmayan hata null", () => {
    expect(formatOpeningClaimCreateError({ body: { code: "OPENING_CLAIM_PREVIEW_STALE" } })).toContain("Takip oluşturulmadı");
    expect(formatOpeningClaimCreateError({ body: { code: "CLAIM_LIABILITY_SELECTION_DISABLED" } })).toContain("kapalı");
    expect(
      formatOpeningClaimCreateError({
        body: { code: "OPENING_CLAIM_REQUESTS_INVALID", errors: [{ kod: "BASIS_REQUIRED", alan: "SORUMLULUK", dueIndex: 1, debtorId: null, mesaj: "Dayanak seçilmelidir." }] },
      }),
    ).toContain("2. kalem: Dayanak seçilmelidir.");
    expect(formatOpeningClaimCreateError({ body: { code: "BASKA" } })).toBeNull();
    expect(formatOpeningClaimCreateError(new Error("x"))).toBeNull();
  });
});
