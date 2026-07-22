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
import { ServiceOccurrenceRegimeCode } from "@prisma/client";
import { TebligatService } from "../tebligat.service";
import { TebligatAddressType, TebligatPttResult, Tk21Type } from "../dto/tebligat.dto";

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
  });

  // TEST-01/02 (DEBTOR-OF01-HISTORY-P04-A1-R1): doğrudan teslim + yakın/yetkili teslim (repository'de
  // ayrı bir sınıf yok — üçü de status/nextAction bakımından aynı işlenir) → DIRECT_DELIVERY.
  it.each([
    TebligatPttResult.TESLIM_EDILDI,
    TebligatPttResult.AYNI_KONUTTA_TESLIM,
    TebligatPttResult.ISYERINDE_TESLIM,
  ])("%s → doğrudan teslim, tk21Type YOK (rejim dışı), serviceRegimeCode=DIRECT_DELIVERY", (pttResult) => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, { pttResult });

    expect(result.tk21Type).toBeUndefined();
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.DIRECT_DELIVERY);
  });

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

  it("explicit TK_20 + ilanDate (kanıt) → PASS, tebligSayilmaDate = ilanDate + 15 gün", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.MERNIS };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      ilanDate: "2026-01-10",
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    expect(result.tebligSayilmaDate).toEqual(new Date("2026-01-25T00:00:00.000Z"));
    expect(result.status).toBe("MUHTARLIGA_BIRAKILDI");
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20);
  });

  it("explicit TK_20 + yalnız muhtarlikDate (ilanDate yok) → PASS, muhtarlikDate + 15 gün kaynak alınır", () => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, {
      pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
      tk21Type: Tk21Type.TK_20,
      muhtarlikDate: "2026-01-10",
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    expect(result.tebligSayilmaDate).toEqual(new Date("2026-01-25T00:00:00.000Z"));
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20);
  });

  // TEST-05 (DEBTOR-OF01-HISTORY-P04-A1-R1, P04-B STOP-02'nin kök nedeni): explicit TK_20 override
  // adres türünden (BILINEN/MERNIS) TAMAMEN BAĞIMSIZ olarak serviceRegimeCode=TK_20 üretir — TK_20,
  // addressTypeAtOccurrence'a bakılarak TK_21_1/TK_21_2 olarak YANLIŞLIKLA yeniden sınıflandırılamaz.
  it.each([TebligatAddressType.BILINEN, TebligatAddressType.MERNIS])(
    "explicit TK_20 override, addressType=%s olsa dahi serviceRegimeCode=TK_20 (adres türünden bağımsız)",
    (addressType) => {
      const svc = buildService();
      const tebligat = { addressType };

      const result = callDeterminePttResultAction(svc, tebligat, {
        pttResult: TebligatPttResult.MUHTARLIGA_BIRAKILDI,
        tk21Type: Tk21Type.TK_20,
        ilanDate: "2026-01-10",
      });

      expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20);
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
    });

    expect(result.tk21Type).toBe(Tk21Type.TK_20);
    expect(result.status).toBe("MUHTARLIGA_BIRAKILDI"); // TESLIM_EDILDI'nin normal dalı DEĞİL
    expect(result.serviceRegimeCode).toBe(ServiceOccurrenceRegimeCode.TK_20);
  });

  // TEST-06 (DEBTOR-OF01-HISTORY-P04-A1-R1): explicit override yokken serviceRegimeCode asla
  // sessizce TK_20'ye yeniden sınıflandırılmaz — mevcut adres-türü tabanlı TK_21_1/TK_21_2
  // davranışı, tk21Type ile birebir aynı şekilde korunur.
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
    expect(result.serviceRegimeCode).not.toBe(ServiceOccurrenceRegimeCode.TK_20);
  });
});
