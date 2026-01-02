"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bell,
  Mail,
  Building2,
  CreditCard,
  Clock,
  FileText,
  Info,
  Check,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

export type NotificationType = 
  | "TEBLIGAT_DELIVERED"
  | "TEBLIGAT_RETURNED"
  | "UYAP_SUCCESS"
  | "UYAP_FAILED"
  | "PAYMENT_RECEIVED"
  | "DEADLINE_APPROACHING"
  | "TASK_ASSIGNED"
  | "CASE_STATUS_CHANGED"
  | "GAZETTE_UPDATE"
  | "SYSTEM";

export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  caseId?: string;
  caseFileNumber?: string;
  actionUrl?: string;
  createdAt: string;
}

interface NotificationCenterProps {
  variant?: "popover" | "full";
}

export function NotificationCenter({ variant = "popover" }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const mockNotifications: Notification[] = [
        {
          id: "1",
          type: "TEBLIGAT_DELIVERED",
          title: "Tebligat Teslim Edildi",
          message: "2024/12345 sayili dosyanin odeme emri teslim edildi",
          priority: "medium",
          isRead: false,
          caseId: "case-1",
          caseFileNumber: "2024/12345",
          createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        },
        {
          id: "2",
          type: "DEADLINE_APPROACHING",
          title: "Sure Yaklasıyor",
          message: "2024/12346 sayili dosyada 7 gunluk itiraz suresi yarin doluyor",
          priority: "high",
          isRead: false,
          caseId: "case-2",
          caseFileNumber: "2024/12346",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        },
        {
          id: "3",
          type: "PAYMENT_RECEIVED",
          title: "Odeme Alindi",
          message: "2024/12347 sayili dosyaya 15.000 TL odeme yapildi",
          priority: "medium",
          isRead: true,
          caseId: "case-3",
          caseFileNumber: "2024/12347",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        },
      ];
      setNotifications(mockNotifications);
    } catch (error) {
      console.error("Bildirimler yuklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "TEBLIGAT_DELIVERED":
      case "TEBLIGAT_RETURNED":
        return Mail;
      case "UYAP_SUCCESS":
      case "UYAP_FAILED":
        return Building2;
      case "PAYMENT_RECEIVED":
        return CreditCard;
      case "DEADLINE_APPROACHING":
        return Clock;
      case "TASK_ASSIGNED":
      case "CASE_STATUS_CHANGED":
        return FileText;
      case "GAZETTE_UPDATE":
        return Info;
      default:
        return Bell;
    }
  };

  const getPriorityColor = (priority: NotificationPriority) => {
    switch (priority) {
      case "urgent": return "text-red-600 bg-red-50";
      case "high": return "text-orange-600 bg-orange-50";
      case "medium": return "text-blue-600 bg-blue-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const filteredNotifications = filter === "unread" ? notifications.filter(n => !n.isRead) : notifications;

  const NotificationList = () => (
    <div className="space-y-2">
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Bildirim bulunmuyor</p>
        </div>
      ) : (
        filteredNotifications.map((notification) => {
          const Icon = getIcon(notification.type);
          return (
            <div key={notification.id} className={`p-3 rounded-lg border transition-colors ${notification.isRead ? "bg-white" : "bg-blue-50/50"}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium text-sm ${!notification.isRead ? "text-gray-900" : "text-gray-500"}`}>
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">Yeni</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: tr })}
                    </span>
                    {notification.caseFileNumber && (
                      <span className="px-1.5 py-0.5 text-xs border rounded">{notification.caseFileNumber}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!notification.isRead && (
                    <button onClick={() => markAsRead(notification.id)} className="p-1.5 hover:bg-gray-100 rounded">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteNotification(notification.id)} className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded text-gray-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  if (variant === "full") {
    return (
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Bildirimler
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-600 text-white rounded-full">{unreadCount}</span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-sm text-blue-600 hover:underline">
                Tumunu Okundu Isaretle
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 text-sm rounded ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
              Tumu ({notifications.length})
            </button>
            <button onClick={() => setFilter("unread")} className={`px-3 py-1.5 text-sm rounded ${filter === "unread" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
              Okunmamis ({unreadCount})
            </button>
          </div>
        </div>
        <div className="p-4">
          <NotificationList />
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-100 rounded-lg relative">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg border shadow-lg z-50">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Bildirimler</h4>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:underline">Tumunu Oku</button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            <NotificationList />
          </div>
          <div className="p-2 border-t">
            <a href="/notifications" className="block text-center text-sm text-blue-600 hover:underline py-2">
              Tum Bildirimleri Gor
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  return <NotificationCenter variant="popover" />;
}
