"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  LayoutDashboard,
  Users,
  CheckSquare,
  Bell,
  Settings,
  Building2,
  Gavel,
  CreditCard,
  PlusCircle,
  FolderOpen,
  Sparkles,
  Wand2,
  Globe,
  BarChart3,
  Calendar,
  Shield,
  AlertTriangle,
  FileCode,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/lib/user-settings";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  disabled: boolean;
  // adminOnly: yalnız backend'de AdminGuard'lı sayfalar (şu an sadece Hata Logları)
  // non-admin/null user'dan gizlenir. Backend güvenliği ayrı (AdminGuard + 403 page state).
  adminOnly?: boolean;
};

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, disabled: false },
  { name: "Yeni Takip Oluştur", href: "/cases/new", icon: PlusCircle, disabled: false },
  { name: "Eski Takipler", href: "/cases", icon: FolderOpen, disabled: false },
  { name: "UYAP Export", href: "/uyap-export", icon: FileCode, disabled: false },
  { name: "Raporlar", href: "/reports", icon: BarChart3, disabled: false },
  { name: "Takvim", href: "/calendar", icon: Calendar, disabled: false },
  { name: "AI Tools", href: "/ai-tools", icon: Sparkles, disabled: false },
  { name: "Borçlular", href: "/debtors", icon: Users, disabled: false },
  { name: "Müvekkiller", href: "/clients", icon: Building2, disabled: false },
  { name: "Görevler", href: "/tasks", icon: CheckSquare, disabled: false },
  { name: "Bilgi Formları", href: "/client-intake", icon: Inbox, disabled: false },
  { name: "Bildirimler", href: "/notifications", icon: Bell, disabled: true }, // Sayfa yok
  { name: "Mahkemeler", href: "/courts", icon: Gavel, disabled: true }, // Sayfa yok
  { name: "Tahsilatlar", href: "/collections", icon: CreditCard, disabled: true }, // Sayfa yok
  { name: "İcra Daireleri", href: "/admin/execution-offices", icon: Building2, disabled: false },
  { name: "Müvekkiller (Ayarlar)", href: "/settings/clients", icon: Users, disabled: false },
  { name: "Portal Yönetimi", href: "/settings/portal", icon: Globe, disabled: false },
  { name: "Audit Log", href: "/settings/audit", icon: Shield, disabled: false },
  { name: "Hata Logları", href: "/settings/error-logs", icon: AlertTriangle, disabled: false, adminOnly: true },
  { name: "Bildirim Merkezi", href: "/settings/notifications", icon: Bell, disabled: false },
  { name: "Büro Ayarları", href: "/settings/office", icon: Settings, disabled: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, updateSettings, loaded } = useUserSettings();
  const { user } = useAuth();

  // adminOnly menüler (Hata Logları) yalnız ADMIN'e görünür. Backend admin.guard.ts ile birebir
  // (role === "ADMIN"); başka admin-eşdeğer rol YOK. non-admin/null user → gizle (güvenli varsayılan).
  const isAdmin = user?.role === "ADMIN";
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isAdmin);

  const handleWizardToggle = () => {
    updateSettings({ showWizardOnNewCase: !settings.showWizardOnNewCase });
  };

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (href === "/cases/new") {
      e.preventDefault();
      // Her zaman yeni başlangıç için ?new=true parametresi ekle
      window.location.href = "/cases/new?new=true";
    }
  };

  // Aktif menü = mevcut yolu eşleyen EN UZUN (en spesifik) href. Böylece /cases/new yolundayken
  // genel "/cases" (Eski Takipler) DEĞİL, yalnız "/cases/new" (Yeni Takip) yanar.
  // href'teki query string (?new=true) ayıklanır; usePathname() zaten query'siz döner.
  const matchLength = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || pathname.startsWith(path + "/") ? path.length : -1;
  };
  const bestMatchLength = Math.max(...visibleNavigation.map((n) => matchLength(n.href)));

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden sm:flex w-56 md:w-60 lg:w-64 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4 lg:px-6">
        <Scale className="h-6 w-6 text-primary flex-shrink-0" />
        <span className="font-bold text-sm lg:text-base truncate">Hukuk Platform</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 lg:p-4 overflow-y-auto">
        {visibleNavigation.map((item) => {
          const len = matchLength(item.href);
          const isActive = len > 0 && len === bestMatchLength;

          if (item.disabled) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-2 lg:gap-3 rounded-lg px-2 lg:px-3 py-2 text-xs lg:text-sm font-medium text-gray-300 cursor-not-allowed"
                title="Bu sayfa henüz hazır değil"
              >
                <item.icon className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </div>
            );
          }
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={cn(
                "flex items-center gap-2 lg:gap-3 rounded-lg px-2 lg:px-3 py-2 text-xs lg:text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sihirbaz Toggle */}
      {loaded && (
        <div className="border-t p-2 lg:p-4">
          <div
            onClick={handleWizardToggle}
            className="flex items-center justify-between px-2 lg:px-3 py-2 rounded-lg hover:bg-muted cursor-pointer"
          >
            <div className="flex items-center gap-2 lg:gap-3">
              <Wand2
                className={cn(
                  "h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0",
                  settings.showWizardOnNewCase ? "text-purple-500" : "text-gray-400"
                )}
              />
              <span className="text-xs lg:text-sm font-medium text-muted-foreground">Sihirbaz</span>
            </div>
            <div
              className={cn(
                "w-8 lg:w-9 h-4 lg:h-5 rounded-full transition-colors flex-shrink-0",
                settings.showWizardOnNewCase ? "bg-purple-500" : "bg-gray-200"
              )}
            >
              <div
                className={cn(
                  "w-3 lg:w-4 h-3 lg:h-4 bg-white rounded-full shadow transform transition-transform mt-0.5",
                  settings.showWizardOnNewCase ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                )}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground px-2 lg:px-3 mt-1">
            {settings.showWizardOnNewCase ? "Yeni takipte açık" : "Yeni takipte kapalı"}
          </p>
        </div>
      )}
    </aside>
  );
}
