import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";

const pushMock = vi.fn();
// Stable referans: her render'da yeni router objesi + [.., router] dep'i gereksiz efekt
// tekrarına (potansiyel döngüye) yol açabilir — bkz. portal-layout-route-boundary.spec.tsx.
const routerMock = { push: pushMock };
let currentPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getToken: vi.fn().mockReturnValue(null), // staff token yok
    me: vi.fn(),
  },
}));

/**
 * CLIENT-P2-U01-R1 — AuthProvider'ın /portal/* namespace'i staff-auth redirect katmanından
 * MUAF tutması (portal-specific auth katmanına devir), diğer route'larda mevcut davranışın
 * KORUNMASI. "Bütün portal route'ları public" değil — yalnız redirect-layer'ı DEVREDER;
 * private portal koruması PortalLayout'un kendi ayrı portal_token guard'ıdır (bkz.
 * portal-layout-route-boundary.spec.tsx).
 */
describe("AuthProvider — /portal/* delegation (CLIENT-P2-U01-R1)", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it.each([
    ["/portal/login"],
    ["/portal/forgot-password"],
    ["/portal/reset-password"],
    ["/portal/cases"], // private portal route DAHİL — delegation namespace geneli, yalnız 3 recovery yolu değil
    ["/portal"],
  ])("[public recovery + private portal] staff token YOK, pathname=%s → /auth/login'e YÖNLENDİRMEZ", async (pathname) => {
    currentPathname = pathname;
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    );
    await waitFor(() => expect(pushMock).not.toHaveBeenCalledWith("/auth/login"));
  });

  it("[regresyon] staff route (/portal DIŞI), staff token YOK → HALA /auth/login'e yönlendirir", async () => {
    currentPathname = "/dashboard";
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/auth/login"));
  });

  it.each([["/"], ["/auth/login"], ["/auth/register"], ["/auth/account-recovery"]])(
    "[regresyon] mevcut PUBLIC_PATHS (%s) staff token olmadan HALA yönlendirmez",
    async (pathname) => {
      currentPathname = pathname;
      render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      );
      await waitFor(() => expect(pushMock).not.toHaveBeenCalledWith("/auth/login"));
    }
  );
});
