/**
 * MPB-028(a) PR-2 — TebligatService.determinePttResultAction TK 21/2 regresyon testi
 * + PR-2 blocker resolution: TK m.20 explicit-override testleri.
 *
 * Önceki (hatalı) davranış: MERNİS adresinde muhtarlığa bırakılma → tebligSayilmaDate =
 * ilanTarihi + 15 gün. Bu, TK m.20'ye (muvakkaten başka yere gitme) ait kuralın TK m.21/2'ye
 * (MERNİS adresi) yanlışlıkla uygulanmasıydı (bkz. legal-time-authority-rebase.md §1.2).
 * Düzeltilmiş davranış: TK 21/1 ve TK 21/2 ikisi de GECİKMESİZ — kapıya yapıştırma/ilan tarihi
 * doğrudan tebliğ sayılma tarihidir.
 *
 * TK m.20 (Decision B): PTT sonucundan asla otomatik çıkarılmaz; yalnız operatörün açıkça
 * gönderdiği dto.tk21Type=TK_20 ile tetiklenir, gerekli kanıt (ilanDate/muhtarlikDate) yoksa
 * fail-closed.
 */
import { BadRequestException } from "@nestjs/common";
import { ServiceOccurrenceRegimeCode, ServiceCompletionMode } from "@prisma/client";
import { TebligatService } from "../tebligat.service";
import {
  TebligatAddressType,
  TebligatPttResult,
  Tk21Type,
  Tk20CompletionMode,
  SubstituteRecipientBasis,
} from "../dto/tebligat.dto";

describe("TebligatService.determinePttResultAction — TK 21/1 ve TK 21/2 (regresyon)", () => {
  const buildService = () =>
    new (TebligatService as any)({} as any, {} as any, {} as any, {} as any) as TebligatService;

  const callDeterminePttResultAction = (svc: TebligatService, tebligat: any, dto: any) =>
    (svc as any).determinePttResultAction(tebligat, dto);

  it("REGRESYON — MUHTARLIGA_BIRAKILDI + MERNİS (TK 21/2): tebligSayilmaDate = ilanDate AYNEN, +15 gün YOK", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };
    const ilanDate = "2026-01-10";

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      ilanDate,
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_21_2);
    // Önceki hatalı davranışta bu değer 2026-01-25 (ilanDate + 15) olurdu.
    expect(result.tebligSayilmaDate).toEqual(new Date(ilanDate));
    // TEST-04 (DEBTOR-OF01-HISTORY-P04-A1-R1): MERNİS + normal muhtar yolu → TK_21_2 serviceRegimeCode.
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_21_2);
    // DEBTOR-OF01-HISTORY-P04-A1-R2 (owner "STOP-03 RESOLUTION" — TK 21/1 ve TK 21/2 notu):
    // serviceCompletionMode bugün deterministik değil, bilinçli olarak undefined (uydurma YOK).
    expect(result.serviceCompletionMode).toBeUndefined();
  });

  it("MUHTARLIGA_BIRAKILDI + BİLİNEN adres (TK 21/1): tebligSayilmaDate = muhtarlikDate, gecikmesiz", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };
    const muhtarlikDate = "2026-01-10";

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      muhtarlikDate,
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_21_1);
    expect(result.tebligSayilmaDate).toEqual(new Date(muhtarlikDate));
    // TEST-03 (DEBTOR-OF01-HISTORY-P04-A1-R1): bilinen adres + normal muhtar yolu → TK_21_1.
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_21_1);
    expect(result.serviceCompletionMode).toBeUndefined();
  });

  it("IMTINA + BİLİNEN adres (TK 21/1): tebligSayilmaDate = muhtarlikDate, gecikmesiz", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };
    const muhtarlikDate = "2026-01-10";

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.IMTINA,
      muhtarlikDate,
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_21_1);
    expect(result.tebligSayilmaDate).toEqual(new Date(muhtarlikDate));
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_21_1);
    expect(result.serviceCompletionMode).toBeUndefined();
  });

  // TEST-01/02 (DEBTOR-OF01-HISTORY-P04-A1-R1, R2'de IMMEDIATE_SERVICE'e yeniden adlandırıldı):
  // doğrudan teslim + yakın/yetkili teslim (repository'de ayrı bir sınıf yok — üçü de status/
  // nextAction bakımından aynı işlenir) → IMMEDIATE_SERVICE.
  it("TESLIM_EDILDI → IMMEDIATE_SERVICE + serviceCompletionMode=DIRECT_RECIPIENT_DELIVERY", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, { pttResult: TebligatPttResult.TESLIM_EDILDI });

    expect(result.tk21Type).toBeUndefined();
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE);
    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.DIRECT_RECIPIENT_DELIVERY);
  });

  // DEBTOR-OF01-HISTORY-P04-A1-R2: AYNI_KONUTTA_TESLIM/ISYERINDE_TESLIM YENİ bir yorumlama
  // DEĞİLDİR — bu ikisi zaten pttResult enum'unun kendi anlamı gereği "yetkili/aynı konuttaki
  // kişiye teslim" olduğu için DELIVERED_TO_AUTHORIZED_PERSON'a eşlenir (TESLIM_EDILDI'den
  // AYRI). substituteRecipientBasis bu görevde IMMEDIATE_SERVICE için BİLİNÇLİ OLARAK
  // doldurulmaz (owner brief: "NARROW ... ONLY" — yalnız TK_20 dalı kapsamı).
  it.each([TebligatPttResult.AYNI_KONUTTA_TESLIM, TebligatPttResult.ISYERINDE_TESLIM])(
    "%s → IMMEDIATE_SERVICE + serviceCompletionMode=DELIVERED_TO_AUTHORIZED_PERSON, substituteRecipientBasis YOK",
    (pttResult) => {
      const svc = buildService();
      const tebligat = { addressType: TebligatAddressType.BILINEN };

      const result = callDeterminePttResultAction(svc, tebligat, { pttResult });

      expect(result.tk21Type).toBeUndefined();
      expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE);
      expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON);
      expect(result.substituteRecipientBasis).toBeUndefined();
    },
  );

  // TEST-08 (DEBTOR-OF01-HISTORY-P04-A1-R1): başarısız/yönlendirme sonuçlarında (hiçbir teslim/tevdi
  // mekanizması gerçekleşmedi) serviceRegimeCode uydurma üretilmez, undefined kalır — tk21Type ile
  // birebir aynı semantik.
  it.each([
    TebligatPttResult.ADRESTE_BULUNAMADI,
    TebligatPttResult.TASINMIS,
    TebligatPttResult.VEFAT,
  ])("%s → hiçbir mekanizma gerçekleşmedi, serviceRegimeCode uydurma üretilmez (undefined)", (pttResult) => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, { pttResult });

    expect(result.tk21Type).toBeUndefined();
    expect(result.serviceRegimeCode).toBeUndefined();
  });
});

