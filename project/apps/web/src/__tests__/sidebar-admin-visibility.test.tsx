import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// useAuth test başına kontrol edilebilir (mock-prefix → vi.mock hoisting'inde kullanılabilir).
const mockUseAuth = vi.fn();
vi.mock("@/lib/auth-context", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/lib/user-settings", () => ({
  useUserSettings: () => ({ settings: { showWizardOnNewCase: false }, updateSettings: vi.fn(), loaded: true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { Sidebar } from "@/components/layout/sidebar";

beforeEach(() => mockUseAuth.mockReset());

describe("Sidebar admin visibility — Hata Logları yalnız ADMIN", () => {
  it("ADMIN → Hata Logları görünür + Audit Log görünür", () => {
    mockUseAuth.mockReturnValue({ user: { role: "ADMIN" } });
    render(<Sidebar />);
    expect(screen.getByText("Hata Logları")).toBeInTheDocument();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
  });

  it("non-admin → Hata Logları GİZLİ; Audit Log + normal menüler görünür", () => {
    mockUseAuth.mockReturnValue({ user: { role: "MEMBER" } });
    render(<Sidebar />);
    expect(screen.queryByText("Hata Logları")).toBeNull();
    // Audit Log admin-only DEĞİL (backend JwtAuthGuard) → görünmeye devam eder
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
    // diğer normal menüler etkilenmez
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Büro Ayarları")).toBeInTheDocument();
    expect(screen.getByText("Bildirim Merkezi")).toBeInTheDocument();
  });

  it("user null (loading değil) → Hata Logları GİZLİ (güvenli varsayılan)", () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<Sidebar />);
    expect(screen.queryByText("Hata Logları")).toBeNull();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
  });
});
