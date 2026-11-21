import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { useParams } from "next/navigation";
import PortalCaseDetailPage from "@/app/portal/cases/[id]/page";

/**
 * F02 kabul UB-9 (21.11.2026) — müvekkil portalı dosya ayrıntısında kişi türü ve kalem adı.
 * Kusur: borçlu türü yalnız `PERSON` ile karşılaştırılıyordu; sunucunun gerçek kişi değeri `INDIVIDUAL` "Kurum"
 * görünüyordu. Kalem türü ham enum koduyla (`VEKALET_UCRETI`, `PRINCIPAL`) yazılıyordu.
 * Değerler sentetik.
 */
vi.mock("next/navigation", () => ({ useParams: vi.fn() }));

const debtor = (name: string, type: string) => ({ role: "ASIL_BORCLU", debtor: { name, type } });

const CASE = {
  id: "case-1",
  fileNumber: "2026/1",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  caseDate: "2026-10-01T00:00:00.000Z",
  debtors: [
    debtor("Sentetik Borçlu Bir", "INDIVIDUAL"),
    debtor("Sentetik Şirket", "COMPANY"),
    debtor("Sentetik Kurum", "PUBLIC_INSTITUTION"),
    debtor("Sentetik Tereke", "ESTATE"),
  ],
  dues: [
    { id: "d-1", type: "VEKALET_UCRETI", amount: "2400", currency: "TRY", interestType: "YASAL", interestStartDate: "2026-08-01T00:00:00.000Z" },
    { id: "d-2", type: "PRINCIPAL", amount: "1000", currency: "TRY", interestType: "YASAL" },
    { id: "d-3", type: "YARGILAMA_GIDERI", amount: "480", currency: "TRY" },
  ],
};

function mockFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })),
  );
}

beforeEach(() => {
  vi.mocked(useParams).mockReturnValue({ id: "case-1" } as any);
  localStorage.setItem("portal_token", "portal-oturumu-sentetik");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("UB-9 — portal dosya ayrıntısı kişi türü ve kalem adı", () => {
  it("gerçek kişi borçlu (INDIVIDUAL) 'Şahıs'; kurum / kamu / tereke kendi adıyla", async () => {
    mockFetch(CASE);
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Sentetik Borçlu Bir")).toBeTruthy());
    const tur = (ad: string) => screen.getByText(ad).parentElement!.textContent ?? "";
    expect(tur("Sentetik Borçlu Bir")).toContain("Şahıs");
    expect(tur("Sentetik Borçlu Bir")).not.toContain("Kurum");
    expect(tur("Sentetik Şirket")).toContain("Kurum");
    expect(tur("Sentetik Kurum")).toContain("Kamu Kurumu");
    expect(tur("Sentetik Tereke")).toContain("Tereke");
  });

  it("kalem türü kullanıcı adıyla yazılır; ham enum kodu görünmez", async () => {
    mockFetch(CASE);
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Vekalet Ücreti")).toBeTruthy());
    expect(screen.getByText("Ana Para (Asıl Alacak)")).toBeTruthy();
    expect(screen.getByText("Yargılama Gideri")).toBeTruthy();
    for (const kod of ["VEKALET_UCRETI", "PRINCIPAL", "YARGILAMA_GIDERI"]) expect(screen.queryByText(kod)).toBeNull();
  });
});
