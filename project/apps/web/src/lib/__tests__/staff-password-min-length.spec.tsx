/**
 * Personel parola asgari uzunluğu (owner kararı 12.11.2026: 6 karakter) — web formları.
 *
 * Üç ekran aynı tanımı (`@/lib/password-policy`) kullanır: self-service değiştirme (`/settings/security`), sıfırlama
 * (`/auth/reset-password`), davet kabulü (`/auth/accept-invite`). API tarafının aynı değeri taşıdığını API testi
 * `staff-password-min-length.http.spec.ts` bu dosyanın kaynağını okuyarak denetler.
 * Parola değerleri SENTETİKTİR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SecuritySettingsPage from "@/app/(dashboard)/settings/security/page";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import AcceptInvitePage from "@/app/auth/accept-invite/page";
import {
  STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE,
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH_MESSAGE,
} from "@/lib/password-policy";

const changeMyPasswordMock = vi.fn();
const resetPasswordMock = vi.fn();
const acceptInviteMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    changeMyPassword: (...args: unknown[]) => changeMyPasswordMock(...args),
    clearToken: () => undefined,
    resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
    acceptInvite: (...args: unknown[]) => acceptInviteMock(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const pw = (n: number) => "p".repeat(n);
const form = () => document.querySelector("form") as HTMLFormElement;
const setValue = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`input[name="${name}"]`)!, { target: { value } });

beforeEach(() => {
  changeMyPasswordMock.mockReset().mockResolvedValue({ ok: true });
  resetPasswordMock.mockReset().mockResolvedValue({ ok: true });
  acceptInviteMock.mockReset().mockResolvedValue({ ok: true, userId: "u1" });
  pushMock.mockReset();
});
afterEach(() => cleanup());

it("tek tanım 6 karakterdir", () => {
  expect(STAFF_PASSWORD_MIN_LENGTH).toBe(6);
  expect(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE).toBe("Yeni parola en az 6 karakter olmalıdır.");
  expect(STAFF_PASSWORD_MIN_LENGTH_MESSAGE).toBe("Parola en az 6 karakter olmalıdır.");
});

describe("/settings/security — Parolamı Değiştir", () => {
  async function submitWith(newPassword: string) {
    render(<SecuritySettingsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Parolayı Değiştir/i })).toBeEnabled());
    setValue("currentPassword", "mevcut-sentetik");
    setValue("newPassword", newPassword);
    setValue("confirmPassword", newPassword);
    fireEvent.submit(form());
  }

  it("etiket 6 karakter kuralını gösterir", () => {
    render(<SecuritySettingsPage />);
    expect(screen.getByText("Yeni Parola (en az 6 karakter)")).toBeInTheDocument();
  });

  it("5 karakter reddedilir; API çağrılmaz", async () => {
    await submitWith(pw(5));
    expect(await screen.findByText(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE)).toBeInTheDocument();
    expect(changeMyPasswordMock).not.toHaveBeenCalled();
  });

  it.each([6, 12, 20])("%i karakter kabul edilir; API'ye gider", async (n) => {
    await submitWith(pw(n));
    await waitFor(() => expect(changeMyPasswordMock).toHaveBeenCalledWith("mevcut-sentetik", pw(n), pw(n)));
    expect(screen.queryByText(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE)).toBeNull();
  });
});

describe("/auth/reset-password — Yeni Parola Belirle", () => {
  async function submitWith(password: string) {
    window.history.pushState(null, "", "/auth/reset-password#token=sentetik-belirtec");
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Parolayı Güncelle/i })).toBeEnabled());
    setValue("password", password);
    setValue("passwordConfirmation", password);
    fireEvent.submit(form());
  }

  it("iki alanın tarayıcı minLength'i 6'dır", async () => {
    window.history.pushState(null, "", "/auth/reset-password#token=sentetik-belirtec");
    render(<ResetPasswordPage />);
    for (const name of ["password", "passwordConfirmation"]) {
      expect(document.querySelector(`input[name="${name}"]`)).toHaveAttribute("minlength", "6");
    }
    expect(screen.getByText("Yeni Parola (en az 6 karakter)")).toBeInTheDocument();
  });

  it("5 karakter reddedilir; API çağrılmaz", async () => {
    await submitWith(pw(5));
    expect(await screen.findByText(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE)).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it.each([6, 12, 20])("%i karakter kabul edilir; API'ye gider", async (n) => {
    await submitWith(pw(n));
    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith("sentetik-belirtec", pw(n), pw(n)));
  });
});

describe("/auth/accept-invite — davet kabulü", () => {
  async function submitWith(password: string) {
    window.history.pushState(null, "", "/auth/accept-invite#token=sentetik-davet");
    render(<AcceptInvitePage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Parolayı belirle ve etkinleştir/i })).toBeEnabled(),
    );
    setValue("password", password);
    setValue("confirm", password);
    fireEvent.submit(form());
  }

  it("yer tutucu 6 karakter kuralını gösterir", async () => {
    window.history.pushState(null, "", "/auth/accept-invite#token=sentetik-davet");
    render(<AcceptInvitePage />);
    expect(await screen.findByPlaceholderText("Yeni parola (en az 6 karakter)")).toBeInTheDocument();
  });

  it("5 karakter reddedilir; API çağrılmaz", async () => {
    await submitWith(pw(5));
    expect(await screen.findByText(STAFF_PASSWORD_MIN_LENGTH_MESSAGE)).toBeInTheDocument();
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });

  it.each([6, 12, 20])("%i karakter kabul edilir; API'ye gider", async (n) => {
    await submitWith(pw(n));
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith("sentetik-davet", pw(n)));
  });
});