describe("TebligatService.determinePttResultAction — TK m.20 explicit override (PR-2 blocker resolution)", () => {
  const buildService = () =>
    new (TebligatService as any)({} as any, {} as any, {} as any, {} as any) as TebligatService;

  const callDeterminePttResultAction = (svc: TebligatService, tebligat: any, dto: any) =>
    (svc as any).determinePttResultAction(tebligat, dto);

  it("explicit TK_20 + ilanDate (kanıt) + tk20CompletionMode=NOTICE_POSTED → PASS, tebligSayilmaDate (LEGACY) = ilanDate + 15 gün, serviceOccurredOnOverride = tk20CompletionDate AYNEN", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      ilanDate: "2026-01-10",
      tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      tk20CompletionDate: "2026-01-12",
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    // LEGACY tebligSayilmaDate: bu görevde BİLİNÇLİ OLARAK dokunulmadı, hâlâ ilanDate + 15 gün.
    expect(result.tebligSayilmaDate).toEqual(new Date("2026-01-25T00:00:00.000Z"));
    expect(result.status).toBe("MUHTARLIGA_BIRAKILDI");
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE);
    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.NOTICE_POSTED);
    // YENİ serviceOccurredOnOverride: tk20CompletionDate'ten AYNEN gelir, ilanDate'ten BAĞIMSIZ,
    // +15 gün EKLENMEZ (owner "STOP-03 RESOLUTION": "tk20CompletionDate occurrence.occurredOn'a taşınmalı").
    expect(result.serviceOccurredOnOverride).toEqual(new Date("2026-01-12"));
  });

  it("explicit TK_20 + yalnız muhtarlikDate (ilanDate yok) + tk20CompletionMode=DELIVERED_TO_AUTHORIZED_PERSON + substituteRecipientBasis → PASS", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      muhtarlikDate: "2026-01-10",
      tk20CompletionMode: Tk20CompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
      tk20CompletionDate: "2026-01-11",
      substituteRecipientBasis: SubstituteRecipientBasis.ARTICLE_16,
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    expect(result.tebligSayilmaDate).toEqual(new Date("2026-01-25T00:00:00.000Z"));
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE);
    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON);
    expect(result.substituteRecipientBasis).toBe("ARTICLE_16");
    expect(result.serviceOccurredOnOverride).toEqual(new Date("2026-01-11"));
  });

  // TEST-05 (DEBTOR-OF01-HISTORY-P04-A1-R1, P04-B STOP-02'nin kök nedeni): explicit TK_20 override
  // adres türünden (BILINEN/MERNIS) TAMAMEN BAĞIMSIZ olarak serviceRegimeCode=TK_20_TEMPORARY_ABSENCE
  // üretir — TK_21_1/TK_21_2 olarak YANLIŞLIKLA yeniden sınıflandırılamaz.
  it.each([TebligatAddressType.BILINEN, TebligatAddressType.MERNIS])(
    "explicit TK_20 override, addressType=%s olsa dahi serviceRegimeCode=TK_20_TEMPORARY_ABSENCE (adres türünden bağımsız)",
    (addressType) => {
      const svc = buildService();
      const tebligat = { addressType };

      const result = callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        tk21Type: Tk21Type.TK_20,
        ilanDate: "2026-01-10",
        tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
        tk20CompletionDate: "2026-01-10",
      });

      expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE);
      expect(result.serviceRegimeCode).not.toBe(ServiceOccurrenceRegimeCode.TK_21_1);
      expect(result.serviceRegimeCode).not.toBe(ServiceOccurrenceRegimeCode.TK_21_2);
    },
  );

  it("explicit TK_20 + kanıt tarihi YOK (ne ilanDate ne muhtarlikDate) → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        tk21Type: Tk21Type.TK_20,
      }),
    ).toThrow(BadRequestException);
  });

  it("explicit TK_20, pttResult PTT-bazlı çıkarımın önüne geçer (pttResult=TESLIM_EDILDI olsa dahi override bağlayıcı)", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.TESLIM_EDILDI,
      tk21Type: Tk21Type.TK_20,
      ilanDate: "2026-01-10",
      tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      tk20CompletionDate: "2026-01-10",
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    expect(result.status).toBe("MUHTARLIGA_BIRAKILDI"); // TESLIM_EDILDI'nin normal dalı DEĞİL
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE);
  });

  // TEST-06 (DEBTOR-OF01-HISTORY-P04-A1-R1): explicit override yokken serviceRegimeCode asla
  // sessizce TK_20_TEMPORARY_ABSENCE'e yeniden sınıflandırılmaz — mevcut adres-türü tabanlı
  // TK_21_1/TK_21_2 davranışı, tk21Type ile birebir aynı şekilde korunur.
  it("PTT sonucu TEK BAŞINA (explicit tk21Type olmadan) TK_20 olarak asla tahmin edilmez", () => {
    const svc = buildService();
    // MUHTARLIGA_BIRAKILDI + MERNIS: dto.tk21Type gönderilmedi → mevcut TK_21_2 (gecikmesiz)
    // davranışı devam eder, TK_20 asla üretilmez (üretim yolu yok — bkz. NEW FINDINGS).
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      ilanDate: "2026-01-10",
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_21_2);
    expect(result.tk21Type).not.toBe(Tk21Type.TK_20);
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_21_2);
    expect(result.serviceRegimeCode).not.toBe(ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE);
  });
});

