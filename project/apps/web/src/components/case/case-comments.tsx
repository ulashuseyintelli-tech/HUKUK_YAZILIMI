'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
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
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
    loadUsers();
  }, [caseId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/comments`);
      setComments(res.data?.data || []);
    } catch (e) {
      // Demo data
      setComments([
        {
          id: '1',
          text: 'Borçlu ile iletişime geçildi, ödeme planı görüşülecek.',
          user: 'Av. Mehmet',
          userId: 'user-1',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          mentions: [],
          replies: [
            {
              id: '1-1',
              text: '@Admin Ödeme planı onaylandı mı?',
              user: 'Muhasebe',
              userId: 'user-2',
              timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              mentions: ['Admin'],
              replies: [],
              parentId: '1',
            },
          ],
        },
        {
          id: '2',
          text: 'Haciz talebi hazırlandı, @Av. Mehmet onayınıza sunulmuştur.',
          user: 'Admin',
          userId: 'user-3',
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          mentions: ['Av. Mehmet'],
          replies: [],
        },
      ]);
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
      // Demo users
      setUsers([
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Av. Mehmet' },
        { id: '3', name: 'Muhasebe' },
      ]);
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setSending(true);

    const mentions = extractMentions(newComment);

    try {
      await api.post(`/cases/${caseId}/comments`, {
        text: newComment,
        mentions,
      });
      loadComments();
    } catch (e) {
      // Demo: add locally
      const comment: Comment = {
        id: Date.now().toString(),
        text: newComment,
        user: 'Ben',
        userId: 'current-user',
        timestamp: new Date().toISOString(),
        mentions,
        replies: [],
      };
      setComments(prev => [comment, ...prev]);
    } finally {
      setSending(false);
      setNewComment('');
    }
  };

  const handleSendReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    setSending(true);

    const mentions = extractMentions(replyText);

    try {
      await api.post(`/cases/${caseId}/comments/${parentId}/reply`, {
        text: replyText,
        mentions,
      });
      loadComments();
    } catch (e) {
      // Demo: add locally
      const reply: Comment = {
        id: Date.now().toString(),
        text: replyText,
        user: 'Ben',
        userId: 'current-user',
        timestamp: new Date().toISOString(),
        mentions,
        replies: [],
        parentId,
      };
      setComments(prev => prev.map(c => 
        c.id === parentId 
          ? { ...c, replies: [...c.replies, reply] }
          : c
      ));
    } finally {
      setSending(false);
      setReplyText('');
      setReplyingTo(null);
    }
  };

  const handleDeleteComment = async (commentId: string, parentId?: string) => {
    if (!confirm('Bu yorumu silmek istediğinize emin misiniz?')) return;

    try {
      await api.delete(`/cases/${caseId}/comments/${commentId}`);
    } catch (e) {
      // Demo: remove locally
    }

    if (parentId) {
      setComments(prev => prev.map(c => 
        c.id === parentId 
          ? { ...c, replies: c.replies.filter(r => r.id !== commentId) }
          : c
      ));
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
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
