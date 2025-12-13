"use client";

import { Bell, Search, Menu, User, LogOut, X, Scale, LayoutDashboard, PlusCircle, FolderOpen, Sparkles, Users, Building2, CheckSquare, Settings, FileText, Loader2, Sun, Moon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const mobileNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Yeni Takip", href: "/cases/new", icon: PlusCircle },
  { name: "Takipler", href: "/cases", icon: FolderOpen },
  { name: "AI Tools", href: "/ai-tools", icon: Sparkles },
  { name: "Borçlular", href: "/debtors", icon: Users },
  { name: "Müvekkiller", href: "/clients", icon: Building2 },
  { name: "Görevler", href: "/tasks", icon: CheckSquare },
  { name: "Ayarlar", href: "/settings", icon: Settings },
];

interface SearchResult {
  type: 'case' | 'client' | 'debtor';
  id: string;
  title: string;
  subtitle?: string;
}

export function Header() {
  const { user, logout } = useAuth();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [casesRes, clientsRes, debtorsRes] = await Promise.all([
          api.get(`/cases?search=${encodeURIComponent(searchQuery)}&limit=5`).catch(() => ({ data: [] })),
          api.get(`/clients?search=${encodeURIComponent(searchQuery)}&limit=5`).catch(() => ({ data: [] })),
          api.get(`/debtors?search=${encodeURIComponent(searchQuery)}&limit=5`).catch(() => ({ data: [] })),
        ]);

        const results: SearchResult[] = [];
        
        (casesRes.data || []).slice(0, 3).forEach((c: any) => {
          results.push({ type: 'case', id: c.id, title: c.fileNumber, subtitle: c.executionFileNumber || c.type });
        });
        
        (clientsRes.data || []).slice(0, 3).forEach((c: any) => {
          results.push({ type: 'client', id: c.id, title: c.displayName || c.name, subtitle: c.tckn || c.vkn });
        });
        
        (debtorsRes.data || []).slice(0, 3).forEach((d: any) => {
          results.push({ type: 'debtor', id: d.id, title: d.name, subtitle: d.identityNo });
        });

        setSearchResults(results);
        setShowResults(true);
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    if (result.type === 'case') router.push(`/cases/${result.id}`);
    else if (result.type === 'client') router.push(`/settings/clients`);
    else if (result.type === 'debtor') router.push(`/debtors`);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'case': return 'Takip';
      case 'client': return 'Müvekkil';
      case 'debtor': return 'Borçlu';
      default: return type;
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white px-4 sm:px-6">
        <button
          className="sm:hidden p-2 -ml-2 rounded-lg hover:bg-muted"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Mobile Menu Overlay - sadece mobilde (sm altında) */}
        {showMobileMenu && (
          <div className="fixed inset-0 z-50 sm:hidden">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
            <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl">
              <div className="flex h-16 items-center justify-between border-b px-4">
                <div className="flex items-center gap-2">
                  <Scale className="h-6 w-6 text-primary" />
                  <span className="font-bold">Hukuk Platform</span>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-2 rounded-lg hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="p-4 space-y-1">
                {mobileNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setShowMobileMenu(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

      {/* Search */}
      <div className="flex-1 min-w-0 max-w-md" ref={searchRef}>
        <div className="relative">
          {searching ? (
            <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            placeholder="Takip, müvekkil, borçlu ara... (Ctrl+K)"
            className="w-full rounded-lg border bg-muted/50 py-2 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          
          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-80 overflow-auto z-50">
              {searchResults.map((result, i) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b last:border-0"
                >
                  <div className={`p-2 rounded-lg ${
                    result.type === 'case' ? 'bg-blue-100 text-blue-600' :
                    result.type === 'client' ? 'bg-green-100 text-green-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    {result.type === 'case' ? <FileText className="h-4 w-4" /> :
                     result.type === 'client' ? <Building2 className="h-4 w-4" /> :
                     <Users className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{result.title}</p>
                    <p className="text-xs text-gray-500">{getTypeLabel(result.type)} {result.subtitle && `• ${result.subtitle}`}</p>
                  </div>
                </button>
              ))}
              {searchQuery.length >= 2 && (
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                  {searchResults.length} sonuç bulundu
                </div>
              )}
            </div>
          )}
          
          {showResults && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg p-4 text-center text-sm text-gray-500 z-50">
              Sonuç bulunamadı
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Theme Toggle */}
        <button
          onClick={() => {
            const html = document.documentElement;
            const isDark = html.classList.contains('dark');
            html.classList.toggle('dark', !isDark);
            localStorage.setItem('theme', isDark ? 'light' : 'dark');
          }}
          className="rounded-lg p-2 hover:bg-muted"
          title="Tema Değiştir"
        >
          <Sun className="h-5 w-5 hidden dark:block" />
          <Moon className="h-5 w-5 dark:hidden" />
        </button>

        <button className="relative rounded-lg p-2 hover:bg-muted">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3"
          >
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">{user?.name} {user?.surname}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="h-5 w-5" />
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg border shadow-lg py-1">
              <div className="px-4 py-2 border-b">
                <p className="text-sm font-medium">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>
      </header>
    </>
  );
}
