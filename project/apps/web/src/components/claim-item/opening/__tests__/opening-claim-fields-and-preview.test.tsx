/**
 * Yeni dosya formu — açılış beyan alanları ve açılış önizleme kartı (owner talimatı 2026-11-18).
 *
 * Kanıtlanan:
 *  - Hiçbir alan ön seçili değildir; iki borçlu var diye borçlu / pay / tür seçili gelmez.
 *  - Gruplar kalem türüne göre görünür (vekâlet ücreti kaynağı yalnız vekâlet ücretinde; işlemiş faizde faiz grubu yok).
 *  - "Faiz işler" ve sorumluluk seçimi "onaya gider" diye sunulur; "Paylı sorumluluk" terimi kullanılır.
 *  - Önizleme kartı belirlenmemiş bilgiyi sıfır ya da kesin gibi göstermez; rakamlar sunucu yanıtından gelir.
 * Adlar ve tutarlar SENTETİKTİR.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { OpeningClaimDeclarationFields, type OpeningIlamInfo } from "../OpeningClaimDeclarationFields";
import { OpeningClaimPreviewCard } from "../OpeningClaimPreviewCard";
import { emptyOpeningClaimDeclaration, type OpeningClaimDeclaration, type OpeningClaimPreviewDTO } from "@/lib/case-opening-claims";

const DEBTORS = [
  { debtorId: "b1", name: "Sentetik Borçlu Bir" },
  { debtorId: "b2", name: "Sentetik Borçlu İki" },
];

afterEach(cleanup);

function Harness({
  kalemTuru,
  initial,
  interestIsNone = false,
  onState,
  unavailableReason = null,
  onCopy,
}: {
  kalemTuru: string;
  initial?: OpeningClaimDeclaration;
  interestIsNone?: boolean;
  onState?: (value: OpeningClaimDeclaration, ilam: OpeningIlamInfo) => void;
  unavailableReason?: string | null;
  onCopy?: () => void;
}) {
  const [value, setValue] = useState<OpeningClaimDeclaration>(initial ?? emptyOpeningClaimDeclaration());
  const [ilam, setIlam] = useState<OpeningIlamInfo>({});
  onState?.(value, ilam);
  return (
    <OpeningClaimDeclarationFields
      kalemTuru={kalemTuru}
      value={value}
      onChange={setValue}
      ilamBilgileri={ilam}
      onIlamChange={setIlam}
      debtors={DEBTORS}
      interestIsNone={interestIsNone}
      unavailableReason={unavailableReason}
      copySourceLabel={onCopy ? "Vekalet Ücreti" : null}
      onCopyFromLast={onCopy}
    />
  );
}

describe("OpeningClaimDeclarationFields", () => {
  it("vekâlet ücreti kalemi: dört grup görünür ve HİÇBİR şey ön seçili değildir", () => {
    render(<Harness kalemTuru="VEKALET_UCRETI" />);
    expect((screen.getByTestId("opening-attorney-fee-basis") as HTMLSelectElement).value).toBe("");
    expect((screen.getByTestId("opening-ilam-sourced") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId("opening-ilam-court")).toBeNull();
    expect((screen.getByTestId("opening-interest-status") as HTMLSelectElement).value).toBe("UNKNOWN");
    expect(screen.queryByTestId("opening-interest-provenance")).toBeNull();
    // Sorumluluk: "Belirlenmedi" durumunda; borçlu listesi ve dayanak hiç gösterilmez (iki borçlu olsa da).
    expect((screen.getByTestId("opening-liability-mode-NONE") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId("opening-liability-party-b1")).toBeNull();
    expect(screen.queryByTestId("opening-liability-basis")).toBeNull();
    expect(screen.getByText("Paylı sorumluluk")).toBeTruthy();
    expect(screen.getByTestId("opening-liability-note").textContent).toContain("borçlu sayısından sorumluluk türü çıkarmaz");
  });

  it("gruplar kalem türüne göre: masrafta vekâlet kaynağı yok; işlemiş faizde faiz grubu yok; faturada ilam grubu yok", () => {
    render(<Harness kalemTuru="MASRAF" />);
    expect(screen.queryByTestId("opening-attorney-fee-basis-group")).toBeNull();
    expect(screen.getByTestId("opening-ilam-group")).toBeTruthy();
    cleanup();
    render(<Harness kalemTuru="ISLEMIS_FAIZ" />);
    expect(screen.queryByTestId("opening-interest-group")).toBeNull();
    cleanup();
    render(<Harness kalemTuru="FATURA" />);
    expect(screen.queryByTestId("opening-ilam-group")).toBeNull();
    expect(screen.getByTestId("opening-interest-group")).toBeTruthy();
    expect(screen.getByTestId("opening-liability-group")).toBeTruthy();
  });

  it("faiz işler: dayanak ve başlangıç yalnız seçimden sonra; 'takip tarihi' dayanağında tarih girilmez; onaya gittiği yazılır", () => {
    let last: OpeningClaimDeclaration | null = null;
    render(<Harness kalemTuru="YARGILAMA_GIDERI" onState={(value) => (last = value)} />);
    fireEvent.change(screen.getByTestId("opening-interest-status"), { target: { value: "ACCRUES" } });
    // Dayanak ön seçili değildir.
    expect((screen.getByTestId("opening-interest-provenance") as HTMLSelectElement).value).toBe("");
    expect(screen.getByTestId("opening-interest-group").textContent).toContain("ikinci kişinin onayına gider");
    fireEvent.change(screen.getByTestId("opening-interest-provenance"), { target: { value: "JUDGMENT_FINALIZATION_DATE" } });
    fireEvent.change(screen.getByTestId("opening-interest-start"), { target: { value: "2025-04-02" } });
    expect(last).toMatchObject({ faizIsler: true, faizDayanak: "JUDGMENT_FINALIZATION_DATE", faizBaslangic: "2025-04-02" });
    fireEvent.change(screen.getByTestId("opening-interest-provenance"), { target: { value: "ENFORCEMENT_PROCEEDING_DATE" } });
    expect(screen.queryByTestId("opening-interest-start")).toBeNull();
    expect(screen.getByTestId("opening-interest-start-from-case")).toBeTruthy();
  });

  it("'faiz yok' seçili kalemde durum 'Faiz işlemez' olarak gösterilir; beyan alanı yoktur", () => {
    render(<Harness kalemTuru="MASRAF" interestIsNone />);
    expect(screen.getByTestId("opening-interest-none").textContent).toContain("Faiz işlemez");
    expect(screen.queryByTestId("opening-interest-status")).toBeNull();
  });

  it("paylı sorumluluk: borçlular ve pay biçimi ön seçimsiz; eşit pay + iki borçlu + dayanak kullanıcı eylemiyle", () => {
    let last: OpeningClaimDeclaration | null = null;
    render(<Harness kalemTuru="VEKALET_UCRETI" onState={(value) => (last = value)} />);
    fireEvent.click(screen.getByTestId("opening-liability-mode-PROPORTIONAL"));
    expect((screen.getByTestId("opening-liability-party-b1") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("opening-liability-party-b2") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("opening-liability-share-equal") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("opening-liability-basis") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByTestId("opening-liability-share-equal"));
    fireEvent.click(screen.getByTestId("opening-liability-party-b1"));
    fireEvent.click(screen.getByTestId("opening-liability-party-b2"));
    fireEvent.change(screen.getByTestId("opening-liability-basis"), { target: { value: "COURT_JUDGMENT" } });
    expect(last!.sorumluluk).toMatchObject({ mode: "PROPORTIONAL", shareKind: "EQUAL", basis: "COURT_JUDGMENT" });
    expect(last!.sorumluluk.parties.b1.selected && last!.sorumluluk.parties.b2.selected).toBe(true);
    expect(screen.getByTestId("opening-liability-note").textContent).toContain("ikinci kişinin onayına gider");
    // Oran girişi yalnız "oran gir" seçilince ve yalnız seçili borçluda.
    expect(screen.queryByTestId("opening-liability-percent-b1")).toBeNull();
    fireEvent.click(screen.getByTestId("opening-liability-share-percent"));
    expect(screen.getByTestId("opening-liability-percent-b1")).toBeTruthy();
  });

  it("tutarla sınırlı: kişi bazında tavan; 'tavan yok' işaretliyken kutu boş ve kapalı; kapsam notu görünür", () => {
    render(<Harness kalemTuru="MASRAF" />);
    fireEvent.click(screen.getByTestId("opening-liability-mode-CAPPED"));
    fireEvent.click(screen.getByTestId("opening-liability-party-b1"));
    const limit = screen.getByTestId("opening-liability-limit-b1") as HTMLInputElement;
    fireEvent.change(limit, { target: { value: "400" } });
    expect(limit.value).toBe("400");
    fireEvent.click(screen.getByTestId("opening-liability-unlimited-b1"));
    expect((screen.getByTestId("opening-liability-limit-b1") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("opening-liability-limit-b1") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("opening-liability-group").textContent).toContain("Tavan yalnız bu kalemin kayıtlı tutarını kapsar");
    // Seçilmeyen borçluda tavan kutusu yok.
    expect(screen.queryByTestId("opening-liability-limit-b2")).toBeNull();
  });

  it("ilam bilgisi: işaretlenince mahkeme / esas / karar / karar tarihi / kesinleşme alanları açılır", () => {
    let ilam: OpeningIlamInfo = {};
    render(<Harness kalemTuru="YARGILAMA_GIDERI" onState={(_value, info) => (ilam = info)} />);
    fireEvent.click(screen.getByTestId("opening-ilam-sourced"));
    fireEvent.change(screen.getByTestId("opening-ilam-court"), { target: { value: "Sentetik Mahkeme" } });
    fireEvent.change(screen.getByTestId("opening-ilam-esas"), { target: { value: "2024/1" } });
    fireEvent.change(screen.getByTestId("opening-ilam-finalization"), { target: { value: "2025-04-02" } });
    expect(ilam).toEqual({ mahkemeAdi: "Sentetik Mahkeme", esasNo: "2024/1", kesinlesmeTarihi: "2025-04-02" });
    expect(screen.getByTestId("opening-ilam-group").textContent).toContain("faiz başlangıcı bu alandan türetilmez");
  });

  it("beyan alınamayan kalemde (evrak kaydı) alanlar yerine neden gösterilir; kopyalama yalnız kullanıcı eylemiyle", () => {
    render(<Harness kalemTuru="CEK" unavailableReason="Çek kalemi evrak kaydı olarak açılır." />);
    expect(screen.getByTestId("opening-declaration-unavailable").textContent).toContain("evrak kaydı");
    expect(screen.queryByTestId("opening-liability-group")).toBeNull();
    cleanup();
    const onCopy = vi.fn();
    render(<Harness kalemTuru="YARGILAMA_GIDERI" onCopy={onCopy} />);
    expect(onCopy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("opening-copy-from-last"));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

const NOTES = { onay: "Onay notu.", kullaniciTercihi: "Kullanıcı tercihi notu.", toplam: "Toplam notu.", tavanKapsami: "Tavan notu.", onaySirasi: "Sıra notu." };

const preview = (patch: Partial<OpeningClaimPreviewDTO> = {}): OpeningClaimPreviewDTO => ({
  paraBirimi: "TRY",
  kalemler: [
    {
      dueIndex: 0,
      kalemTuru: "ATTORNEY_FEE",
      aciklama: "Vekalet Ücreti",
      tutar: 5000.01,
      vekaletUcretiKaynagi: "JUDGMENT_AWARDED",
      faiz: { acilisDurumu: "UNKNOWN", onayBekleyecekBeyan: { durum: "ACCRUES", faizTuruKodu: "LEGAL_3095", baslangic: "2025-04-02", dayanak: "JUDGMENT_FINALIZATION_DATE" } },
      sorumluluk: {
        acilisTuru: "BELIRLENMEDI",
        onayBekleyecekSecim: {
          tur: "PAYLI",
          dayanak: "COURT_JUDGMENT",
          tavanKapsami: null,
          borclular: [
            { debtorId: "b1", pay: 2500.01, payAgirligi: 1, tavan: null, sinirsiz: false, sorumlulukSiniri: 2500.01 },
            { debtorId: "b2", pay: 2500, payAgirligi: 1, tavan: null, sinirsiz: false, sorumlulukSiniri: 2500 },
          ],
        },
      },
    },
    {
      dueIndex: 1,
      kalemTuru: "YARGILAMA_GIDERI",
      aciklama: "Yargılama Gideri",
      tutar: 365,
      vekaletUcretiKaynagi: null,
      faiz: { acilisDurumu: "UNKNOWN", onayBekleyecekBeyan: null },
      sorumluluk: { acilisTuru: "BELIRLENMEDI", onayBekleyecekSecim: null },
    },
  ],
  kalemTutarlariToplami: 5365.01,
  borcluDagilimi: [
    { debtorId: "b1", kalemler: [{ dueIndex: 0, durum: "PAYLI", sorumlulukSiniri: 2500.01 }, { dueIndex: 1, durum: "BELIRLENMEDI", sorumlulukSiniri: null }], belirlenmeyenKalemSayisi: 1, sorumlulukUstSiniri: null },
    { debtorId: "b2", kalemler: [{ dueIndex: 0, durum: "PAYLI", sorumlulukSiniri: 2500 }, { dueIndex: 1, durum: "BELIRLENMEDI", sorumlulukSiniri: null }], belirlenmeyenKalemSayisi: 1, sorumlulukUstSiniri: null },
  ],
  onayaGidecekFaizBeyaniSayisi: 1,
  onayaGidecekSorumlulukSecimiSayisi: 1,
  hatalar: [],
  uygulanabilir: true,
  onizlemeOzeti: "ozet",
  secimYazmaAcik: true,
  aciklamalar: NOTES,
  ...patch,
});

const card = (props: Partial<Parameters<typeof OpeningClaimPreviewCard>[0]> = {}) =>
  render(
    <OpeningClaimPreviewCard
      preview={preview()}
      loading={false}
      error={null}
      stale={false}
      debtorNames={{ b1: "Sentetik Borçlu Bir", b2: "Sentetik Borçlu İki" }}
      hasDeclarations
      onRefresh={() => undefined}
      {...props}
    />,
  );

describe("OpeningClaimPreviewCard", () => {
  it("dosya toplamı tek rakam; onaya gidecek beyan 'açılışta' değerinden AYRI; belirlenmeyen kalem yüzünden borçlu toplamı 'belirlenemedi'", () => {
    card();
    expect(screen.getByTestId("opening-preview-total").textContent).toBe("5.365,01 TRY");
    const rows = screen.getAllByTestId("opening-preview-item");
    expect(rows[0].textContent).toContain("Kaynak: İlam vekâlet ücreti");
    expect(rows[0].textContent).toContain("Açılışta: Belirlenmedi");
    expect(within(rows[0]).getByTestId("opening-preview-pending-interest").textContent).toContain("Onay bekleyecek: Faiz işler — başlangıç 02.04.2025 — dayanak: Kesinleşme tarihi");
    const pendingLiability = within(rows[0]).getByTestId("opening-preview-pending-liability").textContent!;
    expect(pendingLiability).toContain("Onay bekleyecek: Paylı sorumluluk — dayanak: İlam / mahkeme kararı");
    expect(pendingLiability).toContain("Sentetik Borçlu Bir: pay 2.500,01 TRY");
    expect(pendingLiability).toContain("Sentetik Borçlu İki: pay 2.500,00 TRY");
    // İkinci kalemde beyan yok: onay bekleyen satır yok, sıfır da yazmıyor.
    expect(within(rows[1]).queryByTestId("opening-preview-pending-liability")).toBeNull();
    expect(within(rows[1]).queryByTestId("opening-preview-pending-interest")).toBeNull();
    const totals = screen.getAllByTestId("opening-preview-debtor-total").map((node) => node.textContent);
    expect(totals).toEqual([
      "Borçlu toplamı belirlenemedi (1 kalemin sorumluluğu belirlenmedi).",
      "Borçlu toplamı belirlenemedi (1 kalemin sorumluluğu belirlenmedi).",
    ]);
    expect(screen.getByTestId("opening-preview-approval-note").textContent).toBe("Onay notu. Sıra notu.");
  });

  it("bütün kalemler belirliyse borçlu üst sınırı sunucudan gösterilir (toplanarak dosya borcu yazılmaz)", () => {
    card({
      preview: preview({
        borcluDagilimi: [{ debtorId: "b1", kalemler: [{ dueIndex: 0, durum: "PAYLI", sorumlulukSiniri: 2500.01 }], belirlenmeyenKalemSayisi: 0, sorumlulukUstSiniri: 2500.01 }],
      }),
    });
    expect(screen.getByTestId("opening-preview-debtor-total").textContent).toBe("Seçimler onaylanırsa kalem tutarları üzerinden en çok: 2.500,01 TRY");
    expect(screen.getByTestId("opening-preview-total").textContent).toBe("5.365,01 TRY");
  });

  it("girdi hataları kalemin altında; kapalı seçim bayrağı ve evrak kalemi notu görünür", () => {
    card({
      preview: preview({
        uygulanabilir: false,
        secimYazmaAcik: false,
        hatalar: [
          { kod: "BASIS_REQUIRED", alan: "SORUMLULUK", dueIndex: 1, debtorId: null, mesaj: "Sorumluluk seçimi için dayanak seçilmelidir." },
          { kod: "DUE_INDEX_INVALID", alan: "FAIZ", dueIndex: null, debtorId: null, mesaj: "Faiz beyanı geçerli bir alacak kalemine bağlı değil." },
        ],
      }),
      excludedInstrumentCount: 2,
    });
    const errors = screen.getAllByTestId("opening-preview-input-error").map((node) => node.textContent);
    expect(errors).toEqual(["Faiz beyanı geçerli bir alacak kalemine bağlı değil.", "Sorumluluk seçimi için dayanak seçilmelidir."]);
    expect(within(screen.getAllByTestId("opening-preview-item")[1]).getByTestId("opening-preview-input-error")).toBeTruthy();
    expect(screen.getByTestId("opening-preview-selection-disabled")).toBeTruthy();
    expect(screen.getByTestId("opening-preview-instrument-note").textContent).toContain("2 çek / senet kalemi");
  });

  it("önizleme alınamadıysa neden ve beyan varken dosyanın oluşturulmayacağı yazılır; yenile düğmesi çalışır", () => {
    const onRefresh = vi.fn();
    card({ preview: null, error: "sunucuya ulaşılamadı.", onRefresh });
    expect(screen.getByTestId("opening-preview-error").textContent).toContain("önizleme olmadan dosya oluşturulmaz");
    fireEvent.click(screen.getByTestId("opening-preview-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
