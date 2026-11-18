/**
 * Alacak Kalemleri paneli — faiz durumu ve faiz başlangıcının dayanağı (P02 ekran eksikleri, 18.11.2026).
 *
 * Kural: alanlar yüksek etkilidir; YALNIZ kullanıcı değiştirirse yüke girer ve onaya gider. "Belirlenmedi" kayıt kendiliğinden
 * değişmez. "Faiz işler" için dayanak ve (takip tarihi dayanağı dışında) başlangıç tarihi zorunludur; faiz türü kalemde kayıtlı
 * olmalıdır. "Faiz işlemez" için gerekçe zorunludur; kayıtlı başlangıç / dayanak açıkça boşaltılır. Tutarlar SENTETİK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClaimItemPanel, validateInterestEdit } from "../ClaimItemPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
const apiPut = api.put as unknown as ReturnType<typeof vi.fn>;

const toplam = (d: Record<string, number>) => ({
  principal: 0, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 0, fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 0, ...d,
});

const ITEMS = [
  {
    id: "vu", itemType: "ATTORNEY_FEE", amount: 1000, currency: "TRY", description: "Sentetik vekâlet ücreti", status: "ACTIVE",
    isCalculated: false, attorneyFeeBasis: null, interestAccrualStatus: "UNKNOWN", interestType: "YASAL", interestTypeCode: "LEGAL_3095",
    interestStartDate: "2025-06-16T00:00:00.000Z", interestStartDateProvenance: null,
  },
  {
    id: "yg-isler", itemType: "YARGILAMA_GIDERI", amount: 100, currency: "TRY", description: "Sentetik işleyen gider", status: "ACTIVE",
    isCalculated: false, interestAccrualStatus: "ACCRUES", interestType: "YASAL", interestTypeCode: "LEGAL_3095",
    interestStartDate: "2026-03-12T00:00:00.000Z", interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE",
    interestEndDate: "2026-05-01T00:00:00.000Z", interestRate: 18, dueDate: "2026-03-11T00:00:00.000Z",
  },
  {
    id: "tursuz", itemType: "OTHER", amount: 50, currency: "TRY", description: "Sentetik türsüz kalem", status: "ACTIVE",
    isCalculated: false, interestAccrualStatus: "UNKNOWN", interestType: null, interestTypeCode: null,
  },
  {
    id: "faizsiz", itemType: "EXPENSE", amount: 20, currency: "TRY", description: "Sentetik faizsiz masraf", status: "ACTIVE",
    isCalculated: false, interestAccrualStatus: "NO_INTEREST", interestType: null, interestTypeCode: null,
  },
];

function yanitla() {
  const totals = toplam({ attorneyFee: 1000, other: 150, grandTotal: 1150 });
  const summary = {
    caseId: "case-1", currency: "TRY", items: [], totals, calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: ITEMS.length, totals }],
    },
  };
  apiGet.mockImplementation((url: string) => Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: ITEMS } }));
}

async function duzenle(itemId: string) {
  render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
  await screen.findByText(`Alacak Kalemleri (${ITEMS.length})`);
  const satir = screen.getByText(ITEMS.find((i) => i.id === itemId)!.description).closest("div.p-4") as HTMLElement;
  fireEvent.click(satir.querySelector("button[title^='Metadata']") as HTMLElement);
  await screen.findByText("Kalem Metadata Düzenle");
}

const durumSec = (value: string) => fireEvent.change(screen.getByTestId("claim-item-interest-accrual-status-select"), { target: { value } });

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiPut.mockResolvedValue({ data: { data: { applied: false, approvalRequired: true } } });
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  yanitla();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClaimItemPanel — faiz durumu ve başlangıç dayanağı", () => {
  it("satır kayıtlı durumu yazar: belirlenmedi; işliyorsa başlangıç ve dayanak", async () => {
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText(`Alacak Kalemleri (${ITEMS.length})`);
    expect(screen.getByTestId("claim-item-interest-status-vu").textContent).toBe("Faiz: Belirlenmedi");
    expect(screen.getByTestId("claim-item-interest-status-yg-isler").textContent).toBe(
      "Faiz: Faiz işler · başlangıç 12.03.2026 · dayanak: Kesinleşme tarihi",
    );
  });

  it("'Belirlenmedi' kayıt kendiliğinden değişmez: yalnız açıklama değişirse faiz alanları yükte YOK, buton 'Kaydet'", async () => {
    apiPut.mockResolvedValue({ data: { data: { applied: true, approvalRequired: false } } });
    await duzenle("vu");
    expect((screen.getByTestId("claim-item-interest-accrual-status-select") as HTMLSelectElement).value).toBe("UNKNOWN");
    expect(screen.queryByTestId("claim-item-interest-start-provenance-select")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Açıklama..."), { target: { value: "Sentetik yeni açıklama" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    const yuk = apiPut.mock.calls[0][1];
    for (const alan of ["interestAccrualStatus", "interestStartDateProvenance", "interestStartDate", "noInterestReason"]) {
      expect(yuk).not.toHaveProperty(alan);
    }
  });

  it("belirlenmedi → faiz işler + kesinleşme + 12.03.2026 + ilam vekâlet ücreti: tek yük, 'Onaya Gönder'", async () => {
    await duzenle("vu");
    durumSec("ACCRUES");
    fireEvent.change(screen.getByTestId("claim-item-interest-start-provenance-select"), { target: { value: "JUDGMENT_FINALIZATION_DATE" } });
    fireEvent.change(screen.getByTestId("claim-item-interest-start-date"), { target: { value: "2026-03-12" } });
    fireEvent.change(screen.getByTestId("claim-item-attorney-fee-basis-select"), { target: { value: "JUDGMENT_AWARDED" } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut.mock.calls[0][0]).toBe("/claim-items/vu");
    expect(apiPut.mock.calls[0][1]).toMatchObject({
      interestAccrualStatus: "ACCRUES",
      interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE",
      interestStartDate: "2026-03-12",
      attorneyFeeBasis: "JUDGMENT_AWARDED",
    });
    expect(apiPut.mock.calls[0][1]).not.toHaveProperty("noInterestReason");
  });

  it("faiz işler: dayanak seçilmeden gönderilmez; hata yazılır", async () => {
    await duzenle("vu");
    durumSec("ACCRUES");
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    expect(await screen.findByText("'Faiz işler' için faiz başlangıcının dayanağı seçilmelidir.")).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("faiz işler: başlangıç tarihi boşsa gönderilmez; takip tarihi dayanağında tarih istenmez", () => {
    const base = {
      initialStatus: "UNKNOWN", status: "ACCRUES", initialProvenance: "", initialStartDate: "", startDate: "", hasInterestType: true,
    };
    expect(validateInterestEdit({ ...base, provenance: "JUDGMENT_DATE" })).toBe("'Faiz işler' için faiz başlangıç tarihi girilmelidir.");
    expect(validateInterestEdit({ ...base, provenance: "ENFORCEMENT_PROCEEDING_DATE" })).toBeNull();
    // Faiz alanlarına dokunulmadıysa denetim yok (kayıtlı durum aynen kalır).
    expect(validateInterestEdit({ ...base, status: "UNKNOWN", provenance: "" })).toBeNull();
    expect(validateInterestEdit({ ...base, status: "NO_INTEREST", provenance: "" })).toBe("Faiz işlememe gerekçesi zorunludur.");
  });

  it("faiz türü kayıtlı olmayan kalemde 'Faiz işler' gönderilmez (bu pencerede tür seçilmez)", async () => {
    await duzenle("tursuz");
    durumSec("ACCRUES");
    fireEvent.change(screen.getByTestId("claim-item-interest-start-provenance-select"), { target: { value: "JUDGMENT_DATE" } });
    fireEvent.change(screen.getByTestId("claim-item-interest-start-date"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    expect(await screen.findByText("Kalemde faiz türü kayıtlı değil; 'Faiz işler' bu pencereden seçilemez.")).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("Faiz işlemez seçilebilir; kayıtlı faizsiz kalemde mevcut seçim ve faiz alanları kilitli", async () => {
    await duzenle("yg-isler");
    const options = [...(screen.getByTestId("claim-item-interest-accrual-status-select") as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(["UNKNOWN", "ACCRUES", "NO_INTEREST"]);
    cleanup();

    await duzenle("faizsiz");
    const select = screen.getByTestId("claim-item-interest-accrual-status-select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("NO_INTEREST");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Faiz işlemez"]);
    expect((screen.getByTestId("claim-item-interest-start-date") as HTMLInputElement).disabled).toBe(true);
  });


  it("Faiz işlemez geçişi gerekçeli açık null değerlerini onaya yollar ve vadeyi yükten çıkarır", async () => {
    await duzenle("yg-isler");
    durumSec("NO_INTEREST");
    const reason = screen.getByRole("textbox", { name: "Faiz işlememe gerekçesi" });
    fireEvent.change(reason, { target: { value: "  Sentetik gerekçe  " } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    const [url, payload] = apiPut.mock.calls[0];
    expect(url).toBe("/claim-items/yg-isler");
    expect(payload).toMatchObject({
      interestAccrualStatus: "NO_INTEREST",
      noInterestReason: "Sentetik gerekçe",
      interestType: null,
      interestTypeCode: null,
      interestRate: null,
      interestStartDate: null,
      interestEndDate: null,
      interestStartDateProvenance: null,
    });
    expect(payload).not.toHaveProperty("dueDate");
    expect(payload).not.toHaveProperty("noInterestConfirmedById");
    expect(window.alert).toHaveBeenCalledWith("Yüksek etkili alacak kalemi değişikliği onaya gönderildi.");
  });

  it("Faiz işlemez geçişinde gerekçesiz talep veya birlikte vade değişikliği gönderilmez", async () => {
    await duzenle("yg-isler");
    durumSec("NO_INTEREST");
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    expect(await screen.findByText("Faiz işlememe gerekçesi zorunludur.")).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Faiz işlememe gerekçesi" }), { target: { value: "Sentetik gerekçe" } });
    fireEvent.change(screen.getByDisplayValue("2026-03-11"), { target: { value: "2026-04-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    expect(await screen.findByText("Vade değişikliğini ayrı onaya gönderin.")).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("faiz işler → belirlenmedi: yalnız durum gönderilir (kayıtlı başlangıç / dayanak boşaltılmaz)", async () => {
    await duzenle("yg-isler");
    durumSec("UNKNOWN");
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    const yuk = apiPut.mock.calls[0][1];
    expect(yuk).toMatchObject({ interestAccrualStatus: "UNKNOWN" });
    expect(yuk).not.toHaveProperty("interestStartDateProvenance");
    expect(yuk).not.toHaveProperty("interestStartDate");
  });

  it("yalnız dayanak değişirse (durum aynı) yalnız dayanak gönderilir", async () => {
    await duzenle("yg-isler");
    fireEvent.change(screen.getByTestId("claim-item-interest-start-provenance-select"), { target: { value: "JUDGMENT_DATE" } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    const yuk = apiPut.mock.calls[0][1];
    expect(yuk).toMatchObject({ interestStartDateProvenance: "JUDGMENT_DATE" });
    expect(yuk).not.toHaveProperty("interestAccrualStatus");
    expect(yuk).not.toHaveProperty("interestStartDate");
  });
});
