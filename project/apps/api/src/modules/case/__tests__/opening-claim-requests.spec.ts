import { evaluateOpeningClaimRequests, hasOpeningClaimRequests, type OpeningDueInput } from '../opening-claim-requests';

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI — saf doğrulama ve önizleme (owner talimatı 2026-11-18).
 *
 * Kanıtlanan:
 *  - Beyan yoksa kalemler "belirlenmedi" görünür: borçlu sayısından ya da kalem türünden pay / sorumluluk ÇIKARILMAZ.
 *  - "Faiz işler" ve sorumluluk seçimi açılışta kaleme yazılacak değer DEĞİL, onaya gidecek beyandır.
 *  - Alan kuralları sonradan düzenlemeyle aynıdır (faiz: tür + dayanak + başlangıç; sorumluluk: seçim alanı kodları).
 *  - Paylar kalemin tam tutarından kuruş hassasiyetiyle hesaplanır; borçlu rakamları toplanarak dosya borcu üretilmez.
 *  - Önizleme özeti gösterilen girdiye bağlıdır.
 * Tutarlar SENTETİKTİR.
 */
const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestAccrualStatus: 'UNKNOWN' } as const;
const vekalet = { type: 'VEKALET_UCRETI', description: 'Sentetik ilam vekâlet ücreti', amount: 4200.01, attorneyFeeBasis: 'JUDGMENT_AWARDED', ...yasal } as unknown as OpeningDueInput;
const yargilama = { type: 'YARGILAMA_GIDERI', description: 'Sentetik yargılama gideri', amount: 480, ...yasal } as unknown as OpeningDueInput;
const B1 = 'debtor-1';
const B2 = 'debtor-2';

const evaluate = (requests: unknown, dues: OpeningDueInput[] = [vekalet, yargilama], debtorIds: string[] = [B1, B2]) =>
  evaluateOpeningClaimRequests({ currency: 'TRY', dues, debtorIds, requests: requests as never });

