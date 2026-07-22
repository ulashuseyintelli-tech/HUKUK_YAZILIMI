import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalPoasPage from "@/app/portal/poas/page";

/**
 * CLIENT-P2-U03-I04 — portal PoA sayfasının, backend'in artık explicit-select ile döndüğü
 * daraltılmış response şekline uyumunu doğrular. Production page.tsx DEĞİŞTİRİLMEDİ — sayfa
 * zaten yalnız approved alanları tüketiyordu (consumer FOUND, ama bounded adaptation
 * gerekmedi). Bu spec yalnız yeni bounded contract'la mevcut davranışın DEĞİŞMEDİĞİNİ kanıtlar.
 */
const BASE_POA = {
  id: "poa-1",
  notaryName: "İstanbul 5. Noterliği",
  notaryCity: "İstanbul",
  journalNo: "2026/123",
  poaNumber: "VEK-001",
  dateIssued: "2026-01-01T00:00:00.000Z",
  isLimited: false,
  validUntil: null,
  status: "ACTIVE",
  canCollect: true,
  canWaive: false,
  canSettle: true,
  canRelease: false,
  lawyers: [{ lawyer: { name: "Ahmet", surname: "Yılmaz", barNumber: "12345" } }],
};

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("Portal PoA page — CLIENT-P2-U03-I04 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı alanlar render edilir (notaryName, notaryCity, journalNo, dateIssued)", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.getByText(/İstanbul 5\. Noterliği/)).toBeTruthy();
    expect(screen.getByText(/İstanbul/)).toBeTruthy();
    expect(screen.getByText(/1\.01\.2026|01\.01\.2026/)).toBeTruthy();
  });

  it("[2] avukat name/surname render edilir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
  });

  it("[3] barNumber veride olsa bile hiçbir yerde görsel olarak render edilmez (mevcut UI kullanmıyor)", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
    expect(screen.queryByText(/12345/)).toBeNull();
  });

  it("[4] filePath fixture'a sızdırılsa bile hiç render edilmez (legacy/beklenmedik alan)", async () => {
    const poisoned = { ...BASE_POA, filePath: "/data/poa/leaked.pdf" };
    stubFetch({ ok: true, json: async () => [poisoned] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.queryByText(/leaked\.pdf/)).toBeNull();
  });

  it("[5] internal join ID'leri (lawyers[].id/lawyerId) fixture'da olsa bile render edilmez", async () => {
    const poisoned = {
      ...BASE_POA,
      lawyers: [{ id: "join-1", lawyerId: "lawyer-1", lawyer: { name: "Ahmet", surname: "Yılmaz", barNumber: "12345" } }],
    };
    stubFetch({ ok: true, json: async () => [poisoned] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
    expect(screen.queryByText(/join-1/)).toBeNull();
    expect(screen.queryByText(/lawyer-1/)).toBeNull();
  });

  it("[6] sayfa dosya metadata'sına (fileSize/mimeType) bağımlı değildir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
  });

  it("[7] EXPIRED durumu badge'i render edilir", async () => {
    stubFetch({ ok: true, json: async () => [{ ...BASE_POA, status: "EXPIRED" }] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Süresi Dolmuş")).toBeTruthy());
  });

  it("[8] REVOKED durumu badge'i render edilir", async () => {
    stubFetch({ ok: true, json: async () => [{ ...BASE_POA, status: "REVOKED" }] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("İptal Edilmiş")).toBeTruthy());
  });

  it("[9] süresiz (isLimited=false) vekalet 'Süresiz' badge'i gösterir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Süresiz")).toBeTruthy());
  });

  it("[10] süreli (isLimited=true) + uzak validUntil tarih-bazlı badge gösterir", async () => {
    const limited = { ...BASE_POA, isLimited: true, validUntil: "2035-01-01T00:00:00.000Z" };
    stubFetch({ ok: true, json: async () => [limited] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/2035/)).toBeTruthy());
  });

  it("[11] yetki rozetleri (canCollect/canSettle true, canWaive/canRelease false) doğru render edilir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Ahzu Kabza")).toBeTruthy());
    expect(screen.getByText("Sulh")).toBeTruthy();
    expect(screen.queryByText("Feragat")).toBeNull();
    expect(screen.queryByText("İbra")).toBeNull();
  });

  it("[12] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<PortalPoasPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[13] mevcut boş-liste davranışı korunur", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Henüz vekalet kaydı bulunmuyor")).toBeTruthy());
  });

  it("[14] mevcut hata davranışı korunur (fetch reddi çökmeye neden olmaz, boş-liste durumuna düşer)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Henüz vekalet kaydı bulunmuyor")).toBeTruthy());
  });
});
