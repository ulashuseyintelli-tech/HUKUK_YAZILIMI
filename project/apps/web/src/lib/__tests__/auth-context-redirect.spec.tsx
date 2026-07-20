import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";

const pushMock = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getToken: () => "fake-token",
    me: () =>
      Promise.resolve({
        user: { id: "u1", email: "a@x.com", name: "A", surname: "X", role: "ADMIN", tenantId: "t1", tenant: { id: "t1", name: "Telli Hukuk", slug: "telli-hukuk" } },
      }),
    clearToken: vi.fn(),
  },
}));

/**
 * Girişli kullanıcı pazarlama/login sayfasında kalmamalı, otomatik panele düşmeli.
 */
describe("AuthProvider — girişliyken public sayfa yönlendirmesi", () => {
  beforeEach(() => pushMock.mockClear());

  it("[1] girişli kullanıcı '/' üzerindeyken /dashboard'a yönlendirilir", async () => {
    mockPathname = "/";
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("[2] girişli kullanıcı '/auth/login' üzerindeyken /dashboard'a yönlendirilir", async () => {
    mockPathname = "/auth/login";
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("[3] girişli kullanıcı zaten '/dashboard' üzerindeyken yönlendirme yapılmaz", async () => {
    mockPathname = "/dashboard";
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
