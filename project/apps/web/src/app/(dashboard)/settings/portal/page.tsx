"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Globe, FileText, MessageCircle, CheckCircle, XCircle, Clock, Send, User } from "lucide-react";

interface PendingDocument {
  id: string;
  clientId: string;
  type: string;
  title: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface ClientWithMessages {
  id: string;
  displayName: string;
  type: string;
  unreadCount: number;
  lastMessage?: { content: string; createdAt: string; senderType: string };
}

interface Message {
  id: string;
  content: string;
  senderType: string;
  senderName: string;
  createdAt: string;
}

const DOC_TYPES: Record<string, string> = {
  VEKALET: "Vekaletname",
  KIMLIK: "Kimlik Belgesi",
  SOZLESME: "Sözleşme",
  DIGER: "Diğer",
};

export default function PortalManagementPage() {
  const [activeTab, setActiveTab] = useState<"documents" | "messages">("documents");
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [clients, setClients] = useState<ClientWithMessages[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientWithMessages | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (activeTab === "documents") {
      fetchPendingDocs();
    } else {
      fetchClients();
    }
  }, [activeTab]);

  const fetchPendingDocs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/portal/admin/documents/pending");
      setPendingDocs(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch (e) {
      console.error(e);
      setPendingDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await api.get("/portal/admin/messages/clients");
      setClients(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/portal/admin/documents/${id}/approve`, {});
      fetchPendingDocs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt("Red sebebi (opsiyonel):");
    try {
      await api.post(`/portal/admin/documents/${id}/reject`, { note });
      fetchPendingDocs();
    } catch (e) {
      console.error(e);
    }
  };

  const selectClient = async (client: ClientWithMessages) => {
    setSelectedClient(client);
    try {
      const res = await api.get<{ messages: any[] }>(`/portal/admin/messages/${client.id}`);
      setMessages(res.data?.messages || []);
      // Okunmamış sayısını sıfırla
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, unreadCount: 0 } : c));
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    setSending(true);
    try {
      await api.post(`/portal/admin/messages/${selectedClient.id}`, { content: newMessage });
      setNewMessage("");
      // Mesajları yenile
      const res = await api.get<{ messages: any[] }>(`/portal/admin/messages/${selectedClient.id}`);
      setMessages(res.data?.messages || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-blue-600" />
        <h1 className="text-xl font-semibold">Portal Yönetimi</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button onClick={() => setActiveTab("documents")} className={`pb-2 px-1 text-sm font-medium border-b-2 ${activeTab === "documents" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600"}`}>
          <FileText className="h-4 w-4 inline mr-1" /> Bekleyen Belgeler {pendingDocs.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingDocs.length}</span>}
        </button>
        <button onClick={() => setActiveTab("messages")} className={`pb-2 px-1 text-sm font-medium border-b-2 ${activeTab === "messages" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600"}`}>
          <MessageCircle className="h-4 w-4 inline mr-1" /> Mesajlar {clients.filter(c => c.unreadCount > 0).length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{clients.reduce((sum, c) => sum + c.unreadCount, 0)}</span>}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : activeTab === "documents" ? (
        /* Bekleyen Belgeler */
        pendingDocs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600">Bekleyen belge yok</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Belge</th>
                  <th className="text-left px-4 py-3 font-medium">Tür</th>
                  <th className="text-left px-4 py-3 font-medium">Boyut</th>
                  <th className="text-left px-4 py-3 font-medium">Tarih</th>
                  <th className="text-right px-4 py-3 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{doc.title}</div>
                      <div className="text-xs text-gray-500">{doc.fileName}</div>
                    </td>
                    <td className="px-4 py-3">{DOC_TYPES[doc.type] || doc.type}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFileSize(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(doc.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleApprove(doc.id)} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Onayla
                        </button>
                        <button onClick={() => handleReject(doc.id)} className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Reddet
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Mesajlar */
        <div className="flex gap-4 h-[calc(100vh-280px)]">
          {/* Müvekkil Listesi */}
          <div className="w-72 bg-white rounded-lg border overflow-hidden flex flex-col">
            <div className="p-3 border-b font-medium text-sm">Müvekkiller</div>
            <div className="flex-1 overflow-y-auto">
              {clients.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">Portal erişimi olan müvekkil yok</div>
              ) : (
                clients.map(client => (
                  <div key={client.id} onClick={() => selectClient(client)} className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedClient?.id === client.id ? "bg-blue-50" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{client.displayName}</span>
                      {client.unreadCount > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{client.unreadCount}</span>}
                    </div>
                    {client.lastMessage && (
                      <p className="text-xs text-gray-500 truncate mt-1">{client.lastMessage.content}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mesaj Alanı */}
          <div className="flex-1 bg-white rounded-lg border overflow-hidden flex flex-col">
            {!selectedClient ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>Mesajlaşmak için bir müvekkil seçin</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b font-medium text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> {selectedClient.displayName}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderType === "OFFICE" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${msg.senderType === "OFFICE" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.senderType === "OFFICE" ? "text-blue-200" : "text-gray-400"}`}>
                          {new Date(msg.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t p-3 flex gap-2">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyPress={e => e.key === "Enter" && sendMessage()} placeholder="Mesajınızı yazın..." className="flex-1 border rounded-lg px-3 py-2" />
                  <button onClick={sendMessage} disabled={sending || !newMessage.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    <Send className="h-4 w-4" /> Gönder
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
