"use client";

import { useEffect, useState, useRef } from "react";
import { MessageCircle, Send, User, Building2 } from "lucide-react";

interface Message {
  id: string;
  content: string;
  senderType: string;
  senderName: string;
  isRead: boolean;
  createdAt: string;
}

export default function PortalMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    markAsRead();
    // Her 10 saniyede bir mesajları güncelle
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch("http://localhost:8080/api/portal/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      await fetch("http://localhost:8080/api/portal/messages/mark-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {}
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    const token = localStorage.getItem("portal_token");
    if (!token) return;

    setSending(true);
    try {
      const res = await fetch("http://localhost:8080/api/portal/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newMessage }),
      });

      if (res.ok) {
        setNewMessage("");
        fetchMessages();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-blue-600" />
        <h1 className="text-xl font-semibold">Mesajlar</h1>
      </div>

      {/* Mesaj Listesi */}
      <div className="flex-1 bg-white rounded-lg border overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Henüz mesaj yok</p>
              <p className="text-sm">Büronuza mesaj göndermek için aşağıdaki alanı kullanın</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderType === "CLIENT" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-lg p-3 ${msg.senderType === "CLIENT" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {msg.senderType === "CLIENT" ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    <span className="text-xs opacity-75">{msg.senderName}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.senderType === "CLIENT" ? "text-blue-200" : "text-gray-400"}`}>
                    {new Date(msg.createdAt).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Mesaj Gönderme */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Mesajınızı yazın..."
              className="flex-1 border rounded-lg px-3 py-2 resize-none"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {sending ? "..." : "Gönder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
