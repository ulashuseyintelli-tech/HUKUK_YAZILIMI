import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PortalFinancialDisclosuresPage from "@/app/portal/financial-disclosures/page";

/**
 * CLIENT-P2-U03-TRACK-B-I06 — Portal finansal bildirim sunumu.
 *
 * Canonical sözleşme: charter §35.7 / §35.14.
 *
 * Doğrulananlar:
 *  - §35.14 İKİ AYRI YÜZEY: güncel ve geçmiş AYRI uçlardan gelir, istemcide BİRLEŞTİRİLMEZ
 *  - sunum hiçbir finansal DEĞER TÜRETMEZ (toplam/oran/bakiye/fark HESAPLANMAZ)
 *  - projeksiyonda olmayan hiçbir alan render EDİLMEZ
 *  - yasak alanlar API yanlışlıkla gönderse bile ekrana ÇIKMAZ
 */
const fetchMock = vi.fn();

const CURRENT = {
  surface: "CURRENT",
  items: [
    {
      disclosureId: "d-cur-1",
      version: 2,
      currency: "TRY",
      totalCollected: "2500.75",
      clientNetAmount: "1750.50",
      lines: [
        { type: "CLIENT_PAYABLE", amount: "1750.50" },
        { type: "CONTRACTUAL_FEE_WITHHELD", amount: "750.25" },
      ],
      approvedAt: "2026-07-04T10:00:00.000Z",
      notifiedAt: "2026-07-05T10:00:00.000Z",
      publishedAt: "2026-07-05T10:00:00.000Z",
      isCurrentEffective: true,
      supersedesDisclosureId: "d-his-1",
      supersededByDisclosureId: null,
      isReversed: false,
      correctionReason: null,
      remittanceStatus: "PUBLISHED",
    },
  ],
};

const HISTORY = {
  surface: "HISTORY",
  items: [
    {
      disclosureId: "d-his-1",
      version: 1,
      currency: "TRY",
      totalCollected: "2400.00",
      clientNetAmount: "1600.00",
      lines: [{ type: "CLIENT_PAYABLE", amount: "1600.00" }],
      approvedAt: "2026-07-01T10:00:00.000Z",
      notifiedAt: "2026-07-02T10:00:00.000Z",
      publishedAt: "2026-07-02T10:00:00.000Z",
      isCurrentEffective: false,
      supersedesDisclosureId: null,
      supersededByDisclosureId: "d-cur-1",
      isReversed: false,
      correctionReason: "Hatali kesinti orani",
      remittanceStatus: "CORRECTED",
    },
  ],
};

function mockSurfaces(current: unknown, history: unknown) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => (String(url).includes("/history") ? history : current),
    }),
  );
}

describe("PortalFinancialDisclosuresPage — CLIENT-P2-U03-TRACK-B-I06", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    localStorage.setItem("portal_token", "t-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("[1] güncel yüzey varsayılandır ve YALNIZ current-effective kaydı gösterir", async () => {
    mockSurfaces(CURRENT, HISTORY);
    render(<PortalFinancialDisclosuresPage />);

    await waitFor(() => expect(screen.getByTestId("surface-current")).toBeTruthy());
    expect(screen.getByText("Tahsilat Bildirimi — v2")).toBeTruthy();
    // Gecmis kaydi varsayilan yuzeyde GORUNMEZ (§35.14 tek birlesik liste DEGIL).
    expect(screen.queryByText("Tahsilat Bildirimi — v1")).toBeNull();
    expect(screen.queryByTestId("surface-history")).toBeNull();
  });

  it("[2] geçmiş sekmesi AYRI yüzeydir ve güncel kaydı taşımaz", async () => {
    mockSurfaces(CURRENT, HISTORY);
    render(<PortalFinancialDisclosuresPage />);
    await waitFor(() => expect(screen.getByTestId("surface-current")).toBeTruthy());

    fireEvent.click(screen.getByTestId("tab-history"));
    await waitFor(() => expect(screen.getByTestId("surface-history")).toBeTruthy());
    expect(screen.getByText("Tahsilat Bildirimi — v1")).toBeTruthy();
    expect(screen.queryByText("Tahsilat Bildirimi — v2")).toBeNull();
    expect(screen.queryByTestId("surface-current")).toBeNull();
    expect(screen.getByText(/Hatali kesinti orani/)).toBeTruthy();
  });

  it("[3] iki yüzey AYRI uçlardan çekilir — istemci tarafında birleştirme YOK", async () => {
    mockSurfaces(CURRENT, HISTORY);
    render(<PortalFinancialDisclosuresPage />);
    await waitFor(() => expect(screen.getByTestId("surface-current")).toBeTruthy());

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/api/portal/financial-disclosures"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/portal/financial-disclosures/history"))).toBe(true);
    expect(urls).toHaveLength(2);
  });

  it("[4] sunum hiçbir finansal DEĞER TÜRETMEZ (toplam/oran/fark hesaplanmaz)", async () => {
    mockSurfaces(CURRENT, HISTORY);
    const { container } = render(<PortalFinancialDisclosuresPage />);
    await waitFor(() => expect(screen.getByTestId("surface-current")).toBeTruthy());

    const text = container.textContent ?? "";
    // Yalniz projeksiyonun verdigi string'ler gorunur.
    expect(text).toContain("2500.75");
    expect(text).toContain("1750.50");
    expect(text).toContain("750.25");
    // Turetilmis hicbir deger YOK: 1750.50+750.25 farki, oran, kalan vb.
    for (const derived of ["2500.76", "70", "%", "1000.00", "4251.25", "4901.25"]) {
      expect(text).not.toContain(derived);
    }
  });

  it("[5] projeksiyonda olmayan/yasak alanlar API sızdırsa bile EKRANA ÇIKMAZ", async () => {
    const leaky = {
      surface: "CURRENT",
      items: [
        {
          ...CURRENT.items[0],
          // Sunucu sozlesmesini ihlal edip sizdirsa bile sayfa bunlari OKUMAZ.
          officeApprovedById: "user-SECRET",
          contentApprovedById: "user-SECRET-2",
          snapshotHash: "a".repeat(64),
          notificationContent: "GIZLI BILDIRIM METNI",
          approvedRecipientEmail: "gizli@example.test",
          providerMessageId: "PROVIDER-MSG-SECRET",
          sendFailureDetail: "mailbox unavailable",
          status: "SEND_PENDING",
        },
      ],
    };
    mockSurfaces(leaky, { surface: "HISTORY", items: [] });
    const { container } = render(<PortalFinancialDisclosuresPage />);
    await waitFor(() => expect(screen.getByTestId("surface-current")).toBeTruthy());

    const text = container.textContent ?? "";
    for (const secret of [
      "user-SECRET",
      "user-SECRET-2",
      "a".repeat(64),
      "GIZLI BILDIRIM METNI",
      "gizli@example.test",
      "PROVIDER-MSG-SECRET",
      "mailbox unavailable",
      "SEND_PENDING",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("[6] boş yüzeyler ayrı ayrı boş-durum gösterir", async () => {
    mockSurfaces({ surface: "CURRENT", items: [] }, { surface: "HISTORY", items: [] });
    render(<PortalFinancialDisclosuresPage />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeTruthy());
    expect(screen.getByText(/Henüz yayınlanmış bir finansal bildirim yok/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-history"));
    await waitFor(() =>
      expect(screen.getByText(/Düzeltme veya geri alma kaydı yok/)).toBeTruthy(),
    );
  });
});
