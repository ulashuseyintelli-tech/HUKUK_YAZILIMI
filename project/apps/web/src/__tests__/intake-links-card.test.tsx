import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntakeLinksCard from "@/components/case/IntakeLinksCard";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    listIntakeLinks: vi.fn(),
    createIntakeLink: vi.fn(),
    revokeIntakeLink: vi.fn(),
  },
}));

const listIntakeLinks = api.listIntakeLinks as unknown as ReturnType<typeof vi.fn>;
const createIntakeLink = api.createIntakeLink as unknown as ReturnType<typeof vi.fn>;
const revokeIntakeLink = api.revokeIntakeLink as unknown as ReturnType<typeof vi.fn>;

const clientProp = { id: "cl1", name: "Acme A.Ş.", isActive: true };

function link(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "l1",
    tenantId: "t",
    caseId: "c1",
    clientId: "cl1",
    status: "ACTIVE",
    scope: ["ADDRESS"],
    expiresAt: null,
    maxUses: 1,
    useCount: 0,
    createdById: "u",
    createdAt: "2026-06-17T10:00:00Z",
    ...over,
  };
}

describe("IntakeLinksCard (link üret / listele / iptal)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mount → linkleri listeler (Aktif rozet)", async () => {
    listIntakeLinks.mockResolvedValue([link()]);
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => expect(listIntakeLinks).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Aktif")).toBeTruthy();
  });

  it("güvenlik notu her zaman görünür", async () => {
    listIntakeLinks.mockResolvedValue([]);
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => expect(screen.getByText(/tekrar görüntülenemez/i)).toBeTruthy());
  });

  it("üret akışı → createIntakeLink çağrılır → URL tek sefer + Kopyala", async () => {
    listIntakeLinks.mockResolvedValue([]);
    createIntakeLink.mockResolvedValue({
      link: link({ id: "l9", scope: ["INCOME_SOURCE"] }),
      rawToken: "r",
      intakeUrl: "https://x/intake/r",
    });
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => screen.getByText(/tekrar görüntülenemez/i));

    fireEvent.click(screen.getByRole("button", { name: /Yeni bilgi formu/i }));
    fireEvent.click(screen.getByLabelText("Gelir Kaynağı"));
    fireEvent.click(screen.getByRole("button", { name: /Oluştur/i }));

    await waitFor(() => expect(createIntakeLink).toHaveBeenCalled());
    const [caseId, input] = createIntakeLink.mock.calls[0];
    expect(caseId).toBe("c1");
    expect(input.clientId).toBe("cl1");
    expect(input.scope).toEqual(["INCOME_SOURCE"]);
    await waitFor(() => expect(screen.getByText("https://x/intake/r")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Kopyala/i })).toBeTruthy();
  });

  it("boş kategori → validasyon, createIntakeLink çağrılmaz", async () => {
    listIntakeLinks.mockResolvedValue([]);
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => screen.getByText(/tekrar görüntülenemez/i));
    fireEvent.click(screen.getByRole("button", { name: /Yeni bilgi formu/i }));
    fireEvent.click(screen.getByRole("button", { name: /Oluştur/i }));
    await waitFor(() => expect(screen.getByText(/en az bir kategori/i)).toBeTruthy());
    expect(createIntakeLink).not.toHaveBeenCalled();
  });

  it("ACTIVE link iptal → revokeIntakeLink çağrılır", async () => {
    listIntakeLinks.mockResolvedValue([link()]);
    revokeIntakeLink.mockResolvedValue(link({ status: "REVOKED" }));
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => screen.getByText("Aktif"));
    fireEvent.click(screen.getByRole("button", { name: /^İptal$/i }));
    await waitFor(() => expect(revokeIntakeLink).toHaveBeenCalledWith("l1"));
  });

  // Bulgu A: revoke hatası sessiz kalmamalı + listeyi sahte güncellememeli
  it("revoke FAILURE → açık hata gösterir, listeyi sahte güncellemez", async () => {
    listIntakeLinks.mockResolvedValue([link()]); // ACTIVE
    revokeIntakeLink.mockRejectedValue(new Error("Sunucu reddetti"));
    render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => screen.getByText("Aktif"));
    const loadCallsBefore = listIntakeLinks.mock.calls.length; // mount yüklemesi
    fireEvent.click(screen.getByRole("button", { name: /^İptal$/i }));
    await waitFor(() => expect(revokeIntakeLink).toHaveBeenCalledWith("l1"));
    // Açık hata mesajı görünür (sessiz değil)
    await waitFor(() => expect(screen.getByText(/Sunucu reddetti/i)).toBeTruthy());
    // Liste SAHTE güncellenmedi: başarısızlıkta reload YOK + link hâlâ ACTIVE
    expect(listIntakeLinks.mock.calls.length).toBe(loadCallsBefore);
    expect(screen.getByText("Aktif")).toBeTruthy();
  });

  // Bulgu B: expiry, seçilen günün YEREL sonuna çevrilmeli (UTC gece-yarısı değil)
  it("expiry date → seçilen günün YEREL sonuna çevrilir", async () => {
    listIntakeLinks.mockResolvedValue([]);
    createIntakeLink.mockResolvedValue({ link: link(), rawToken: "r", intakeUrl: "u" });
    const { container } = render(<IntakeLinksCard caseId="c1" client={clientProp} />);
    await waitFor(() => screen.getByText(/tekrar görüntülenemez/i));
    fireEvent.click(screen.getByRole("button", { name: /Yeni bilgi formu/i }));
    fireEvent.click(screen.getByLabelText("Adres"));
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-06-20" } });
    fireEvent.click(screen.getByRole("button", { name: /Oluştur/i }));
    await waitFor(() => expect(createIntakeLink).toHaveBeenCalled());
    const [, input] = createIntakeLink.mock.calls[0];
    // Gönderilen ISO, geri parse edilince seçilen günün YEREL sonu olmalı
    // (CI saat dilimi ne olursa olsun yerel-yerel karşılaştırma sabit kalır).
    const sent = new Date(input.expiresAt);
    const expected = new Date(2026, 5, 20, 23, 59, 59, 999); // yerel gün sonu
    expect(sent.getTime()).toBe(expected.getTime());
    expect(sent.getDate()).toBe(20);
    expect(sent.getHours()).toBe(23);
  });
});