const kesinlesme = (dueIndex: number) => ({ dueIndex, interestStartDate: '2025-04-02', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' });
const esitPay = (dueIndex: number) => ({
  dueIndex,
  mode: 'PROPORTIONAL',
  basis: 'COURT_JUDGMENT',
  parties: [
    { debtorId: B1, shareWeight: 1 },
    { debtorId: B2, shareWeight: 1 },
  ],
});
const kodlar = (result: ReturnType<typeof evaluate>) => result.preview.hatalar.map((hata) => hata.kod);

describe('Açılış kalem beyanları — beyan yokken hiçbir sonuç çıkarılmaz', () => {
  it('iki borçlu + iki ilam kalemi, beyan yok → her şey "belirlenmedi"; pay / üst sınır üretilmez', () => {
    const { preview, plan } = evaluate(undefined);
    expect(preview.uygulanabilir).toBe(true);
    expect(preview.hatalar).toEqual([]);
    expect(preview.kalemTutarlariToplami).toBe(4680.01);
    expect(preview.kalemler.map((kalem) => kalem.kalemTuru)).toEqual(['ATTORNEY_FEE', 'YARGILAMA_GIDERI']);
    for (const kalem of preview.kalemler) {
      expect(kalem.faiz).toEqual({ acilisDurumu: 'UNKNOWN', anaparaKalemi: false, onayBekleyecekBeyan: null });
      expect(kalem.sorumluluk).toEqual({ acilisTuru: 'BELIRLENMEDI', onayBekleyecekSecim: null });
    }
    // Borçlu sayısı iki diye yarı yarıya bölünmez; kesin rakam yok.
    for (const borclu of preview.borcluDagilimi) {
      expect(borclu.belirlenmeyenKalemSayisi).toBe(2);
      expect(borclu.sorumlulukUstSiniri).toBeNull();
      expect(borclu.kalemler.every((satir) => satir.durum === 'BELIRLENMEDI' && satir.sorumlulukSiniri === null)).toBe(true);
    }
    expect(plan.interestAccruals).toEqual([]);
    expect(plan.liabilitySelections).toEqual([]);
    expect(preview.onayaGidecekFaizBeyaniSayisi).toBe(0);
    expect(preview.onayaGidecekSorumlulukSecimiSayisi).toBe(0);
  });

  it('vekâlet ücreti kaynağı yalnız gönderilen değerdir; gönderilmezse null kalır (açıklamadan çıkarım yok)', () => {
    const kaynaksiz = { ...vekalet, attorneyFeeBasis: undefined } as OpeningDueInput;
    expect(evaluate(undefined, [vekalet]).preview.kalemler[0].vekaletUcretiKaynagi).toBe('JUDGMENT_AWARDED');
    expect(evaluate(undefined, [kaynaksiz]).preview.kalemler[0].vekaletUcretiKaynagi).toBeNull();
  });

  it('"faiz işlemez" açılışta kayıtlı durumdur; nafaka satırından alacak kalemi üretilmez ve toplama girmez', () => {
    const faizsiz = { type: 'EXPENSE', amount: 100, interestAccrualStatus: 'NO_INTEREST' } as unknown as OpeningDueInput;
    const nafaka = { type: 'NAFAKA', amount: 900 } as unknown as OpeningDueInput;
    const { preview } = evaluate(undefined, [faizsiz, nafaka]);
    expect(preview.kalemler[0].faiz.acilisDurumu).toBe('NO_INTEREST');
    expect(preview.kalemler[1].kalemTuru).toBeNull();
    expect(preview.kalemTutarlariToplami).toBe(100);
    expect(preview.borcluDagilimi[0].kalemler.map((satir) => satir.dueIndex)).toEqual([0]);
  });

  it('hasOpeningClaimRequests: boş blok beyan sayılmaz', () => {
    expect(hasOpeningClaimRequests(undefined)).toBe(false);
    expect(hasOpeningClaimRequests({ interestAccruals: [], liabilitySelections: [] })).toBe(false);
    expect(hasOpeningClaimRequests({ interestAccruals: [kesinlesme(0)] })).toBe(true);
    expect(hasOpeningClaimRequests({ liabilitySelections: [esitPay(0)] })).toBe(true);
  });
});

describe('Açılış kalem beyanları — asıl alacak kalemi önizlemede ayrıca işaretlenir', () => {
  it('asıl alacak sınıfındaki kalem (motorun sınıflayıcısı) işaretlenir; yan kalem işaretlenmez — "belirlenmedi" tek başına "faiz hesaplanmaz" demek değildir', () => {
    const asil = { type: 'PRINCIPAL', description: 'Sentetik asıl alacak', amount: 1000, interestStartDate: '2025-01-01', ...yasal } as unknown as OpeningDueInput;
    const kira = { type: 'KIRA', description: 'Sentetik kira', amount: 300, ...yasal } as unknown as OpeningDueInput;
    const { preview } = evaluate(undefined, [asil, kira, vekalet, yargilama]);
    expect(preview.uygulanabilir).toBe(true);
    expect(preview.kalemler.map((kalem) => [kalem.kalemTuru, kalem.faiz.anaparaKalemi])).toEqual([
      ['PRINCIPAL', true],
      ['PRINCIPAL', true],
      ['ATTORNEY_FEE', false],
      ['YARGILAMA_GIDERI', false],
    ]);
    // Açılışta kaleme yazılacak durum yine "belirlenmedi"dir; işaret yalnız gösterim içindir (beyan / plan üretmez).
    expect(preview.kalemler[0].faiz.acilisDurumu).toBe('UNKNOWN');
    expect(preview.onayaGidecekFaizBeyaniSayisi).toBe(0);
  });
});

describe('Açılış kalem beyanları — "faiz işler" beyanı (sonradan düzenlemeyle aynı kurallar)', () => {
  it('tür + dayanak + başlangıç tam → onaya gidecek beyan; açılış durumu "belirlenmedi" kalır', () => {
    const { preview, plan } = evaluate({ interestAccruals: [kesinlesme(0), kesinlesme(1)] });
    expect(preview.uygulanabilir).toBe(true);
    expect(preview.kalemler[0].faiz).toEqual({
      acilisDurumu: 'UNKNOWN',
      anaparaKalemi: false,
      onayBekleyecekBeyan: { durum: 'ACCRUES', faizTuruKodu: 'LEGAL_3095', baslangic: '2025-04-02', dayanak: 'JUDGMENT_FINALIZATION_DATE' },
    });
    expect(plan.interestAccruals).toEqual([
      { dueIndex: 0, interestStartDate: '2025-04-02', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' },
      { dueIndex: 1, interestStartDate: '2025-04-02', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' },
    ]);
  });

  it('dayanak "takip tarihi" ise başlangıç tarihi istenmez (tarih dosyadan mekanik çözülür)', () => {
    const { preview, plan } = evaluate({ interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' }] });
    expect(preview.uygulanabilir).toBe(true);
    expect(plan.interestAccruals[0]).toEqual({ dueIndex: 0, interestStartDate: null, interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' });
  });

  it.each([
    ['başlangıç tarihi yok', { dueIndex: 0, interestStartDateProvenance: 'JUDGMENT_DATE' }],
    ['dayanak yok', { dueIndex: 0, interestStartDate: '2025-04-02', interestStartDateProvenance: '' }],
  ])('eksik beyan reddedilir (%s); eksik bilgi tamamlanmaz', (_ad, accrual) => {
    const result = evaluate({ interestAccruals: [accrual] });
    expect(result.preview.uygulanabilir).toBe(false);
    expect(kodlar(result)).toEqual(['INTEREST_ACCRUAL_INVALID']);
    expect(result.plan.interestAccruals).toEqual([]);
  });

  it('yarım / bozuk girdi biçim hatası değil, kalem bazında OKUNUR girdi hatasıdır (form doldurulurken önizleme kesilmez)', () => {
    const bosDayanak = evaluate({ interestAccruals: [{ dueIndex: 0, interestStartDate: '2025-04-02', interestStartDateProvenance: '' }] });
    expect(bosDayanak.preview.hatalar).toEqual([
      { kod: 'INTEREST_ACCRUAL_INVALID', alan: 'FAIZ', dueIndex: 0, debtorId: null, mesaj: '"Faiz işler" beyanı için faiz başlangıcının dayanağı seçilmelidir.' },
    ]);
    // Bilinmeyen dayanak değeri de aynı hatadır; kabul edilen değerler şema enum'udur.
    expect(kodlar(evaluate({ interestAccruals: [{ dueIndex: 0, interestStartDate: '2025-04-02', interestStartDateProvenance: 'ILAMDAN_ANLASILIYOR' }] }))).toEqual(['INTEREST_ACCRUAL_INVALID']);
    expect(evaluate({ interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'JUDGMENT_DATE' }] }).preview.hatalar[0].mesaj).toContain('faiz başlangıç tarihi girilmelidir');
    // Sayı biçimi: seçim gövdesindeki kalıplarla aynı; uymayan girdi alan kurallarına sokulmaz, pay / tavan üretilmez.
    const oran = (a: string) => ({ dueIndex: 0, mode: 'PROPORTIONAL', basis: 'COURT_JUDGMENT', parties: [{ debtorId: B1, sharePercent: a }, { debtorId: B2, sharePercent: '50' }] });
    for (const kotu of ['abc', '-50', '50.123', '1e2', '']) {
      const result = evaluate({ liabilitySelections: [oran(kotu)] });
      expect(kodlar(result)).toContain('SHARE_INPUT_INVALID');
      expect(result.plan.liabilitySelections).toEqual([]);
    }
    const tavan = (a: string) => ({ dueIndex: 0, mode: 'CAPPED', basis: 'COURT_JUDGMENT', parties: [{ debtorId: B1, limitAmount: a }] });
    for (const kotu of ['abc', '-5', '1e9', '400,00', '12345678901234']) {
      const result = evaluate({ liabilitySelections: [tavan(kotu)] });
      expect(result.preview.hatalar).toEqual([expect.objectContaining({ kod: 'LIMIT_INVALID', dueIndex: 0, debtorId: B1 })]);
      expect(result.plan.liabilitySelections).toEqual([]);
    }
  });

  it('kalemin kendi faiz türü yoksa "faiz işler" beyanı reddedilir (dosya türüne düşülmez)', () => {
    const tursuz = { type: 'VEKALET_UCRETI', amount: 100 } as unknown as OpeningDueInput;
    const result = evaluate({ interestAccruals: [kesinlesme(0)] }, [tursuz]);
    expect(kodlar(result)).toEqual(['INTEREST_ACCRUAL_INVALID']);
  });

  it('"faiz işlemez" girilmiş kalemde "faiz işler" beyanı çelişkidir', () => {
    const faizsiz = { type: 'EXPENSE', amount: 100, interestAccrualStatus: 'NO_INTEREST' } as unknown as OpeningDueInput;
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(0)] }, [faizsiz]))).toEqual(['INTEREST_ACCRUAL_NO_INTEREST_CONFLICT']);
  });

  it('beyanlı kalemde açılışta başka başlangıç / bitiş tarihi yazılamaz (onay bekleyen tarih yerine başka tarih hesaba girmesin)', () => {
    const baslangicli = { ...vekalet, interestStartDate: '2025-01-01' } as OpeningDueInput;
    const bitisli = { ...vekalet, interestEndDate: '2026-10-20' } as OpeningDueInput;
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(0)] }, [baslangicli]))).toEqual(['INTEREST_ACCRUAL_DUE_DATES_CONFLICT']);
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(0)] }, [bitisli]))).toEqual(['INTEREST_ACCRUAL_DUE_DATES_CONFLICT']);
    // Beyan yoksa bugünkü davranış: tarihli satır reddedilmez.
    expect(evaluate(undefined, [baslangicli]).preview.uygulanabilir).toBe(true);
  });

  it('geçersiz / yinelenen kalem sırası ve kalem üretmeyen satır reddedilir', () => {
    const nafaka = { type: 'NAFAKA', amount: 900 } as unknown as OpeningDueInput;
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(7)] }))).toEqual(['DUE_INDEX_INVALID']);
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(0), kesinlesme(0)] }))).toEqual(['DUE_INDEX_DUPLICATE']);
    expect(kodlar(evaluate({ interestAccruals: [kesinlesme(0)] }, [nafaka]))).toEqual(['DUE_HAS_NO_CLAIM_ITEM']);
  });
});

