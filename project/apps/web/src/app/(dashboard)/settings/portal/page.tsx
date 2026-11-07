"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toActionErrorMessage } from "@/lib/action-error";
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
  isRead?: boolean;
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
  // WSMR-A4m: her okuma/gonderme yuzeyi kendi hatasini AYRI tasir; "bos" ile
  // "okunamadi" karistirilmaz.
  const [docsError, setDocsError] = useState<string | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const messageContextRef = useRef(0);
  const readInFlightRef = useRef(new Set<string>());
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  useEffect(() => () => { messageContextRef.current += 1; }, []);
  const [rejectionDocument, setRejectionDocument] = useState<PendingDocument | null>(null);
  const [clientRejectionReason, setClientRejectionReason] = useState("");
  const [internalReviewNote, setInternalReviewNote] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (activeTab === "documents") {
      fetchPendingDocs();
    } else {
      fetchClients();
    }
  }, [activeTab]);

  /**
   * WSMR-A4m · Okuma başarısız olunca `setPendingDocs([])` "Bekleyen belge
   * yok" render'ini TETİKLİYORDU — gerçekte onaylanmayı bekleyen belgeler
   * OLDUĞU hâlde okunamadığında hiç yokmuş gibi görünüyordu (admin bekleyen
   * onayları KAÇIRABİLİRDİ). Artık liste boşaltılmaz, hata ayrı görünür olur.
   */
  const fetchPendingDocs = async () => {
    setLoading(true);
    setDocsError(null);
    try {
      const res = await api.get("/portal/admin/documents/pending");
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? null);
      if (!Array.isArray(rows)) throw new Error("MALFORMED_PENDING_DOCS");
      setPendingDocs(rows);
    } catch (e) {
      setDocsError(toActionErrorMessage(e, "Bekleyen belgeler yüklenemedi."));
    } finally {
      setLoading(false);
    }
  };

  /**
   * WSMR-A4m · Okuma başarısız olunca liste sessizce eski/boş hâlde
   * kalıyordu ve ekran "Portal erişimi olan müvekkil yok" diyebiliyordu —
   * gerçek durumla ilgisi olmayan bir olgu iddiası. Artık hata görünür olur.
   */
  const fetchClients = async () => {
    setLoading(true);
    setClientsError(null);
    try {
      const res = await api.get("/portal/admin/messages/clients");
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? null);
      if (!Array.isArray(rows)) throw new Error("MALFORMED_CLIENT_LIST");
      setClients(rows);
    } catch (e) {
      setClientsError(toActionErrorMessage(e, "Müvekkil listesi yüklenemedi."));
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

  const openRejection = (document: PendingDocument) => {
    setRejectionDocument(document);
    setClientRejectionReason("");
    setInternalReviewNote("");
    setRejectionError(null);
  };

  const handleReject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rejectionDocument || rejecting) return;
    const reason = clientRejectionReason.trim();
    if (!reason || reason.length > 500) {
      setRejectionError("Müvekkile gösterilecek ret gerekçesi 1–500 karakter olmalıdır.");
      return;
    }
    setRejecting(true);
    setRejectionError(null);
    try {
      await api.post(`/portal/admin/documents/${rejectionDocument.id}/reject`, {
        note: internalReviewNote,
        clientRejectionReason: reason,
      });
      setRejectionDocument(null);
      await fetchPendingDocs();
    } catch (e) {
      setRejectionError(toActionErrorMessage(e, "Belge reddedilemedi."));
    } finally {
      setRejecting(false);
    }
  };

  /** Listing a conversation is read-only; only an explicit message open acknowledges it. */
  const selectClient = async (client: ClientWithMessages) => {
    const context = ++messageContextRef.current;
    setSelectedClient(client);
    setMessages([]);
    setReadErrors({});
    setSending(false);
    setSendError(null);
    setMessagesError(null);
    try {
      const res = await api.get<{ messages: any[] }>(`/portal/admin/messages/${client.id}`);
      const rows = res.data?.messages;
      if (!Array.isArray(rows)) throw new Error("MALFORMED_MESSAGE_LIST");
      if (context !== messageContextRef.current) return;
      setMessages(rows);
    } catch (e) {
      if (context !== messageContextRef.current) return;
      setMessages([]);
      setMessagesError(toActionErrorMessage(e, "Mesajlar yüklenemedi."));
    }
  };

  const openMessage = async (message: Message) => {
    if (!selectedClient || message.senderType !== "CLIENT" || message.isRead || readInFlightRef.current.has(message.id)) return;
    const context = messageContextRef.current;
    const clientId = selectedClient.id;
    readInFlightRef.current.add(message.id);
    try {
      const result = await api.post<{ success: boolean }>(`/portal/admin/messages/${clientId}/${message.id}/read`, {});
      if (result.data?.success !== true) throw new Error("MALFORMED_READ_RESULT");
      if (context !== messageContextRef.current) return;
      setMessages(prev => prev.map(row => row.id === message.id ? { ...row, isRead: true } : row));
      setReadErrors(prev => { const next = { ...prev }; delete next[message.id]; return next; });
      void fetchClients();
    } catch (error) {
      if (context === messageContextRef.current) setReadErrors(prev => ({ ...prev, [message.id]: toActionErrorMessage(error, "Okunma kaydı kaydedilemedi.") }));
    } finally {
      readInFlightRef.current.delete(message.id);
    }
  };

  /**
   * WSMR-A4m · Gönderim başarısız olunca hiçbir geri bildirim yoktu — admin
   * "Gönder"e tıkladı, yazı kayboldu mu bilemiyordu (yazılan metin
   * KORUNUYORDU ama bu görünmüyordu). Artık hata görünür olur.
   */
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    const context = messageContextRef.current;
    const clientId = selectedClient.id;
    setSending(true);
    setSendError(null);
    try {
      await api.post(`/portal/admin/messages/${clientId}`, { content: newMessage });
      if (context !== messageContextRef.current) return;
      setNewMessage("");
      // Mesajları yenile
      const res = await api.get<{ messages: any[] }>(`/portal/admin/messages/${clientId}`);
      if (context !== messageContextRef.current) return;
      const rows = res.data?.messages;
      if (Array.isArray(rows)) setMessages(rows);
    } catch (e) {
      if (context !== messageContextRef.current) return;
      setSendError(toActionErrorMessage(e, "Mesaj gönderilemedi."));
    } finally {
      if (context === messageContextRef.current) setSending(false);
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

      {activeTab === "documents" && rejectionDocument && (
        <section aria-labelledby="document-rejection-title" className="rounded-lg border bg-white p-4">
          <form aria-label="Belge ret kararı" onSubmit={handleReject} className="max-w-lg space-y-4">
            <h2 id="document-rejection-title" className="font-semibold">Belgeyi reddet: {rejectionDocument.title}</h2>
            <div>
              <label htmlFor="client-rejection-reason" className="block text-sm font-medium">Müvekkile gösterilecek ret gerekçesi</label>
              <p className="mb-1 text-xs text-gray-500">Kısa bir açıklama yazın. Bu alan müvekkilin portal bildiriminde görünür.</p>
              <textarea id="client-rejection-reason" autoFocus required maxLength={500} value={clientRejectionReason} onChange={e => setClientRejectionReason(e.target.value)} disabled={rejecting} className="w-full rounded border p-2 text-sm" rows={3} />
            </div>
            <div>
              <label htmlFor="internal-review-note" className="block text-sm font-medium">İç inceleme notu (isteğe bağlı)</label>
              <p className="mb-1 text-xs text-gray-500">Yalnız büro içindir; portal bildirimine aktarılmaz.</p>
              <textarea id="internal-review-note" value={internalReviewNote} onChange={e => setInternalReviewNote(e.target.value)} disabled={rejecting} className="w-full rounded border p-2 text-sm" rows={3} />
            </div>
            {rejectionError && <p role="alert" className="text-sm text-red-700">{rejectionError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={rejecting} onClick={() => setRejectionDocument(null)} className="rounded border px-3 py-2 text-sm">Vazgeç</button>
              <button type="submit" disabled={rejecting} className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50">{rejecting ? "Reddediliyor…" : "Ret kararını kaydet"}</button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : activeTab === "documents" ? (
        /* Bekleyen Belgeler */
        docsError ? (
          /* WSMR-A4m: okuma HATASI "bekleyen belge yok" ile AYNI gorunemez. */
          <div className="text-center py-12 bg-red-50 rounded-lg border border-red-200" role="alert">
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-700 font-medium">{docsError}</p>
            <button
              type="button"
              onClick={fetchPendingDocs}
              className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
            >
              Tekrar dene
            </button>
          </div>
        ) : pendingDocs.length === 0 ? (
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
                        <button disabled={rejecting} onClick={() => handleApprove(doc.id)} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Onayla
                        </button>
                        <button disabled={rejecting} onClick={() => openRejection(doc)} className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 flex items-center gap-1">
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
              {clientsError ? (
                /* WSMR-A4m: okuma HATASI "musteri yok" ile AYNI gorunemez. */
                <div className="p-4 text-center text-sm" role="alert">
                  <p className="text-red-600 font-medium">{clientsError}</p>
                  <button
                    type="button"
                    onClick={fetchClients}
                    className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
                  >
                    Tekrar dene
                  </button>
                </div>
              ) : clients.length === 0 ? (
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
                {messagesError && (
                  /* WSMR-A4m: mesaj okuma hatasi GORUNUR olur. */
                  <div role="alert" className="px-4 py-2 border-b bg-red-50 text-xs text-red-700 flex items-center justify-between gap-2">
                    <span>{messagesError}</span>
                    <button
                      type="button"
                      onClick={() => selectClient(selectedClient)}
                      className="underline hover:text-red-900 shrink-0"
                    >
                      Tekrar dene
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderType === "OFFICE" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${msg.senderType === "OFFICE" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                        {msg.senderType === "CLIENT" ? <details onToggle={event => { if (event.currentTarget.open) void openMessage(msg); }}>
                          <summary className="cursor-pointer text-sm">Mesajı aç</summary>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {readErrors[msg.id] && <div role="alert" className="text-xs text-red-700">
                            {readErrors[msg.id]} <button type="button" className="underline" onClick={() => void openMessage(msg)}>Okunmayı yeniden kaydet</button>
                          </div>}
                        </details> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                        <p className={`text-xs mt-1 ${msg.senderType === "OFFICE" ? "text-blue-200" : "text-gray-400"}`}>
                          {new Date(msg.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t p-3">
                  {sendError && (
                    <div role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {sendError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyPress={e => e.key === "Enter" && sendMessage()} placeholder="Mesajınızı yazın..." className="flex-1 border rounded-lg px-3 py-2" />
                    <button onClick={sendMessage} disabled={sending || !newMessage.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      <Send className="h-4 w-4" /> Gönder
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
