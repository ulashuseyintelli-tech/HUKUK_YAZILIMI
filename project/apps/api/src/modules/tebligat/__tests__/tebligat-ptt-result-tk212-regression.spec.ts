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
  });

  it.each([
    TebligatPttResult.TESLIM_EDILDI,
    TebligatPttResult.AYNI_KONUTTA_TESLIM,
    TebligatPttResult.ISYERINDE_TESLIM,
  ])("%s → doğrudan teslim, tk21Type YOK (rejim dışı)", (pttResult) => {
    const svc = buildService();
    const tebligat = { addressType: TebligatAddressType.BILINEN };

    const result = callDeterminePttResultAction(svc, tebligat, { pttResult });

    expect(result.tk21Type).toBeUndefined();
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
  });

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
  });

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
  });
});
