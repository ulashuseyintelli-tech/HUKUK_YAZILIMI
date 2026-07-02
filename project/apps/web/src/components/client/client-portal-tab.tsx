'use client';

/**
 * ClientPortalTab — Portal erişimi (Task 10A Seçenek A → A2B Seçenek B).
 *
 * A2B: create/disable artık burada (Client Workspace Portal sekmesi), legacy
 * `PortalAccessModal` (settings/clients) SİLİNMEDİ — ayrıca kalır, tekrar
 * kullanılmaz (JSX/mantık taşındı, kopyalanmadı). API endpoint'leri değişmedi:
 * POST /portal/admin/create-user, POST /portal/admin/disable-user (Task 10-S
 * capability-gate + audit backend'de; davranış değişmedi).
 *
 * Governance UX: backend yetkisi (PARTNER/yetkilendirilmiş avukat) client-side
 * proaktif gizlenmiyor — bu, geçerli kullanıcının capability durumunu FE'ye
 * taşıyacak yeni bir /auth/me alanı gerektirir (global auth altyapısı, Portal
 * kapsamı dışı — owner kararı gerekirse ayrı iş). Bunun yerine: sabit bir
 * politika notu her zaman gösterilir + 403 durumunda backend'in okunabilir
 * hata mesajı inline gösterilir (generic alert YOK).
 */
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/api';

export interface ClientPortalTabProps {
  clientId: string;
  hasPortalAccess?: boolean;
  portalUser?: { email: string; lastLoginAt: string | null; loginCount: number } | null;
  onChanged: () => void;
}

function portalErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'hiç giriş yapılmadı';
  try {
    return new Date(value).toLocaleString('tr-TR');
  } catch {
    return value;
  }
}

export function ClientPortalTab({ clientId, hasPortalAccess, portalUser, onChanged }: ClientPortalTabProps) {
  const active = !!hasPortalAccess;
  const [email, setEmail] = useState(portalUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleEnable = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError('E-posta ve şifre zorunludur.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.enablePortalAccess(clientId, email.trim(), password);
      setPassword('');
      onChanged();
    } catch (err) {
      setError(portalErrorMessage(err, 'Portal erişimi oluşturulamadı.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (busy) return;
    if (!confirm('Portal erişimini kaldırmak istediğinize emin misiniz?')) return;
    setBusy(true);
    setError('');
    try {
      await api.disablePortalAccess(clientId);
      onChanged();
    } catch (err) {
      setError(portalErrorMessage(err, 'Portal erişimi kaldırılamadı.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center gap-3 rounded-lg border p-4 ${
          active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        {active ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-gray-400" />
        )}
        <div>
          <p className={`text-sm font-medium ${active ? 'text-green-700' : 'text-gray-600'}`}>
            Portal Erişimi: {active ? 'Aktif' : 'Pasif'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {active
              ? 'Bu müvekkil portala giriş yapabilir.'
              : 'Bu müvekkil için portal erişimi henüz açılmamış.'}
          </p>
        </div>
      </div>

      {active && portalUser && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 space-y-1">
          <p>
            <span className="text-gray-500">E-posta:</span> {portalUser.email}
          </p>
          <p>
            <span className="text-gray-500">Son giriş:</span> {formatDateTime(portalUser.lastLoginAt)}
          </p>
          <p>
            <span className="text-gray-500">Toplam giriş:</span> {portalUser.loginCount}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {active ? (
        <button
          type="button"
          onClick={handleDisable}
          disabled={busy}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? 'Kaldırılıyor...' : 'Portal Erişimini Kaldır'}
        </button>
      ) : (
        <form onSubmit={handleEnable} className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-gray-600">
            Bu müvekkil için portal hesabı oluşturun. Müvekkil bu bilgilerle portala giriş yapabilecek.
          </p>
          <label className="block text-xs font-medium text-gray-700">
            E-posta
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Şifre
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              minLength={6}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {busy ? 'Oluşturuluyor...' : 'Portal Erişimini Aç'}
          </button>
        </form>
      )}

      <p className="text-xs text-gray-400">
        Bu işlemi yalnız PARTNER veya yetkilendirilmiş avukat yapabilir.
      </p>
    </div>
  );
}
