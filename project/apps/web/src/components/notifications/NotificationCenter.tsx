"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  Mail,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  FileText,
  Building2,
  CreditCard,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
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

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      // Mock data - gercek API'den gelecek
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
        {
          id: "4",
          type: "UYAP_FAILED",
          title: "UYAP Hatasi",
          message: "2024/12348 sayili dosyanin UYAP gonderimi basarisiz oldu",
          priority: "urgent",
          isRead: false,
          caseId: "case-4",
          caseFileNumber: "2024/12348",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        },
        {
          id: "5",
          type: "GAZETTE_UPDATE",
          title: "Tarife Guncellendi",
          message: "2025 yili harc tarifeleri Resmi Gazete'de yayinlandi",
          priority: "low",
          isRead: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
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
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
    );
    // API call: await api.post(`/notifications/${id}/read`);
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    // API call: await api.post('/notifications/read-all');
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    // API call: await api.delete(`/notifications/${id}`);
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
      case "urgent":
        return "text-red-600 bg-red-50";
      case "high":
        return "text-orange-600 bg-orange-50";
      case "medium":
        return "text-blue-600 bg-blue-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const filteredNotifications = filter === "unread" 
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const NotificationList = () => (
    <div className="space-y-2">
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Bildirim bulunmuyor</p>
        </div>
      ) : (
        filteredNotifications.map((notification) => {
          const Icon = getIcon(notification.type);
          return (
            <div
              key={notification.id}
              className={`p-3 rounded-lg border transition-colors ${
                notification.isRead ? "bg-background" : "bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium text-sm ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <Badge variant="default" className="h-5 text-xs">Yeni</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                        locale: tr,
                      })}
                    </span>
                    {notification.caseFileNumber && (
                      <Badge variant="outline" className="text-xs">
                        {notification.caseFileNumber}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!notification.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => markAsRead(notification.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteNotification(notification.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Bildirimler
              {unreadCount > 0 && (
                <Badge variant="destructive">{unreadCount}</Badge>
              )}
            </CardTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                Tumunu Okundu Isaretle
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">Tumu ({notifications.length})</TabsTrigger>
              <TabsTrigger value="unread">Okunmamis ({unreadCount})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <NotificationList />
            </TabsContent>
            <TabsContent value="unread">
              <NotificationList />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Bildirimler</h4>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={markAllAsRead}>
                Tumunu Oku
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-80">
          <div className="p-2">
            <NotificationList />
          </div>
        </ScrollArea>
        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full text-sm" asChild>
            <a href="/notifications">Tum Bildirimleri Gor</a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export for header usage
export function NotificationBell() {
  return <NotificationCenter variant="popover" />;
}
