import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntakeFormPage from "@/app/intake/[token]/page";
import * as intakeApi from "@/lib/intake-api";

vi.mock("@/lib/intake-api", () => ({
  getIntakeForm: vi.fn(),
  submitIntake: vi.fn(),
}));

const getIntakeForm = intakeApi.getIntakeForm as unknown as ReturnType<typeof vi.fn>;
const submitIntake = intakeApi.submitIntake as unknown as ReturnType<typeof vi.fn>;

describe("IntakeFormPage (public form)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scope'a göre alanları render eder (PII yok, yalnız kategoriler)", async () => {
    getIntakeForm.mockResolvedValue({ title: "Bilgi Formu", scope: ["INCOME_SOURCE", "ADDRESS"] });
    render(<IntakeFormPage params={{ token: "t1" }} />);
    await waitFor(() => expect(screen.getByText("Gelir Kaynağı")).toBeTruthy());
    expect(screen.getByText("Adres")).toBeTruthy();
    expect(screen.getByText("Bilgi Formu")).toBeTruthy();
  });

  it("dolu alanla submit → submitIntake çağrılır → teşekkür ekranı", async () => {
    getIntakeForm.mockResolvedValue({ title: "Bilgi Formu", scope: ["INCOME_SOURCE"] });
    submitIntake.mockResolvedValue({ ok: true });
    render(<IntakeFormPage params={{ token: "t2" }} />);
    await waitFor(() => screen.getByText("Gelir Kaynağı"));

    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "Müteahhit" } });
    fireEvent.click(screen.getByRole("button", { name: /Gönder/i }));

    await waitFor(() => expect(submitIntake).toHaveBeenCalled());
    const [token, fields] = submitIntake.mock.calls[0];
    expect(token).toBe("t2");
    expect(fields).toEqual([{ category: "INCOME_SOURCE", value: "Müteahhit" }]);
    await waitFor(() => expect(screen.getByText("Teşekkürler")).toBeTruthy());
  });

  it("boş submit → validasyon, submitIntake çağrılmaz", async () => {
    getIntakeForm.mockResolvedValue({ title: "Bilgi Formu", scope: ["INCOME_SOURCE"] });
    render(<IntakeFormPage params={{ token: "t3" }} />);
    await waitFor(() => screen.getByText("Gelir Kaynağı"));
    fireEvent.click(screen.getByRole("button", { name: /Gönder/i }));
    await waitFor(() => expect(screen.getByText(/en az bir alan/i)).toBeTruthy());
    expect(submitIntake).not.toHaveBeenCalled();
  });

  it("geçersiz token → generic geçersiz mesajı", async () => {
    getIntakeForm.mockRejectedValue(new Error("Bağlantı geçersiz veya süresi dolmuş."));
    render(<IntakeFormPage params={{ token: "bad" }} />);
    await waitFor(() => expect(screen.getByText(/Bağlantı geçersiz/i)).toBeTruthy());
  });
});
