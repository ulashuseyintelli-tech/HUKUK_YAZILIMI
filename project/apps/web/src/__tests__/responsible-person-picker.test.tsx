// M2-G3b: Dosya Sorumlusu seçici (detail). api.get (aday + mevcut) mock'lanır, PATCH gövdesi doğrulanır.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResponsiblePersonPicker } from "@/components/case/responsible-person-picker";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));
const get = api.get as unknown as ReturnType<typeof vi.fn>;
const patch = api.patch as unknown as ReturnType<typeof vi.fn>;

const candidates = [
  { type: "LAWYER", id: "L1", displayName: "Av. Ulaş Hüseyin Telli", subtitle: "Ortak Avukat" },
  { type: "STAFF", id: "S1", displayName: "Büşra Atmaca", subtitle: "Sekreter" },
];

function mockGet(current: any) {
  get.mockImplementation((endpoint: string) => {
    if (endpoint === "/cases/responsible-candidates")
      return Promise.resolve({ data: { data: candidates } });
    if (endpoint.endsWith("/responsible-person"))
      return Promise.resolve({ data: current });
    return Promise.resolve({ data: null });
  });
}

const select = () => screen.getByRole("combobox") as HTMLSelectElement;
const ready = () => waitFor(() => expect(select().disabled).toBe(false));

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
  patch.mockResolvedValue({ data: {} });
});

describe("ResponsiblePersonPicker (M2-G3b)", () => {
  it("mevcut gerçek kişiyi gösterir + adayları (avukat/personel) listeler", async () => {
    mockGet({ type: "LAWYER", id: "L1", displayName: "Av. Ulaş Hüseyin Telli", subtitle: "Ortak Avukat", isLegacy: false });
    render(<ResponsiblePersonPicker caseId="c1" />);
    await ready();
    expect(screen.getAllByText(/Ulaş Hüseyin Telli/).length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: /Büşra Atmaca · Sekreter/ })).toBeTruthy();
    // gerçek kişi seçili → value = TYPE:id
    expect(select().value).toBe("LAWYER:L1");
  });

  it("legacy sorumlu → '(eski)' rozeti + placeholder seçili (gerçek kişi değil)", async () => {
    mockGet({ type: "LEGACY_USER", id: "U1", displayName: "Admin Kullanıcı", subtitle: "Eski sorumlu (kullanıcı hesabı)", isLegacy: true });
    render(<ResponsiblePersonPicker caseId="c1" />);
    await ready();
    expect(screen.getByText("(eski)")).toBeTruthy();
    expect(select().value).toBe("");
  });

  it("LAWYER seçilince responsibleLawyerId ile PATCH", async () => {
    mockGet(null);
    render(<ResponsiblePersonPicker caseId="c1" />);
    await ready();
    fireEvent.change(select(), { target: { value: "LAWYER:L1" } });
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/cases/c1/responsible-person", { responsibleLawyerId: "L1" })
    );
  });

  it("STAFF seçilince responsibleStaffId ile PATCH", async () => {
    mockGet(null);
    render(<ResponsiblePersonPicker caseId="c1" />);
    await ready();
    fireEvent.change(select(), { target: { value: "STAFF:S1" } });
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/cases/c1/responsible-person", { responsibleStaffId: "S1" })
    );
  });

  it("sorumlu yoksa 'Atanmamış' gösterir, PATCH çağrılmaz", async () => {
    mockGet(null);
    render(<ResponsiblePersonPicker caseId="c1" />);
    await ready();
    expect(screen.getByText("Atanmamış")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });
});
