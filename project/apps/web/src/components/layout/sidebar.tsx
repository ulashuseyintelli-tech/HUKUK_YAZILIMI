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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/lib/user-settings";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Yeni Takip Oluştur", href: "/cases/new", icon: PlusCircle },
  { name: "Eski Takipler", href: "/cases", icon: FolderOpen },
  { name: "AI Tools", href: "/ai-tools", icon: Sparkles },
  { name: "Borçlular", href: "/debtors", icon: Users },
  { name: "Müvekkiller", href: "/clients", icon: Building2 },
  { name: "Görevler", href: "/tasks", icon: CheckSquare },
  { name: "Bildirimler", href: "/notifications", icon: Bell },
  { name: "Mahkemeler", href: "/courts", icon: Gavel },
  { name: "Tahsilatlar", href: "/collections", icon: CreditCard },
  { name: "İcra Daireleri", href: "/admin/execution-offices", icon: Building2 },
  { name: "Müvekkiller", href: "/settings/clients", icon: Users },
  { name: "Büro Ayarları", href: "/settings/office", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, updateSettings, loaded } = useUserSettings();

  const handleWizardToggle = () => {
    updateSettings({ showWizardOnNewCase: !settings.showWizardOnNewCase });
  };

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (href === "/cases/new" && pathname === "/cases/new") {
      e.preventDefault();
      router.refresh();
      window.location.href = "/cases/new";
    }
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden sm:flex w-56 md:w-60 lg:w-64 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4 lg:px-6">
        <Scale className="h-6 w-6 text-primary flex-shrink-0" />
        <span className="font-bold text-sm lg:text-base truncate">Hukuk Platform</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 lg:p-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
