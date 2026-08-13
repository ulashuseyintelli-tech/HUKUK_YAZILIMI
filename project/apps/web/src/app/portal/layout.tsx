"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Scale, FileText, FileCheck, LogOut, User, Home, Bell, Check, FolderOpen, MessageCircle, Receipt } from "lucide-react";
// CLIENT-CONFIG-P01: bildirim çağrıları `NEXT_PUBLIC_API_URL`'i hiç okumayan sabit
// `http://localhost:8080` adresine gidiyordu — web ile API farklı origin'deyse (staging/
// production) bildirim zili sessizce çalışmıyordu (catch blokları hatayı yutuyor).
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { toActionErrorMessage } from "@/lib/action-error";

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
  // WSMR-A4g: bildirim okuma/isaretleme hatalari GORUNUR olur; sahte yerel
  // "okundu" durumu uretilmez.
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    const userData = localStorage.getItem("portal_user");
    
    if (!token && pathname !== "/portal/login" && pathname !== "/portal/forgot-password" && pathname !== "/portal/reset-password") {
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
    if (!token || pathname === "/portal/login" || pathname === "/portal/forgot-password" || pathname === "/portal/reset-password") return;

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(portalApiUrl("/api/portal/notifications/unread-count"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`UNREAD_COUNT_HTTP_${res.status}`);
        const data = await res.json();
        // Govde sozlesmeye karsi dogrulanir: sayi degilse rozet BASILMAZ.
        if (typeof data?.count !== "number") throw new Error("MALFORMED_UNREAD_COUNT");
        setUnreadCount(data.count);
      } catch (e) {
        // WSMR-A4g: sayac okunamadiysa rozet DOGRULANMIS son degerinde kalir;
        // sifirlanip "okunmamis bildirim yok" izlenimi VERMEZ. Durum zil
        // menusunde gorunur hale gelir (bkz. notificationError bandi).
        setNotificationError(
          toActionErrorMessage(e, "Bildirimler okunamadı; sayı güncel olmayabilir."),
        );
      }
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
    setNotificationError(null);
    try {
      const res = await fetch(portalApiUrl("/api/portal/notifications"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`NOTIFICATIONS_HTTP_${res.status}`);
      const data = await res.json();
      // Govde SOZLESMEYE karsi dogrulanir: dizi degilse basari sayilmaz.
      if (!Array.isArray(data)) throw new Error("MALFORMED_NOTIFICATION_LIST");
      setNotifications(data);
    } catch (e) {
      // WSMR-A4g: okuma hatasi "Bildirim yok" ile AYNI gorunemez. Liste
      // temizlenir ve hata bandi basilir.
      setNotifications([]);
      setNotificationError(toActionErrorMessage(e, "Bildirimler yüklenemedi."));
    }
  };

  const handleBellClick = () => {
    if (!showNotifications) {
      fetchNotifications();
    }
    setShowNotifications(!showNotifications);
  };

  /**
   * WSMR-A4g · SAHTE "OKUNDU" DURUMU KALDIRILDI.
   *
   * Eski hâlde `fetch` yanıtı HİÇ kontrol edilmiyordu. `fetch` yalnız ağ
   * hatasında reject eder; 403/500 gibi yanıtlar normal biçimde çözülür. Yani
   * sunucu yazmayı REDDETSE bile bildirim yerelde "okundu" işaretleniyor ve
   * okunmamış sayacı düşüyordu. Müvekkil, gerçekte hâlâ okunmamış duran bir
   * bildirimi ele alınmış sanabilirdi. Artık başarı YALNIZ `res.ok` ile
   * doğrulandıktan sonra yerel duruma yazılır.
   */
  const markAsRead = async (id: string) => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    setNotificationError(null);
    try {
      const res = await fetch(portalApiUrl(`/api/portal/notifications/${id}/read`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`MARK_READ_HTTP_${res.status}`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      setNotificationError(toActionErrorMessage(e, "Bildirim okundu olarak işaretlenemedi."));
    }
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    setNotificationError(null);
    try {
      const res = await fetch(portalApiUrl("/api/portal/notifications/read-all"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`MARK_ALL_READ_HTTP_${res.status}`);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      setNotificationError(toActionErrorMessage(e, "Bildirimler okundu olarak işaretlenemedi."));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    router.push("/portal/login");
  };

  // Login, forgot-password ve reset-password sayfaları için layout gösterme
  if (pathname === "/portal/login" || pathname === "/portal/forgot-password" || pathname === "/portal/reset-password") {
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
                  {notificationError && (
                    <div role="alert" className="px-3 py-2 border-b bg-red-50 text-xs text-red-700">
                      <p className="font-medium">{notificationError}</p>
                      <button
                        type="button"
                        onClick={fetchNotifications}
                        className="mt-1 underline hover:text-red-900"
                      >
                        Tekrar dene
                      </button>
                    </div>
                  )}
                  <div className="max-h-72 overflow-y-auto">
                    {notificationError ? null : notifications.length === 0 ? (
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
            {/* CLIENT-P2-U03-TRACK-B-I06-R01: yayinlanmis finansal bildirim yuzeyi (charter §45).
                Sayfa I06'da eklenmisti ama navigasyonda linki YOKTU — muvekkil URL'yi elle
                yazmadan ulasamiyordu. Yalniz gezinme baglantisi; yetki ve alan siniri
                degismedi (server-authorized projeksiyon). */}
            <Link href="/portal/financial-disclosures" className={`py-3 px-1 text-sm border-b-2 ${pathname.startsWith("/portal/financial-disclosures") ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
              <Receipt className="h-4 w-4 inline mr-1" /> Finansal Bildirimler
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