describe('Açılış kalem beyanları — borçlu sorumluluğu seçimi (seçim alanının kendi kuralları)', () => {
  it('paylı sorumluluk, eşit pay: paylar kalemin tam tutarından kuruşuyla; toplam tutara eşit', () => {
    const { preview, plan } = evaluate({ liabilitySelections: [esitPay(0), esitPay(1)] });
    expect(preview.uygulanabilir).toBe(true);
    const secim = preview.kalemler[0].sorumluluk.onayBekleyecekSecim!;
    expect(preview.kalemler[0].sorumluluk.acilisTuru).toBe('BELIRLENMEDI');
    expect(secim.tur).toBe('PAYLI');
    expect(secim.dayanak).toBe('COURT_JUDGMENT');
    // 4.200,01 ikiye bölünür: artan kuruş ilk borçluya (toplam korunur).
    expect(secim.borclular.map((borclu) => borclu.pay)).toEqual([2100.01, 2100]);
    expect(preview.kalemler[1].sorumluluk.onayBekleyecekSecim!.borclular.map((borclu) => borclu.pay)).toEqual([240, 240]);
    expect(preview.borcluDagilimi.map((borclu) => borclu.sorumlulukUstSiniri)).toEqual([2340.01, 2340]);
    expect(preview.borcluDagilimi.every((borclu) => borclu.belirlenmeyenKalemSayisi === 0)).toBe(true);
    expect(plan.liabilitySelections[0]).toEqual({
      dueIndex: 0,
      mode: 'PROPORTIONAL',
      basis: 'COURT_JUDGMENT',
      basisNote: null,
      parties: [
        { debtorId: B1, shareWeight: 1, limitAmount: null, unlimited: false },
        { debtorId: B2, shareWeight: 1, limitAmount: null, unlimited: false },
      ],
    });
  });

  it('paylı sorumluluk, yüzde: toplam tam 100,00 olmalı; paylar girilen oranla', () => {
    const yuzde = (a: string, b: string) => ({
      dueIndex: 0,
      mode: 'PROPORTIONAL',
      basis: 'COURT_JUDGMENT',
      parties: [
        { debtorId: B1, sharePercent: a },
        { debtorId: B2, sharePercent: b },
      ],
    });
    const gecerli = evaluate({ liabilitySelections: [yuzde('60', '40')] }, [{ ...yargilama, amount: 1000 } as OpeningDueInput]);
    expect(gecerli.preview.kalemler[0].sorumluluk.onayBekleyecekSecim!.borclular.map((borclu) => borclu.pay)).toEqual([600, 400]);
    expect(kodlar(evaluate({ liabilitySelections: [yuzde('60', '30')] }))).toEqual(['SHARE_PERCENT_TOTAL_INVALID']);
  });

  it('bir kalem seçimli, öteki seçimsiz → borçlu üst sınırı üretilmez (belirlenmeyen kalem sıfır sayılmaz)', () => {
    const { preview } = evaluate({ liabilitySelections: [esitPay(0)] });
    for (const borclu of preview.borcluDagilimi) {
      expect(borclu.belirlenmeyenKalemSayisi).toBe(1);
      expect(borclu.sorumlulukUstSiniri).toBeNull();
      expect(borclu.kalemler[1]).toEqual({ dueIndex: 1, durum: 'BELIRLENMEDI', sorumlulukSiniri: null });
    }
  });

  it('müteselsil: her borçlu kalemin tamamından sorumlu görünür; borçlu rakamları toplam DEĞİLDİR', () => {
    const muteselsil = { dueIndex: 0, mode: 'JOINT_AND_SEVERAL', basis: 'COURT_JUDGMENT', parties: [{ debtorId: B1 }, { debtorId: B2 }] };
    const { preview } = evaluate({ liabilitySelections: [muteselsil] }, [{ ...yargilama, amount: 1000 } as OpeningDueInput]);
    expect(preview.kalemler[0].sorumluluk.onayBekleyecekSecim!.tur).toBe('MUTESELSIL');
    expect(preview.borcluDagilimi.map((borclu) => borclu.sorumlulukUstSiniri)).toEqual([1000, 1000]);
    // Dosya toplamı tek rakamdır: 1.000,00 (2.000,00 değil).
    expect(preview.kalemTutarlariToplami).toBe(1000);
  });

  it('tutarla sınırlı: kişi bazında tavan; tavansız borçlu kalemin tamamı; seçimde olmayan borçlu 0', () => {
    const sinirli = {
      dueIndex: 0,
      mode: 'CAPPED',
      basis: 'OTHER',
      basisNote: 'Sentetik dayanak notu',
      parties: [{ debtorId: B1, limitAmount: '400.00' }, { debtorId: B2, unlimited: true }],
    };
    const { preview, plan } = evaluate({ liabilitySelections: [sinirli] }, [{ ...yargilama, amount: 1000 } as OpeningDueInput], [B1, B2, 'debtor-3']);
    const secim = preview.kalemler[0].sorumluluk.onayBekleyecekSecim!;
    expect(secim.tur).toBe('TUTARLA_SINIRLI');
    expect(secim.tavanKapsami).toBe('ITEM_AMOUNT');
    expect(secim.borclular).toEqual([
      { debtorId: B1, pay: null, payAgirligi: null, tavan: 400, sinirsiz: false, sorumlulukSiniri: 400 },
      { debtorId: B2, pay: null, payAgirligi: null, tavan: null, sinirsiz: true, sorumlulukSiniri: 1000 },
    ]);
    expect(preview.borcluDagilimi[2].kalemler[0]).toEqual({ dueIndex: 0, durum: 'SECIMDE_YOK', sorumlulukSiniri: 0 });
    expect(plan.liabilitySelections[0].parties).toEqual([
      { debtorId: B1, shareWeight: null, limitAmount: '400.00', unlimited: false },
      { debtorId: B2, shareWeight: null, limitAmount: null, unlimited: true },
    ]);
  });

  it.each([
    ['dayanak yok', { ...esitPay(0), basis: undefined }, 'BASIS_REQUIRED'],
    ['dayanak notu zorunlu', { ...esitPay(0), basis: 'LAWYER_ASSESSMENT' }, 'BASIS_NOTE_REQUIRED'],
    ['paylıda tek borçlu', { ...esitPay(0), parties: [{ debtorId: B1, shareWeight: 1 }] }, 'PARTY_COUNT_INVALID'],
    ['dosyada olmayan borçlu', { ...esitPay(0), parties: [{ debtorId: B1, shareWeight: 1 }, { debtorId: 'yabanci', shareWeight: 1 }] }, 'PARTY_NOT_ACTIVE_CASE_DEBTOR'],
    ['pay girdisi yok', { ...esitPay(0), parties: [{ debtorId: B1 }, { debtorId: B2 }] }, 'SHARE_INPUT_INVALID'],
    ['geçersiz tür', { ...esitPay(0), mode: 'YARI_YARIYA' }, 'MODE_INVALID'],
    ['tavan sıfır', { dueIndex: 0, mode: 'CAPPED', basis: 'COURT_JUDGMENT', parties: [{ debtorId: B1, limitAmount: '0' }] }, 'LIMIT_INVALID'],
  ])('geçersiz seçim reddedilir: %s', (_ad, draft, beklenen) => {
    const result = evaluate({ liabilitySelections: [draft] });
    expect(result.preview.uygulanabilir).toBe(false);
    expect(kodlar(result)).toContain(beklenen);
    expect(result.plan.liabilitySelections).toEqual([]);
  });

  it('"belirlenmedi" seçim olarak gönderilmez (seçim kaydının yokluğudur)', () => {
    expect(kodlar(evaluate({ liabilitySelections: [{ dueIndex: 0, mode: 'UNDETERMINED' }] }))).toEqual(['UNDETERMINED_NOT_A_REQUEST']);
  });

  it('borçlu listesi yokken seçim reddedilir; aynı kişi iki rolle gelse de tek kişi sayılır', () => {
    expect(kodlar(evaluate({ liabilitySelections: [esitPay(0)] }, [vekalet], []))).toEqual(['DEBTORS_REQUIRED']);
    const { preview } = evaluate({ liabilitySelections: [esitPay(0)] }, [vekalet], [B1, B2, B1]);
    expect(preview.uygulanabilir).toBe(true);
    expect(preview.borcluDagilimi.map((borclu) => borclu.debtorId)).toEqual([B1, B2]);
  });
});