describe("TebligatService.determinePttResultAction — DEBTOR-OF01-HISTORY-P04-A1-R2 STOP-03 RESOLUTION (owner kararı)", () => {
  const buildService = () =>
    new (TebligatService as any)({} as any, {} as any, {} as any, {} as any) as TebligatService;

  const callDeterminePttResultAction = (svc: TebligatService, tebligat: any, dto: any) =>
    (svc as any).determinePttResultAction(tebligat, dto);

  const baseTk20Dto = {
    pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
    tk21Type: Tk21Type.TK_20,
    ilanDate: "2026-01-10",
  };

  // TEST-18: TK_20 seçilip completion mode verilmezse request reddedilir.
  it("TEST-18 — TK_20 + tk20CompletionMode YOK → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, { ...baseTk20Dto, tk20CompletionDate: "2026-01-10" }),
    ).toThrow(BadRequestException);
  });

  // TEST-19: TK_20 seçilip completion date verilmezse request reddedilir.
  it("TEST-19 — TK_20 + tk20CompletionDate YOK → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        ...baseTk20Dto,
        tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      }),
    ).toThrow(BadRequestException);
  });

  // TEST-20: TK_20 dışındaki rejimde tk20CompletionMode gönderilirse reddedilir.
  it("TEST-20 — tk21Type≠TK_20 + tk20CompletionMode gönderildi → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        muhtarlikDate: "2026-01-10",
        tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      }),
    ).toThrow(BadRequestException);
  });

  // TEST-21: TK_20 dışındaki rejimde tk20CompletionDate gönderilirse reddedilir.
  it("TEST-21 — tk21Type≠TK_20 + tk20CompletionDate gönderildi → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        muhtarlikDate: "2026-01-10",
        tk20CompletionDate: "2026-01-10",
      }),
    ).toThrow(BadRequestException);
  });

  // TEST-20b: aynı ilke substituteRecipientBasis için de geçerli (owner "Kesin yasaklar" ile aynı
  // "NARROW ... ONLY" ilkesinin tutarlı uzantısı).
  it("TEST-20b — tk21Type≠TK_20 + substituteRecipientBasis gönderildi → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        muhtarlikDate: "2026-01-10",
        substituteRecipientBasis: SubstituteRecipientBasis.ARTICLE_16,
      }),
    ).toThrow(BadRequestException);
  });

  // TEST-22: DELIVERED_TO_AUTHORIZED_PERSON değeri immutable occurrence'a aynen yazılır (bu
  // birimde yalnız determinePttResultAction'ın DÖNÜŞ değeri doğrulanır — disposable-DB testi
  // gerçek immutable satırı doğrular, bkz. service-occurrence-write.db-gated.integration.spec.ts).
  it("TEST-22 — tk20CompletionMode=DELIVERED_TO_AUTHORIZED_PERSON aynen döner", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      ...baseTk20Dto,
      tk20CompletionMode: Tk20CompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
      tk20CompletionDate: "2026-01-10",
      substituteRecipientBasis: SubstituteRecipientBasis.ARTICLE_16,
    });

    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON);
  });

  // TEST-23: NOTICE_POSTED değeri immutable occurrence'a aynen yazılır.
  it("TEST-23 — tk20CompletionMode=NOTICE_POSTED aynen döner", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      ...baseTk20Dto,
      tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      tk20CompletionDate: "2026-01-10",
    });

    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.NOTICE_POSTED);
  });

  // TEST-24: tk20CompletionDate occurredOn olarak aynen korunur (ilanDate'ten FARKLI bir tarih
  // kullanılarak ikisinin karıştırılmadığı da ayrıca kanıtlanır).
  it("TEST-24 — tk20CompletionDate serviceOccurredOnOverride'a aynen taşınır, ilanDate'ten bağımsızdır", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      ilanDate: "2026-02-01", // BİLİNÇLİ OLARAK farklı — legacy tebligSayilmaDate kaynağı
      tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      tk20CompletionDate: "2026-03-15", // occurredOn kaynağı — ilanDate'ten TAMAMEN bağımsız
    });

    expect(result.serviceOccurredOnOverride).toEqual(new Date("2026-03-15"));
    expect(result.serviceOccurredOnOverride).not.toEqual(new Date("2026-02-01"));
  });

  // TEST-25: serbest metinden (pttResultNote) veya eski tarih alanlarından (muhtarlikDate/ilanDate)
  // completion mode için hiçbir inference YAPILMAZ — tk20CompletionMode dışında hiçbir sinyal
  // serviceCompletionMode'u etkilemez.
  it("TEST-25 — pttResultNote/muhtarlikDate/ilanDate serviceCompletionMode'u ETKİLEMEZ", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      ilanDate: "2026-01-10",
      muhtarlikDate: "2026-01-05",
      pttResultNote: "ihbarname kapıya yapıştırıldı, yetkili kişi bulunamadı", // metin İMA etse dahi
      tk20CompletionMode: Tk20CompletionMode.DELIVERED_TO_AUTHORIZED_PERSON, // ...operatörün AÇIKÇA seçtiği değer bağlayıcıdır
      tk20CompletionDate: "2026-01-10",
      substituteRecipientBasis: SubstituteRecipientBasis.ARTICLE_16,
    });

    expect(result.serviceCompletionMode).toBe(ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON);
  });

  // TEST-26: authorized-person modu için gerekli substituteRecipientBasis eksikse reddedilir.
  it("TEST-26 — tk20CompletionMode=DELIVERED_TO_AUTHORIZED_PERSON + substituteRecipientBasis YOK → FAIL CLOSED", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    expect(() =>
      callDeterminePttResultAction(svc, tebligat, {
        ...baseTk20Dto,
        tk20CompletionMode: Tk20CompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
        tk20CompletionDate: "2026-01-10",
      }),
    ).toThrow(BadRequestException);
  });

  // Owner kararı: NOTICE_POSTED için substituteRecipientBasis OPTIONAL/NULL kalabilir (repository'de
  // kesin bir kaynak YOK) — bu, TEST-26'nın simetriği: reddetmemesi de ayrıca doğrulanır.
  it("NOTICE_POSTED + substituteRecipientBasis YOK → PASS (optional, zorunlu DEĞİL)", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      ...baseTk20Dto,
      tk20CompletionMode: Tk20CompletionMode.NOTICE_POSTED,
      tk20CompletionDate: "2026-01-10",
    });

    expect(result.substituteRecipientBasis).toBeUndefined();
  });
});
