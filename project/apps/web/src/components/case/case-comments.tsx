'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock } from '@/lib/use-submit-lock';
import { MessageSquare, Send, Reply, Trash2, MoreVertical, User, Clock, AtSign, Loader2 } from 'lucide-react';

interface Comment {
  id: string;
  text: string;
  user: string;
  userId: string;
  timestamp: string;
  mentions: string[];
  replies: Comment[];
  parentId?: string;
}

interface CaseCommentsProps {
  caseId: string;
}

export function CaseComments({ caseId }: CaseCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  // PR-2A1: mutation hatasi GORUNUR; yorum uydurulmaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  // Yorum ve yanit AYRI submit anahtarlari kullanir; biri digerini bloklamaz.
  const submitLock = useKeyedSubmitLock();
  const rowLock = useKeyedSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadComments({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadComments();
    loadUsers();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: hata YUTULMAZ, demo veri URETILMEZ, malformed empty SAYILMAZ.
  const loadComments = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/comments`);
      const rows = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setComments(rows as Comment[]);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Yorumlar yuklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers((res.data?.data || []).map((u: any) => ({
        id: u.id,
        name: `${u.name} ${u.surname}`.trim(),
      })));
    } catch (e) {
      // PR-2A1: @bahsetme listesi UYDURULMAZ. Eski davranış üç sahte kullanıcı
      // ("Admin", "Av. Mehmet", "Muhasebe") üretiyordu; kullanıcı var olmayan birini
      // etiketleyip haber verdiğini sanabilirdi. Liste boş kalır, öneri sunulmaz.
      setUsers([]);
      setLoadError(toActionErrorMessage(e, 'Kullanıcı listesi yüklenemedi; bahsetme önerisi kapalı.'));
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    const mentions = extractMentions(newComment);

    // PR-2A1: yorum ve yanıt AYRI submit anahtarı kullanır — yanıt gönderirken yeni
    // yorum gönderimi gereksiz yere bloklanmaz. Create yolunda idempotency anahtarı
    // YOK, bu yüzden senkron kilit şart.
    await submitLock.run(`comment:new:${caseId}`, async () => {
      setSending(true);
      setActionError(null);
      setStaleNotice(null);

      const outcome = await runMutation({
        mutate: () => api.post(`/cases/${caseId}/comments`, { text: newComment, mentions }),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır; yerel yorum ÜRETİLMEZ
        // (eski davranış "Ben / current-user" diye sahte bir yazar bile uyduruyordu).
        refresh: () => loadComments({ propagateError: true }),
        failureMessage: 'Yorum gönderilemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Yorum GÖNDERİLDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;
      setSending(false);
      if (outcome.status === 'FAILED') {
        // `setNewComment('')` eskiden `finally` içindeydi → hata hâlinde de metin
        // siliniyordu. Artık metin KORUNUR.
        setActionError(outcome.error.message);
        return;
      }
      // SUCCESS ve SUCCESS_STALE: kayıt KESİNLEŞTİ → aynı yorum yeniden gönderilemez.
      setNewComment('');
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleSendReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    const mentions = extractMentions(replyText);

    // PR-2A1: yanıtın kendi submit anahtarı vardır (üst yorum kimliğine bağlı) —
    // farklı yorumlara yanıt birbirini bloklamaz, ama AYNI yoruma ikinci tık hiç başlamaz.
    await submitLock.run(`comment:reply:${caseId}:${parentId}`, async () => {
      setSending(true);
      setActionError(null);
      setStaleNotice(null);

      const outcome = await runMutation({
        mutate: () =>
          api.post(`/cases/${caseId}/comments/${parentId}/reply`, { text: replyText, mentions }),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır; yerel yanıt ÜRETİLMEZ.
        refresh: () => loadComments({ propagateError: true }),
        failureMessage: 'Yanıt gönderilemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Yanıt GÖNDERİLDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;
      setSending(false);
      if (outcome.status === 'FAILED') {
        // `setReplyText('')` ve `setReplyingTo(null)` eskiden `finally` içindeydi →
        // hata hâlinde yanıt kutusu kapanıp metin siliniyordu. Artık İKİSİ DE KORUNUR.
        setActionError(outcome.error.message);
        return;
      }
      // SUCCESS ve SUCCESS_STALE: kayıt KESİNLEŞTİ → aynı yanıt yeniden gönderilemez;
      // geriye yalnız refresh-only eylemi kalır.
      setReplyText('');
      setReplyingTo(null);
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDeleteComment = async (commentId: string, parentId?: string) => {
    if (!confirm('Bu yorumu silmek istediğinize emin misiniz?')) return;

    setActionError(null);
    setStaleNotice(null);

    // PR-2A1: PESSIMISTIC silme. Yerel çıkarma `try/catch` DIŞINDA idi → silme
    // başarısız olsa bile yorum/yanıt ekrandan kayboluyordu. Anahtar kararlı kayıt
    // kimliğidir; yanıt ile üst yorum ayrı anahtar alır, birbirini bloklamaz.
    await rowLock.run(`comment:${caseId}:${commentId}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/comments/${commentId}`),
        refresh: () => loadComments({ propagateError: true }),
        failureMessage: parentId
          ? 'Yanıt silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.'
          : 'Yorum silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
        staleMessage: parentId
          ? 'Yanıt SİLİNDİ, ancak liste yenilenemedi.'
          : 'Yorum SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      // Hata hâlinde satır ve seçim durumu AYNEN korunur — hiçbir state yazılmaz.
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+(?:\s\w+)?)/g;
    const matches = text.match(mentionRegex);
    return matches ? matches.map(m => m.slice(1)) : [];
  };

  const handleTextChange = (text: string, isReply: boolean = false) => {
    if (isReply) {
      setReplyText(text);
    } else {
      setNewComment(text);
    }

    // Check for @ mention
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const afterAt = text.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ') || afterAt.split(' ').length <= 2) {
        setMentionSearch(afterAt);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (userName: string, isReply: boolean = false) => {
    const text = isReply ? replyText : newComment;
    const lastAtIndex = text.lastIndexOf('@');
    const newText = text.slice(0, lastAtIndex) + '@' + userName + ' ';
    
    if (isReply) {
      setReplyText(newText);
    } else {
      setNewComment(newText);
    }
    setShowMentions(false);
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    
    return date.toLocaleDateString('tr-TR');
  };

  const renderText = (text: string) => {
    // Highlight mentions
    return text.split(/(@\w+(?:\s\w+)?)/g).map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-blue-600 font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PR-2A1: okuma ve mutation hataları GÖRÜNÜR; sessizce yutulmaz. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {/* Mutation başarılı ama tazeleme başarısız → kayıt durur, görünüm bayat.
          Yalnız refresh-only eylemi sunulur; mutation ASLA tekrarlanmaz. */}
      {staleNotice ? (
        <div
          role="status"
          data-testid="stale-notice"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">{staleNotice}</span>
          <button
            type="button"
            onClick={handleStaleRefresh}
            disabled={refreshingStale}
            data-testid="stale-refresh"
            className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Listeyi yenile
          </button>
        </div>
      ) : null}

      {/* New Comment Input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={newComment}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Yorum yazın... (@kullanıcı ile etiketleyin)"
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none pr-12"
        />
        <button
          onClick={handleSendComment}
          disabled={!newComment.trim() || sending}
          className="absolute bottom-2 right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>

        {/* Mention Dropdown */}
        {showMentions && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-auto w-48">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => insertMention(user.name)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <AtSign className="h-3 w-3 text-gray-400" />
                {user.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz yorum yok</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              {/* Main Comment */}
              <div className="p-3 bg-white border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{comment.user}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(comment.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Reply className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{renderText(comment.text)}</p>
              </div>

              {/* Replies */}
              {comment.replies.length > 0 && (
                <div className="ml-8 space-y-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="p-3 bg-gray-50 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="h-3 w-3 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-xs">{reply.user}</p>
                            <p className="text-xs text-gray-400">{formatTimestamp(reply.timestamp)}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteComment(reply.id, comment.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-700">{renderText(reply.text)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {replyingTo === comment.id && (
                <div className="ml-8 relative">
                  <textarea
                    value={replyText}
                    onChange={(e) => handleTextChange(e.target.value, true)}
                    placeholder="Yanıt yazın..."
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none pr-12"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSendReply(comment.id)}
                    disabled={!replyText.trim() || sending}
                    className="absolute bottom-2 right-2 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