describe('Açılış kalem beyanları — önizleme özeti gösterilen girdiye bağlıdır', () => {
  const requests = { interestAccruals: [kesinlesme(0)], liabilitySelections: [esitPay(0)] };
  const ozet = (r: unknown, dues?: OpeningDueInput[], debtorIds?: string[]) => evaluate(r, dues, debtorIds).preview.onizlemeOzeti;

  it('aynı girdi → aynı özet; plan özeti taşır', () => {
    const first = evaluate(requests);
    expect(first.preview.onizlemeOzeti).toBe(ozet(requests));
    expect(first.plan.previewHash).toBe(first.preview.onizlemeOzeti);
  });

  it.each([
    ['kalem tutarı', () => ozet(requests, [{ ...vekalet, amount: 4200.02 } as OpeningDueInput, yargilama])],
    ['kalem türü', () => ozet(requests, [{ ...vekalet, type: 'EXPENSE', attorneyFeeBasis: undefined } as unknown as OpeningDueInput, yargilama])],
    ['vekâlet ücreti kaynağı', () => ozet(requests, [{ ...vekalet, attorneyFeeBasis: 'ENFORCEMENT_TARIFF' } as OpeningDueInput, yargilama])],
    ['borçlu listesi', () => ozet(requests, undefined, [B1, B2, 'debtor-3'])],
    ['faiz başlangıcı', () => ozet({ ...requests, interestAccruals: [{ ...kesinlesme(0), interestStartDate: '2025-04-03' }] })],
    ['faiz dayanağı', () => ozet({ ...requests, interestAccruals: [{ ...kesinlesme(0), interestStartDateProvenance: 'JUDGMENT_DATE' }] })],
    ['sorumluluk türü', () => ozet({ ...requests, liabilitySelections: [{ dueIndex: 0, mode: 'JOINT_AND_SEVERAL', basis: 'COURT_JUDGMENT', parties: [{ debtorId: B1 }, { debtorId: B2 }] }] })],
    ['pay', () => ozet({ ...requests, liabilitySelections: [{ ...esitPay(0), parties: [{ debtorId: B1, shareWeight: 2 }, { debtorId: B2, shareWeight: 1 }] }] })],
    ['beyanın kaldırılması', () => ozet({ interestAccruals: [kesinlesme(0)] })],
  ])('%s değişirse özet değişir', (_ad, degisen) => {
    expect(degisen()).not.toBe(ozet(requests));
  });
});
