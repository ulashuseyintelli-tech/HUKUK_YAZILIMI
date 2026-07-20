import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalLayout from "@/app/portal/layout";

const pushMock = vi.fn();
// Stable referans ZORUNLU: PortalLayout'un token-check effect'i [pathname, router]'a bağımlı;
// her render'da YENİ bir router objesi dönerse (ör. () => ({push})) + setUser(JSON.parse(...))
// (valid-token yolu) birleşince sonsuz render döngüsü oluşur (identity her seferinde "değişti" sayılır).
const routerMock = { push: pushMock };
let currentPathname = "/portal/login";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
}));

/**
 * CLIENT-P2-U01 — PortalLayout'un kendi bağımsız portal_token guard'ı: yalnız 3 recovery
 * yolu (login/forgot-password/reset-password) portal_token OLMADAN erişilebilir; diğer TÜM
 * /portal/* route'ları hâlâ portal_token gerektirir (private portal route public OLMAZ).
 */
describe("PortalLayout — public recovery vs private portal boundary (CLIENT-P2-U01)", () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([["/portal/login"], ["/portal/forgot-password"], ["/portal/reset-password"]])(
    "[public recovery] %s: portal_token YOK → /portal/login'e YÖNLENDİRMEZ, children render edilir",
    async (pathname) => {
      currentPathname = pathname;
      render(
        <PortalLayout>
          <div data-testid="child">recovery-page-content</div>
        </PortalLayout>
      );
      await waitFor(() => expect(screen.getByTestId("child")).toBeTruthy());
      expect(pushMock).not.toHaveBeenCalled();
    }
  );

  it("[private portal] /portal (dashboard): portal_token YOK → /portal/login'e YÖNLENDİRİR", async () => {
    currentPathname = "/portal";
    render(
      <PortalLayout>
        <div data-testid="child">dashboard-content</div>
      </PortalLayout>
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
  });

  it("[private portal] /portal/cases: portal_token YOK → /portal/login'e YÖNLENDİRİR", async () => {
    currentPathname = "/portal/cases";
    render(
      <PortalLayout>
        <div data-testid="child">cases-content</div>
      </PortalLayout>
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
  });

  it("[private portal] /portal: GEÇERLİ portal_token VARSA → yönlendirmez, children erişilebilir", async () => {
    currentPathname = "/portal";
    localStorage.setItem("portal_token", "valid-token-abc");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));

    render(
      <PortalLayout>
        <div data-testid="child">dashboard-content</div>
      </PortalLayout>
    );

    await waitFor(() => expect(screen.getByTestId("child")).toBeTruthy());
    expect(pushMock).not.toHaveBeenCalledWith("/portal/login");
  });
});
