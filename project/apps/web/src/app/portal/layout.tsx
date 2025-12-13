"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Scale, FileText, FileCheck, LogOut, User, Home, Bell, Check, FolderOpen, MessageCircle } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl?: string;
  createdAt: string;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    const userData = localStorage.getItem("portal_user");
    
    if (!token && pathname !== "/portal/login" && pathname !== "/portal/forgot-password") {
      router.push("/portal/login");
      return;
    }
    
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, [pathname, router]);

  // Bildirim sayısını çek
  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token || pathname === "/portal/login" || pathname === "/portal/forgot-password") return;

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch("http://localhost:8080/api/portal/notifications/unread-count", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count);
        }
      } catch (e) {}
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30 saniyede bir
    return () => clearInterval(interval);
  }, [pathname]);

  // Dropdown dışına tıklanınca kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch("http://localhost:8080/api/portal/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {}
  };

  const handleBellClick = () => {
    if (!showNotifications) {
      fetchNotifications();
    }
    setShowNotifications(!showNotifications);
  };

  const markAsRead = async (id: string) => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      await fetch(`http://localhost:8080/api/portal/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {}
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      await fetch("http://localhost:8080/api/portal/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    router.push("/portal/login");
  };

  // Login ve forgot-password sayfaları için layout gösterme
  if (pathname === "/portal/login" || pathname === "/portal/forgot-password") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-blue-600" />
            <span className="font-semibold text-lg">Müvekkil Portalı</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Bildirim İkonu */}
            <div className="relative" ref={dropdownRef}>
              <button onClick={handleBellClick} className="relative p-1 text-gray-500 hover:text-gray-700">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-hidden">
                  <div className="p-3 border-b flex items-center justify-between">
                    <span className="font-medium text-sm">Bildirimler</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Check className="h-3 w-3" /> Tümünü Okundu İşaretle
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">Bildirim yok</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => { if (!n.isRead) markAsRead(n.id); if (n.linkUrl) router.push(n.linkUrl); }}
                          className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${!n.isRead ? "bg-blue-50" : ""}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${!n.isRead ? "bg-blue-500" : "bg-transparent"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                              <p className="text-xs text-gray-600 line-clamp-2">{n.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleDateString("tr-TR")}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="text-sm text-gray-600">{user?.clientName}</span>
            <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600">
              <LogOut className="h-4 w-4" /> Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-6">
            <Link href="/portal" className={`py-3 px-1 text-sm border-b-2 ${pathname === "/portal" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <Home className="h-4 w-4 inline mr-1" /> Ana Sayfa
            </Link>
            <Link href="/portal/cases" className={`py-3 px-1 text-sm border-b-2 ${pathname.startsWith("/portal/cases") ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <FileText className="h-4 w-4 inline mr-1" /> Dosyalarım
            </Link>
            <Link href="/portal/poas" className={`py-3 px-1 text-sm border-b-2 ${pathname === "/portal/poas" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <FileCheck className="h-4 w-4 inline mr-1" /> Vekaletlerim
            </Link>
            <Link href="/portal/documents" className={`py-3 px-1 text-sm border-b-2 ${pathname === "/portal/documents" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <FolderOpen className="h-4 w-4 inline mr-1" /> Belgelerim
            </Link>
            <Link href="/portal/messages" className={`py-3 px-1 text-sm border-b-2 ${pathname === "/portal/messages" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <MessageCircle className="h-4 w-4 inline mr-1" /> Mesajlar
            </Link>
            <Link href="/portal/profile" className={`py-3 px-1 text-sm border-b-2 ${pathname === "/portal/profile" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <User className="h-4 w-4 inline mr-1" /> Profilim
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
